const express = require('express');
const riderRoutes = require('./routes/riderRoutes');
const bikeAssignmentRoutes = require('./routes/bikeAssignmentRoutes');
const bikeReturnRoutes = require('./routes/bikeReturnRoutes');
const bikeRoutes = require('./routes/bikeRoutes');
const bikeAssignmentHistoryRoutes = require("./routes/bikeAssignmentHistoryRoutes");
const dailyKmRoutes = require('./routes/dailyKmRoutes');
const billingRoutes = require('./routes/billingRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const importRoutes = require('./routes/importRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const app  = express();

app.use(express.json());
app.use('/api/riders', riderRoutes);
app.use('/api/bike-assignments', bikeAssignmentRoutes);
app.use('/api/bikes', bikeRoutes);
app.use('/api/bikes', bikeReturnRoutes);
app.use('/api/bikes', bikeAssignmentHistoryRoutes);
app.use('/api/daily-km', dailyKmRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/payouts', payoutRoutes);

app.get('/health', (req, res) => {
    res.json({message: 'Rider API is Running' });
});

app.use(errorHandler);

module.exports = app;
