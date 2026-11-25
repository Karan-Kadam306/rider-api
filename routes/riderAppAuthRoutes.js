const express = require('express');
const router = express.Router();

const riderAuthController = require('../controllers/riderAuthController');
const { requireRider } = require('../middleware/requireRider');

// Send a sign-in code to the phone.
router.post('/otp/request', riderAuthController.requestOtp);

// Check the code; signs in, and creates the application for a new rider.
router.post('/otp/verify', riderAuthController.verifyOtp);

// Sign out of this app install.
router.post('/logout', riderAuthController.logout);

// Who is signed in, and where they are in onboarding.
router.get('/me', requireRider, riderAuthController.getAccount);

module.exports = router;
