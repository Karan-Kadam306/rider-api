const express = require('express');
const helmet = require('helmet');
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
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const { requireAuth } = require('./middleware/requireAuth');
const { rejectCrossSite } = require('./middleware/rejectCrossSite');
const AppError = require('./errors/AppError');
const { errorHandler } = require('./middleware/errorHandler');
const app  = express();

// Behind a reverse proxy, req.ip must come from X-Forwarded-For (used to limit sign-in attempts).
// TRUST_PROXY is the number of proxies in front of the app, e.g. 1. Unset: no proxy is trusted.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || false);

// Security headers (no sniffing, no framing, strict CSP, ...); also removes X-Powered-By.
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// The admin panel is served from the same origin, so no CORS headers are sent:
// browsers block other sites from reading API responses.
app.use('/api', rejectCrossSite);

// Sign-in routes are public; every other /api route needs a session.
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);

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
app.use('/api/users', userRoutes);

// Unknown API paths get a JSON 404 instead of Express's HTML page.
app.use('/api', (req, res, next) => {
    next(new AppError('Route not found', 404));
});

app.get('/health', (req, res) => {
    res.json({message: 'Rider API is Running' });
});

app.use(errorHandler);

module.exports = app;
