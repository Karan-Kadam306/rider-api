const hubService = require('../services/hubService');

// GET /api/hubs
async function listHubs(req, res, next) {
    try {
        const hubs = await hubService.listHubs();
        return res.status(200).json({ hubs });
    } catch (error) {
        return next(error);
    }
}

// POST /api/hubs — admins. Body: { code, name, city, address, contactPhone?, managerName? }
async function createHub(req, res, next) {
    try {
        const { code, name, city, address, contactPhone, managerName } = req.body ?? {};
        const hub = await hubService.createHub({ code, name, city, address, contactPhone, managerName });

        return res.status(201).json({ message: 'Hub created', hub });
    } catch (error) {
        return next(error);
    }
}

// PATCH /api/hubs/:hubId — admins. Body: any of { code, name, city, address, contactPhone, managerName, isActive }
async function updateHub(req, res, next) {
    try {
        const { code, name, city, address, contactPhone, managerName, isActive } = req.body ?? {};
        const hub = await hubService.updateHub({
            hubId: req.params.hubId,
            code,
            name,
            city,
            address,
            contactPhone,
            managerName,
            isActive
        });

        return res.status(200).json({ message: 'Hub updated', hub });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listHubs,
    createHub,
    updateHub
};
