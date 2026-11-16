const { pool } = require('../../db');
const AppError = require('../../errors/AppError');
const partnerRepository = require('../../repositories/partnerRepository');
const partnerEarningsService = require('../partnerEarningsService');
const { normalizePartnerRiderId, MAX_PARTNER_RIDER_ID_LENGTH } = require('../partnerMappingService');
const validateUsageDate = require('../../utils/validateUsageDate');
const formats = require('./partnerFormats');

// A plain amount, negative for a partner penalty. Up to 8 digits before the point and 2 after,
// so it always fits numeric(10,2). A format with thousands commas gives its own amountPattern.
const PLAIN_AMOUNT_PATTERN = /^-?\d{1,8}(\.\d{1,2})?$/;

// Today's date in IST as YYYY-MM-DD.
function todayInIst() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// The amount as a plain number string ("1,250.50" -> "1250.50"), or null if it is not one.
function readAmount(format, text) {
    if (!(format.amountPattern ?? PLAIN_AMOUNT_PATTERN).test(text)) {
        return null;
    }

    const plain = text.replaceAll(',', '');
    return PLAIN_AMOUNT_PATTERN.test(plain) ? plain : null;
}

// Read one sheet row into { entry } or { error }.
// An error keeps the partner ID and date when they could be read, so a later file with that row can clear it.
function readRow(format, row, today = todayInIst()) {
    const idText = row[format.idColumn] ?? '';
    const amountText = row[format.amountColumn] ?? '';
    const readDate = format.readDate(row);

    const partnerRiderId = idText && idText.length <= MAX_PARTNER_RIDER_ID_LENGTH
        ? normalizePartnerRiderId(idText)
        : null;
    const earningDate = readDate && validateUsageDate(readDate) && readDate <= today ? readDate : null;
    const fail = message => ({ error: { message, partnerRiderId, earningDate } });

    if (!idText) {
        return fail(`${format.idColumn} is required`);
    }

    if (!partnerRiderId) {
        return fail(`${format.idColumn} must be ${MAX_PARTNER_RIDER_ID_LENGTH} characters or fewer`);
    }

    if (!readDate || !validateUsageDate(readDate)) {
        return fail(format.dateError);
    }

    if (!earningDate) {
        return fail(`${format.dateColumn} cannot be in the future`);
    }

    if (!amountText) {
        return fail(`${format.amountColumn} is required`);
    }

    const amount = readAmount(format, amountText);

    if (amount === null) {
        return fail(`${format.amountColumn} must be an amount like ${format.amountExample ?? '850.50'}`);
    }

    return {
        entry: {
            partnerRiderId,
            nameInFile: format.nameColumn ? row[format.nameColumn] || null : null,
            earningDate,
            amount
        }
    };
}

// Partner earnings import: Document Hub asks for the partner, and the partner decides the file format.
module.exports = {
    key: 'partner_earnings',
    label: 'Partner Earnings',
    requiresWorkDate: false,
    requiresPartner: true,
    requiredColumns: [],

    // Partners that have a known file format, for the Document Hub dropdown.
    async getPartners() {
        const partners = await partnerRepository.findPartners(pool);

        return partners
            .filter(partner => formats[partner.code])
            .map(partner => ({
                partnerId: partner.partner_id,
                name: partner.name,
                requiredColumns: formats[partner.code].requiredColumns
            }));
    },

    // Return the import handler for one partner's file, shaped like any other import type.
    async forPartner(partnerId) {
        const partner = Number.isSafeInteger(Number(partnerId)) && Number(partnerId) > 0
            ? await partnerRepository.findPartnerById(pool, { partnerId: Number(partnerId) })
            : null;

        if (!partner) {
            throw new AppError('Choose a valid partner for Partner Earnings', 400);
        }

        const format = formats[partner.code];

        if (!format) {
            throw new AppError(`${partner.name} earnings files are not supported yet`, 400);
        }

        return {
            partnerId: partner.partner_id,
            requiredColumns: format.requiredColumns,

            // Errors are { message, partnerRiderId, earningDate } so they can be traced to the week they block.
            findRowErrors(rows, lineNumbers) {
                const errors = new Map();
                const firstIndexByKey = new Map();
                const today = todayInIst();

                rows.forEach((row, index) => {
                    const { entry, error } = readRow(format, row, today);

                    if (error) {
                        errors.set(index, error);
                        return;
                    }

                    // A second row for the same ID and date would silently overwrite the first.
                    const key = `${entry.partnerRiderId}|${entry.earningDate}`;

                    if (firstIndexByKey.has(key)) {
                        errors.set(index, {
                            message: `${entry.partnerRiderId} already has a row for this date on line ${lineNumbers[firstIndexByKey.get(key)]}`,
                            partnerRiderId: entry.partnerRiderId,
                            earningDate: entry.earningDate
                        });
                    } else {
                        firstIndexByKey.set(key, index);
                    }
                });

                return errors;
            },

            importRows(client, rows, { importId, uploadedBy }) {
                const today = todayInIst();

                return partnerEarningsService.importEarnings(client, {
                    partnerId: partner.partner_id,
                    entries: rows.map(row => readRow(format, row, today).entry),
                    importId,
                    uploadedBy
                });
            }
        };
    }
};
