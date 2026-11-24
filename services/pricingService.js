const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const pricingRepository = require('../repositories/pricingRepository');
const validateUsageDate = require('../utils/validateUsageDate');
const { rateOn } = require('../utils/rateOn');

const PACK_KINDS = ['Weekly', 'TopUp'];
const WEEKLY_PACK_DAYS = 7;

function toRate(row) {
    return {
        rateId: row.rate_id,
        rentalPerDay: row.rental_per_day,
        energyPerKm: row.energy_per_km,
        effectiveFrom: row.effective_from,
        createdBy: row.created_by_name,
        createdAt: row.created_at
    };
}

function toDeposit(row) {
    return {
        depositId: row.deposit_id,
        amount: row.amount,
        effectiveFrom: row.effective_from,
        createdBy: row.created_by_name,
        createdAt: row.created_at
    };
}

function toPack(row) {
    return {
        packId: row.pack_id,
        kind: row.kind,
        name: row.name,
        price: row.price,
        kmIncluded: row.km_included,
        validityDays: row.validity_days,
        isActive: row.is_active,
        createdAt: row.created_at
    };
}

// A rupee amount with at most 2 decimals, between min and max.
function parseAmount(value, field, { min, max, allowZero = false }) {
    const valid = typeof value === 'number'
        && Number.isFinite(value)
        && (allowZero ? value >= min : value > min)
        && value <= max
        && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

    if (!valid) {
        throw new AppError(`${field} must be ${allowZero ? 'at least' : 'more than'} ₹${min} and at most ₹${max}, with up to 2 decimals`, 400);
    }

    return value;
}

function parseWholeNumber(value, field, { min, max }) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new AppError(`${field} must be a whole number from ${min} to ${max}`, 400);
    }

    return value;
}

function parseId(value, field) {
    if (!/^\d{1,15}$/.test(String(value)) || Number(value) < 1) {
        throw new AppError(`${field} must be a positive whole number`, 400);
    }

    return Number(value);
}

function parseEffectiveFrom(value) {
    if (!validateUsageDate(value)) {
        throw new AppError('effectiveFrom must be a date in YYYY-MM-DD format', 400);
    }

    return value;
}

// Postpaid rates, oldest first, for billing (see utils/rateOn.js).
async function getPostpaidRates(client = pool) {
    const rows = await pricingRepository.findPostpaidRates(client);
    return rows.map(toRate);
}

// Everything the Configuration page shows. History lists are newest first.
async function getPricing() {
    const [rateRows, depositRows, packRows, { today }] = await Promise.all([
        pricingRepository.findPostpaidRates(pool),
        pricingRepository.findDepositAmounts(pool),
        pricingRepository.findPrepaidPacks(pool),
        pricingRepository.findPricingDates(pool)
    ]);

    const rates = rateRows.map(toRate);
    const deposits = depositRows.map(toDeposit);
    const currentDeposit = deposits.filter(deposit => deposit.effectiveFrom <= today).at(-1) ?? null;

    return {
        today,
        currentPostpaidRate: rateOn(rates, today),
        postpaidRates: [...rates].reverse(),
        currentDeposit,
        depositAmounts: [...deposits].reverse(),
        prepaidPacks: packRows.map(toPack)
    };
}

// A new rate applies from effectiveFrom to everyone on postpaid. It must start after the newest rate,
// and after the last closed or paid-out week, so bills already settled never change.
async function addPostpaidRate({ rentalPerDay, energyPerKm, effectiveFrom, actingUserId }) {
    const rental = parseAmount(rentalPerDay, 'rentalPerDay', { min: 0, max: 10000 });
    const energy = parseAmount(energyPerKm, 'energyPerKm', { min: 0, max: 1000, allowZero: true });
    const startDate = parseEffectiveFrom(effectiveFrom);

    return inTransaction(async client => {
        // One change at a time, so two admins cannot both pass the "after the newest rate" check.
        await client.query('LOCK TABLE postpaid_rates IN EXCLUSIVE MODE');

        const [rates, { first_open_date: firstOpenDate }] = await Promise.all([
            pricingRepository.findPostpaidRates(client),
            pricingRepository.findPricingDates(client)
        ]);
        const newest = rates.at(-1);

        if (startDate <= newest.effective_from) {
            throw new AppError(`The new rate must start after ${newest.effective_from}, when the newest rate starts`, 409);
        }

        if (firstOpenDate && startDate < firstOpenDate) {
            throw new AppError(`Weeks before ${firstOpenDate} are already closed or paid out; start the new rate on or after it`, 409);
        }

        const rateId = await pricingRepository.insertPostpaidRate(client, {
            rentalPerDay: rental,
            energyPerKm: energy,
            effectiveFrom: startDate,
            createdBy: actingUserId
        });

        return toRate(await pricingRepository.findPostpaidRateById(client, { rateId }));
    });
}

