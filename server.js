require('dotenv').config();

const express = require('express');
const riderRoutes = require('./routes/riderRoutes');
const bikeAssignmentRoutes = require('./routes/bikeAssignmentRoutes'); 
const bikeReturnRoutes = require('./routes/bikeReturnRoutes');
const bikeAssignmentHistoryRoutes = require("./routes/bikeAssignmentHistoryRoutes");
const riderController = require('./controllers/riderController');
const dailyKmRoutes = require('./routes/dailyKmRoutes');
const billingRoutes = require('./routes/billingRoutes');
const AppError = require('./errors/AppError');
const mapDatabaseError = require('./errors/mapDatabaseError');
const { validateRiderQuery } = require('./middleware/validateRiderQuery');
const { validateCreateRider } = require('./middleware/validateCreateRider');
const { validateUpdateRider } = require('./middleware/validateUpdateRider');
const {pool} = require('./db');
const app  = express();

app.use(express.json());
app.use('/api/riders', riderRoutes);
app.use('/api/bike-assignments', bikeAssignmentRoutes);
app.use('/api/bikes', bikeReturnRoutes);
app.use('/api/bikes', bikeAssignmentHistoryRoutes);
app.use('/api/daily-km', dailyKmRoutes);
app.use('/api/billing', billingRoutes);

app.get('/health', (req, res) => {
    res.json({message: 'Rider API is Running' });
});

// create the New Rider
app.post(
    '/api/riders',
    validateCreateRider,
    riderController.createRider
);

// Get the Specific Rider Details
app.get('/api/riders/:riderId', riderController.getRider);

// Get All Riders
app.get(
    '/api/riders',
    validateRiderQuery,
    riderController.getRiders
);

// Update  Rider
app.put(
    '/api/riders/:riderId',
    validateUpdateRider,
    riderController.updateRider
);

// Delete A Rider
app.delete(
    '/api/riders/:riderId',
    riderController.terminateRider
);

app.get('/api/test-error', (req, res, next) => {
    next(new Error('Sensitive database details'));
});

// Centralized Error Handler
app.use((error, req, res, next) => {
    console.error('API Error:', error);

    if (res.headersSent) {
        return next(error);
    }

    // 1. Handle known application errors.
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            error: error.message
        });
    }

    // 2. Handle recognized PostgreSQL errors.
    const databaseError = mapDatabaseError(error);

    if (databaseError) {
        return res.status(databaseError.statusCode).json({
            error: databaseError.message
        });
    }

    // 3. Handle unexpected errors safely.
    return res.status(500).json({
        error: 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on Port ${PORT}`);
});
