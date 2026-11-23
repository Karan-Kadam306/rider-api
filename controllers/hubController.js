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

// POST /api/hubs — admins. Body: { name, city, address, contactPhone? }
async function createHub(req, res, next) {
    try {
        const { name, city, address, contactPhone } = req.body ?? {};
        const hub = await hubService.createHub({ name, city, address, contactPhone });

        return res.status(201).json({ message: 'Hub created', hub });
    } catch (error) {
        return next(error);
    }
}

// PATCH /api/hubs/:hubId — admins. Body: any of { name, city, address, contactPhone, isActive }
async function updateHub(req, res, next) {
    try {
        const { name, city, address, contactPhone, isActive } = req.body ?? {};
        const hub = await hubService.updateHub({
            hubId: req.params.hubId,
            name,
            city,
            address,
            contactPhone,
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
