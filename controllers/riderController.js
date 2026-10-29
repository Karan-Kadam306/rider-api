const riderService = require('../services/riderService');

// GET /api/riders/:riderId
// Get the details of a specific rider by their ID.
async function getRider(req, res, next) {
    try {
        const { riderId } = req.params;

        const rider = await riderService.getRiderById(riderId);

        if (!rider) {
            return res.status(404).json({
                error: 'Rider Not Found'
            });
        }

        return res.status(200).json({ rider });
    } catch (error) {
        return next(error);
    }
}

// GET /api/riders
// Get a paginated list of riders with optional search and status filters.
async function getRiders(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const search = String(req.query.search ?? '').trim();
        const status = String(req.query.status || 'Active').trim();

        const sortBy = String(req.query.sortBy ?? 'created_at');
        const order = String(req.query.order ?? 'desc').toLowerCase();

        const allowedSortColumns = {
            name: 'name',
            status: 'status',
            created_at: 'created_at'
        };

        const sortColumn = allowedSortColumns[sortBy];
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        // Build parameterized search and status filters.
        const conditions = [];
        const values = [];

        if (search) {
            values.push(`%${search}%`);
            conditions.push(
                `(rider_id ILIKE $${values.length}
                  OR name ILIKE $${values.length}
                  OR phone ILIKE $${values.length})`
            );
        }

        if (status) {
            values.push(status);
            conditions.push(`status = $${values.length}`);
        }

        const whereClause = conditions.length
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        const offset = (page - 1) * limit;

        const { totalRecords, riders } =
            await riderService.getRiders({
                whereClause,
                values,
                sortColumn,
                sortOrder,
                limit,
                offset
            });

        return res.status(200).json({
            pagination: {
                page,
                limit,
                offset,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit)
            },
            count: riders.length,
            riders
        });
    } catch (error) {
        return next(error);
    }
}

// Create Rider 
// POST /api/riders
async function createRider(req, res, next) {
    try {
        const { rider_id, name, phone } = req.body;

        const rider = await riderService.createRider({
            rider_id,
            name,
            phone
        });

        return res.status(201).json({ rider });
    } catch (error) {
        return next(error);
    }
}

// Update Rider
// PATCH /api/riders/:riderId
async function updateRider(req, res, next) {
    try {
        const { riderId } = req.params;
        const { name, phone, status } = req.body;

        const result = await riderService.updateRider({
            riderId,
            name: name.trim(),
            phone: phone.trim(),
            status: status.trim()
        });

        if (result.type === 'not_found') {
            return res.status(404).json({
                error: 'Rider not found'
            });
        }

        if (result.type === 'already_terminated') {
            return res.status(409).json({
                error: 'Cannot update a terminated rider',
                rider: result.rider
            });
        }

        if (result.type === 'conflict') {
            return res.status(409).json({
                error: 'Rider status changed during update. Please try again.'
            });
        }

        return res.status(200).json({
            message: 'Rider updated successfully',
            rider: result.rider
        });
    } catch (error) {
        return next(error);
    }
}

// Terminate a rider
// DELETE /api/riders/:riderId
async function terminateRider(req, res, next) {
    try {
        const { riderId } = req.params;

        const result = await riderService.terminateRider(riderId);

        if (result.type === 'not_found') {
            return res.status(404).json({
                error: 'Rider not found'
            });
        }

        if (result.type === 'already_terminated') {
            return res.status(409).json({
                error: 'Rider is already terminated',
                rider: result.rider
            });
        }

        if (result.type === 'conflict') {
            return res.status(409).json({
                error: 'Rider status changed during termination. Please try again.'
            });
        }

        return res.status(200).json({
            message: 'Rider terminated successfully',
            rider: result.rider,
            returnedAssignment: result.returnedAssignment
        });
    } catch (error) {
        return next(error);
    }
}

// GET /api/riders/summary
// Get a summary of riders grouped by their status.
async function getRiderSummary(req, res, next) {
    try {
        const summary = await riderService.getRiderStatusSummary();

        return res.status(200).json({
            summary
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getRider,
    getRiders,
    createRider,
    updateRider,
    terminateRider,
    getRiderSummary
};
