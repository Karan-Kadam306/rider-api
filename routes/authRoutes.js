const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/requireAuth');

// Sign in with email and password.
router.post('/login', authController.login);

// Sign out of this browser.
router.post('/logout', authController.logout);

// Who is signed in.
router.get('/me', requireAuth, authController.getCurrentUser);

module.exports = router;
