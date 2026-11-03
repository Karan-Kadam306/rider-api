const billingService = require('../services/billingService');

// GET /api/billing/riders/:riderId?weekStart=YYYY-MM-DD
// Get the billing information for a specific rider for a given week.
async function getRiderBill(req, res, next) {
    try {
        const bill = await billingService.getRiderBill({
            riderId: req.params.riderId,
            weekStart: req.query.weekStart
        });

        return res.status(200).json({ bill });
    } catch (error) {
        return next(error);
    }
}

// GET /api/billing/summary?weekStart=YYYY-MM-DD
// Get a summary of billing information for all riders for a given week.
async function getWeeklyBillingSummary(req, res, next) {
    try {
        const summary = await billingService.getWeeklyBillingSummary({
            weekStart: req.query.weekStart
        });

        return res.status(200).json({ summary });
    } catch (error) {
        return next(error);
    }
}

// GET /api/billing/bills?weekStart=YYYY-MM-DD&view=needsReview&search=&page=1&limit=20
// One page of the week's bills, with the week totals and per-view counts.
async function listWeeklyBills(req, res, next) {
    const { weekStart, view, search, page, limit } = req.query;

    try {
        const bills = await billingService.listWeeklyBills({
            weekStart,
            view: view ?? 'all',
            search,
            page: page ?? 1,
            limit: limit ?? 20
        });

        return res.status(200).json(bills);
    } catch (error) {
        return next(error);
    }
}

// GET /api/billing/bills/export?weekStart=YYYY-MM-DD&view=&search=
// Download the week's bills as a CSV file.
async function exportWeeklyBills(req, res, next) {
    const { weekStart, view, search } = req.query;

    try {
        const { fileName, csv } = await billingService.exportWeeklyBills({
            weekStart,
            view: view ?? 'all',
            search
        });

        res.attachment(fileName);
        res.type('text/csv; charset=utf-8');

        // BOM so Excel reads the file as UTF-8.
        return res.status(200).send(`﻿${csv}`);
    } catch (error) {
        return next(error);
    }
}

// POST /api/billing/weeks/:weekStart/close
// Close the billing for a specific week, marking it as finalized.
async function closeWeek(req, res, next) {
    try {
        const closure = await billingService.closeWeek({
            weekStart: req.params.weekStart
        });

        return res.status(201).json({
            message: 'Week closed successfully',
            closure
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getRiderBill,
    getWeeklyBillingSummary,
    listWeeklyBills,
    exportWeeklyBills,
    closeWeek
};