// Only a rate that has not started yet can be removed, e.g. one scheduled by mistake.
async function removePostpaidRate({ rateId }) {
    const id = parseId(rateId, 'rateId');

    return inTransaction(async client => {
        await client.query('LOCK TABLE postpaid_rates IN EXCLUSIVE MODE');

        const [rate, { today }] = await Promise.all([
            pricingRepository.findPostpaidRateById(client, { rateId: id }),
            pricingRepository.findPricingDates(client)
        ]);

        if (!rate) {
            throw new AppError('Rate not found', 404);
        }

        if (rate.effective_from <= today) {
            throw new AppError('This rate is already in effect, so it cannot be removed. Add a new rate instead', 409);
        }

        await pricingRepository.deletePostpaidRate(client, { rateId: id });
    });
}

// The deposit is charged when a rider pays it, so a new amount starts today or later.
async function addDepositAmount({ amount, effectiveFrom, actingUserId }) {
    const value = parseAmount(amount, 'amount', { min: 0, max: 100000 });
    const startDate = parseEffectiveFrom(effectiveFrom);

    return inTransaction(async client => {
        await client.query('LOCK TABLE deposit_amounts IN EXCLUSIVE MODE');

        const [deposits, { today }] = await Promise.all([
            pricingRepository.findDepositAmounts(client),
            pricingRepository.findPricingDates(client)
        ]);
        const newest = deposits.at(-1);

        if (startDate < today) {
            throw new AppError('A new deposit amount cannot start in the past', 400);
        }

        if (newest && startDate <= newest.effective_from) {
            throw new AppError(`The new amount must start after ${newest.effective_from}, when the newest amount starts`, 409);
        }

        const depositId = await pricingRepository.insertDepositAmount(client, {
            amount: value,
            effectiveFrom: startDate,
            createdBy: actingUserId
        });

        return toDeposit(await pricingRepository.findDepositAmountById(client, { depositId }));
    });
}

async function removeDepositAmount({ depositId }) {
    const id = parseId(depositId, 'depositId');

    return inTransaction(async client => {
        await client.query('LOCK TABLE deposit_amounts IN EXCLUSIVE MODE');

        const [deposit, { today }] = await Promise.all([
            pricingRepository.findDepositAmountById(client, { depositId: id }),
            pricingRepository.findPricingDates(client)
        ]);

        if (!deposit) {
            throw new AppError('Deposit amount not found', 404);
        }

        if (deposit.effective_from <= today) {
            throw new AppError('This amount is already in effect, so it cannot be removed. Add a new amount instead', 409);
        }

        await pricingRepository.deleteDepositAmount(client, { depositId: id });
    });
}

function cleanPackName(name) {
    const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';

    if (!clean || clean.length > 100) {
        throw new AppError('name is required (at most 100 characters)', 400);
    }

    return clean;
}

// A weekly pack always lasts 7 days; a top-up lasts 1 to 7.
function parseValidityDays(kind, validityDays) {
    if (kind === 'Weekly') {
        if (validityDays !== undefined && validityDays !== WEEKLY_PACK_DAYS) {
            throw new AppError(`A weekly pack always lasts ${WEEKLY_PACK_DAYS} days`, 400);
        }

        return WEEKLY_PACK_DAYS;
    }

    return parseWholeNumber(validityDays, 'validityDays', { min: 1, max: WEEKLY_PACK_DAYS });
}

// A price change applies to packs bought after it; purchases keep the price they were bought at.
async function createPrepaidPack({ kind, name, price, kmIncluded, validityDays, actingUserId }) {
    if (!PACK_KINDS.includes(kind)) {
        throw new AppError(`kind must be one of: ${PACK_KINDS.join(', ')}`, 400);
    }

    const row = await pricingRepository.insertPrepaidPack(pool, {
        kind,
        name: cleanPackName(name),
        price: parseAmount(price, 'price', { min: 0, max: 100000 }),
        kmIncluded: parseWholeNumber(kmIncluded, 'kmIncluded', { min: 1, max: 10000 }),
        validityDays: parseValidityDays(kind, validityDays),
        createdBy: actingUserId
    });

    return toPack(row);
}

// Fields left out keep their value; the kind cannot change. Inactive packs cannot be bought.
async function updatePrepaidPack({ packId, name, price, kmIncluded, validityDays, isActive }) {
    const id = parseId(packId, 'packId');

    if (isActive !== undefined && typeof isActive !== 'boolean') {
        throw new AppError('isActive must be true or false', 400);
    }

    return inTransaction(async client => {
        const pack = await pricingRepository.findPrepaidPackById(client, { packId: id, forUpdate: true });

        if (!pack) {
            throw new AppError('Pack not found', 404);
        }

        const updated = await pricingRepository.updatePrepaidPack(client, {
            packId: id,
            name: name === undefined ? pack.name : cleanPackName(name),
            price: price === undefined ? pack.price : parseAmount(price, 'price', { min: 0, max: 100000 }),
            kmIncluded: kmIncluded === undefined
                ? pack.km_included
                : parseWholeNumber(kmIncluded, 'kmIncluded', { min: 1, max: 10000 }),
            validityDays: validityDays === undefined ? pack.validity_days : parseValidityDays(pack.kind, validityDays),
            isActive: isActive ?? pack.is_active
        });

        return toPack(updated);
    });
}

module.exports = {
    getPostpaidRates,
    getPricing,
    addPostpaidRate,
    removePostpaidRate,
    addDepositAmount,
    removeDepositAmount,
    createPrepaidPack,
    updatePrepaidPack
};
