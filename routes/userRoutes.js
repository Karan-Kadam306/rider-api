const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const { requireRole } = require('../middleware/requireRole');

// Managing admin panel users is for admins only.
router.use(requireRole('admin'));

// Users for one status tab (?status=active|inactive&search=), with tab counts.
router.get('/', userController.listUsers);

// Add a user with a starting password.
router.post('/', userController.createUser);

// Change name, role or active status.
router.patch('/:userId', userController.updateUser);

// Set a new password for another user; they are signed out everywhere.
router.post('/:userId/password', userController.resetPassword);

module.exports = router;
