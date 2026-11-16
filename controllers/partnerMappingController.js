const partnerMappingService = require('../services/partnerMappingService');

// GET /api/partners
async function listPartners(req, res, next) {
    try {
        const partners = await partnerMappingService.getPartners();

        return res.status(200).json({ count: partners.length, partners });
    } catch (error) {
        return next(error);
    }
}

// GET /api/partner-mappings?view=unmapped|mapped&status=&search=&page=&limit=
async function listRiderMappings(req, res, next) {
    try {
        const { view, status, search, page, limit } = req.query;
        const result = await partnerMappingService.listRiderMappings({ view, status, search, page, limit });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/partner-mappings/riders/:riderId
// Body: { mappings: [{ partnerId, partnerRiderId }], currentMappingIds? } — the rider's full list; an empty
// list unmaps them. currentMappingIds are the mapping IDs the editor showed, to refuse a save over a newer one.
async function saveRiderMappings(req, res, next) {
    try {
        const result = await partnerMappingService.saveRiderMappings({
            actingUserId: req.user.userId,
            actingUserRole: req.user.role,
            riderId: req.params.riderId,
            mappings: req.body?.mappings,
            currentMappingIds: req.body?.currentMappingIds
        });

        return res.status(200).json({ message: 'Mappings saved', ...result });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listPartners,
    listRiderMappings,
    saveRiderMappings
};
