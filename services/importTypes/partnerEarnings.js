const { pool } = require('../../db');
const AppError = require('../../errors/AppError');
const partnerRepository = require('../../repositories/partnerRepository');
const partnerEarningsService = require('../partnerEarningsService');
const { normalizePartnerRiderId, MAX_PARTNER_RIDER_ID_LENGTH } = require('../partnerMappingService');
const validateUsageDate = require('../../utils/validateUsageDate');
const formats = require('./partnerFormats');

// Up to 8 digits before the point and 2 after, so it always fits numeric(10,2).
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

// Read one sheet row into { entry } or { error }.
function readRow(format, row) {
    const idText = row[format.idColumn] ?? '';
    // Zomato writes thousands with commas ("1,250.50"); drop them before checking the amount.
    const amountText = (row[format.amountColumn] ?? '').replaceAll(',', '');
    const earningDate = format.readDate(row);

    if (!idText) {
        return { error: `${format.idColumn} is required` };
    }

    if (idText.length > MAX_PARTNER_RIDER_ID_LENGTH) {
        return { error: `${format.idColumn} must be ${MAX_PARTNER_RIDER_ID_LENGTH} characters or fewer` };
    }

    if (!earningDate || !validateUsageDate(earningDate)) {
        return { error: format.dateError };
    }

    if (!amountText) {
        return { error: `${format.amountColumn} is required` };
    }

    if (!AMOUNT_PATTERN.test(amountText)) {
        return { error: `${format.amountColumn} must be an amount of 0 or more` };
    }

    return {
        entry: {
            partnerRiderId: normalizePartnerRiderId(idText),
            nameInFile: format.nameColumn ? row[format.nameColumn] || null : null,
            earningDate,
            amount: amountText
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

            findRowErrors(rows, lineNumbers) {
                const errors = new Map();
                const firstIndexByKey = new Map();

                rows.forEach((row, index) => {
                    const { entry, error } = readRow(format, row);

                    if (error) {
                        errors.set(index, error);
                        return;
                    }

                    // A second row for the same ID and date would silently overwrite the first.
                    const key = `${entry.partnerRiderId}|${entry.earningDate}`;

                    if (firstIndexByKey.has(key)) {
                        errors.set(index, `${entry.partnerRiderId} already has a row for this date on line ${lineNumbers[firstIndexByKey.get(key)]}`);
                    } else {
                        firstIndexByKey.set(key, index);
                    }
                });

                return errors;
            },

            importRows(client, rows, { importId }) {
                return partnerEarningsService.importEarnings(client, {
                    partnerId: partner.partner_id,
                    entries: rows.map(row => readRow(format, row).entry),
                    importId
                });
            }
        };
    }
};
