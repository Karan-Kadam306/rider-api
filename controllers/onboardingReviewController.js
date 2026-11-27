const { pipeline } = require('stream/promises');
const reviewService = require('../services/onboardingReviewService');
const riderPaymentService = require('../services/riderPaymentService');

// GET /api/onboarding/applications
// Query: tab, hubId, planType, includeTest, search, page, limit. Also returns every tab's count.
async function listApplications(req, res, next) {
    try {
        const { tab, hubId, planType, includeTest, search, page, limit } = req.query;
        const filters = { hubId, planType, includeTest, search };

        const [list, counts] = await Promise.all([
            reviewService.listApplications({ tab, page, limit, ...filters }),
            reviewService.getTabCounts(filters)
        ]);

        return res.status(200).json({ ...list, counts });
    } catch (error) {
        return next(error);
    }
}

// GET /api/onboarding/applications/counts — the tab badges alone, with the same filters.
async function getTabCounts(req, res, next) {
    try {
        const { hubId, planType, includeTest, search } = req.query;
        const counts = await reviewService.getTabCounts({ hubId, planType, includeTest, search });

        return res.status(200).json({ counts });
    } catch (error) {
        return next(error);
    }
}

// GET /api/onboarding/applications/:applicationId
async function getApplication(req, res, next) {
    try {
        const application = await reviewService.getApplication(req.params.applicationId);
        return res.status(200).json({ application });
    } catch (error) {
        return next(error);
    }
}

// GET /api/onboarding/applications/:applicationId/files/:fileId
// Streams one uploaded file. Every view is logged; the browser must not cache it.
async function getFile(req, res, next) {
    try {
        const { mimeType, stream } = await reviewService.openFile({
            applicationId: req.params.applicationId,
            fileId: req.params.fileId,
            userId: req.user.userId,
            ip: req.ip
        });

        res.set({ 'Content-Type': mimeType, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' });
        await pipeline(stream, res);
    } catch (error) {
        // Once the file has started streaming, the response can only be cut short.
        return res.headersSent ? res.destroy(error) : next(error);
    }
}

// PATCH /api/onboarding/applications/:applicationId/items/:item
// Body: { status: 'Verified' | 'Rejected', reason } — reason is required to reject.
async function reviewItem(req, res, next) {
    try {
        const { status, reason } = req.body ?? {};
        const application = await reviewService.reviewItem({
            applicationId: req.params.applicationId,
            item: req.params.item,
            status,
            reason,
            userId: req.user.userId
        });

        return res.status(200).json({ application });
    } catch (error) {
        return next(error);
    }
}

// POST /api/onboarding/applications/:applicationId/hold — Body: { reason }
async function hold(req, res, next) {
    try {
        const application = await reviewService.hold({
            applicationId: req.params.applicationId,
            reason: req.body?.reason,
            userId: req.user.userId
        });

        return res.status(200).json({ application });
    } catch (error) {
        return next(error);
    }
}

// POST /api/onboarding/applications/:applicationId/release
async function release(req, res, next) {
    try {
        const application = await reviewService.release({
            applicationId: req.params.applicationId,
            userId: req.user.userId
        });

        return res.status(200).json({ application });
    } catch (error) {
        return next(error);
    }
}

// POST /api/onboarding/applications/:applicationId/request-changes — Body: { steps, note }
async function requestChanges(req, res, next) {
    try {
        const { steps, note } = req.body ?? {};
        const application = await reviewService.requestChanges({
            applicationId: req.params.applicationId,
            steps,
            note,
            userId: req.user.userId
        });

        return res.status(200).json({ application });
    } catch (error) {
        return next(error);
    }
}

// POST /api/onboarding/applications/:applicationId/reject — Body: { reason }
async function reject(req, res, next) {
    try {
        const application = await reviewService.reject({
            applicationId: req.params.applicationId,
            reason: req.body?.reason,
            userId: req.user.userId
        });

        return res.status(200).json({ application });
    } catch (error) {
        return next(error);
    }
}

// POST /api/onboarding/applications/:applicationId/approve
// Body: { hubId, teamLeaderIds?, mappings?: [{ partnerId, partnerRiderId }], note? }
async function approve(req, res, next) {
    try {
        const { hubId, teamLeaderIds, mappings, note } = req.body ?? {};
        const application = await reviewService.approve({
            applicationId: req.params.applicationId,
            hubId,
            teamLeaderIds,
            mappings,
            note,
            user: req.user
        });

        return res.status(200).json({ message: `Approved as rider ${application.riderId}`, application });
    } catch (error) {
        return next(error);
    }
}

// POST /api/onboarding/applications/:applicationId/mark-paid (admins only)
// Body: { purpose: 'Deposit' | 'PrepaidPack', reference, note? }. reference is the bank or UPI reference.
async function markPaid(req, res, next) {
    try {
        const { purpose, reference, note } = req.body ?? {};
        const applicationId = await riderPaymentService.markPaidManually({
            applicationId: req.params.applicationId,
            purpose,
            reference,
            note,
            userId: req.user.userId
        });
        const application = await reviewService.getApplication(applicationId);

        return res.status(200).json({ message: 'Marked as paid', application });
    } catch (error) {
        return next(error);
    }
}

// GET /api/onboarding/approval-options — active hubs, team leaders and partners for the approval dialog.
async function getApprovalOptions(req, res, next) {
    try {
        return res.status(200).json(await reviewService.getApprovalOptions());
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listApplications,
    getTabCounts,
    getApplication,
    getFile,
    reviewItem,
    hold,
    release,
    requestChanges,
    reject,
    approve,
    markPaid,
    getApprovalOptions
};
