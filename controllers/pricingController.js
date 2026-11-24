const pricingService = require('../services/pricingService');

// GET /api/pricing — current values and history for the Configuration page.
async function getPricing(req, res, next) {
    try {
        const pricing = await pricingService.getPricing();
        return res.status(200).json(pricing);
    } catch (error) {
        return next(error);
    }
}

// POST /api/pricing/postpaid-rates — admins. Body: { rentalPerDay, energyPerKm, effectiveFrom }
async function addPostpaidRate(req, res, next) {
    try {
        const { rentalPerDay, energyPerKm, effectiveFrom } = req.body ?? {};
        const rate = await pricingService.addPostpaidRate({
            rentalPerDay,
            energyPerKm,
            effectiveFrom,
            actingUserId: req.user.userId
        });

        return res.status(201).json({ message: 'Rate scheduled', rate });
    } catch (error) {
        return next(error);
    }
}

// DELETE /api/pricing/postpaid-rates/:rateId — admins; only a rate that has not started.
async function removePostpaidRate(req, res, next) {
    try {
        await pricingService.removePostpaidRate({ rateId: req.params.rateId });
        return res.status(200).json({ message: 'Rate removed' });
    } catch (error) {
        return next(error);
    }
}

// POST /api/pricing/deposits — admins. Body: { amount, effectiveFrom }
async function addDepositAmount(req, res, next) {
    try {
        const { amount, effectiveFrom } = req.body ?? {};
        const deposit = await pricingService.addDepositAmount({
            amount,
            effectiveFrom,
            actingUserId: req.user.userId
        });

        return res.status(201).json({ message: 'Deposit amount scheduled', deposit });
    } catch (error) {
        return next(error);
    }
}

// DELETE /api/pricing/deposits/:depositId — admins; only an amount that has not started.
async function removeDepositAmount(req, res, next) {
    try {
        await pricingService.removeDepositAmount({ depositId: req.params.depositId });
        return res.status(200).json({ message: 'Deposit amount removed' });
    } catch (error) {
        return next(error);
    }
}

// POST /api/pricing/packs — admins. Body: { kind, name, price, kmIncluded, validityDays }
async function createPrepaidPack(req, res, next) {
    try {
        const { kind, name, price, kmIncluded, validityDays } = req.body ?? {};
        const pack = await pricingService.createPrepaidPack({
            kind,
            name,
            price,
            kmIncluded,
            validityDays,
            actingUserId: req.user.userId
        });

        return res.status(201).json({ message: 'Pack created', pack });
    } catch (error) {
        return next(error);
    }
}

// PATCH /api/pricing/packs/:packId — admins. Body: any of { name, price, kmIncluded, validityDays, isActive }
async function updatePrepaidPack(req, res, next) {
    try {
        const { name, price, kmIncluded, validityDays, isActive } = req.body ?? {};
        const pack = await pricingService.updatePrepaidPack({
            packId: req.params.packId,
            name,
            price,
            kmIncluded,
            validityDays,
            isActive
        });

        return res.status(200).json({ message: 'Pack updated', pack });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getPricing,
    addPostpaidRate,
    removePostpaidRate,
    addDepositAmount,
    removeDepositAmount,
    createPrepaidPack,
    updatePrepaidPack
};
