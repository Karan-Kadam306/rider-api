const { pool } = require("../db");
const AppError = require("../errors/AppError");
const bikeAssignmentRepository = require("../repositories/bikeAssignmentRepository");

async function getBikeAssignmentHistory(bikeId, page = 1, limit = 10) {
    if(
        bikeId == null ||
        !String(bikeId).trim() ||
        !Number.isSafeInteger(Number(bikeId)) ||
        Number(bikeId) <= 0
    ) {
        throw new AppError("A valid bikeID is required", 400);
    }

    if(
        !Number.isSafeInteger(Number(page)) ||
        Number(page) < 1 ||
        !Number.isSafeInteger(Number(limit)) ||
        Number(limit) < 1 ||
        Number(limit) > 100
    ) {
        throw new AppError(
            "Page must be a positive integer and the page limit must be less than 100",
            400
        );
    }

    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;

    const result = await pool.query(
        `SELECT bike_id, registration_number
        FROM bikes
        WHERE bike_id = $1`,
        [bikeId]
    );

    const bike = result.rows[0];

    if(!bike) {
        throw new AppError("Bike Not Found", 404);
    }

    const historyRows = await bikeAssignmentRepository.findAssignmentHistory(
        pool,
        bikeId,
        limit,
        offset
    );

    const totalRecords = 
        await bikeAssignmentRepository.countAssignmentHistory(
            pool,
            bikeId
        );

    const totalPages = Math.ceil(totalRecords / limit);

    const history = historyRows.map((row) => ({
        assignmentId: row.assignment_id,
        bikeId: row.bike_id,
        registrationNumber: row.registration_number,
        riderId: row.rider_id,
        riderName: row.rider_name,
        assignedAt: row.assigned_at,
        returnedAt: row.returned_at
    }));

    return {
        bike: {
            bikeId: bike.bike_id,
            registrationNumber: bike.registration_number
        },
        pagination: {
            page,
            limit,
            offset,
            totalRecords,
            totalPages
        },
        history
    };
}

module.exports = { getBikeAssignmentHistory };
