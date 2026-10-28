const express = require('express');
const riderRoutes = require('./routes/riderRoutes');
const bikeAssignmentRoutes = require('./routes/bikeAssignmentRoutes');
const bikeReturnRoutes = require('./routes/bikeReturnRoutes');
const bikeRoutes = require('./routes/bikeRoutes');
const bikeAssignmentHistoryRoutes = require("./routes/bikeAssignmentHistoryRoutes");
const riderController = require('./controllers/riderController');
const dailyKmRoutes = require('./routes/dailyKmRoutes');
const billingRoutes = require('./routes/billingRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { validateRiderQuery } = require('./middleware/validateRiderQuery');
const { validateCreateRider } = require('./middleware/validateCreateRider');
const { validateUpdateRider } = require('./middleware/validateUpdateRider');
const app  = express();

app.use(express.json());
app.use('/api/riders', riderRoutes);
app.use('/api/bike-assignments', bikeAssignmentRoutes);
app.use('/api/bikes', bikeRoutes);
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

app.use(errorHandler);

module.exports = app;
