const userService = require('../services/userService');

// GET /api/users?status=active|inactive&search=
async function listUsers(req, res, next) {
    try {
        const { status, search } = req.query;
        const result = await userService.listUsers({ status, search });

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

// POST /api/users
// Body: { email, name, role, password }
async function createUser(req, res, next) {
    try {
        const { email, name, role, password } = req.body ?? {};
        const user = await userService.createUser({ email, name, role, password });

        return res.status(201).json({ message: 'User created', user });
    } catch (error) {
        return next(error);
    }
}

// PATCH /api/users/:userId
// Body: any of { name, role, isActive }
async function updateUser(req, res, next) {
    try {
        const { name, role, isActive } = req.body ?? {};
        const user = await userService.updateUser({
            actingUserId: req.user.userId,
            userId: req.params.userId,
            name,
            role,
            isActive
        });

        return res.status(200).json({ message: 'User updated', user });
    } catch (error) {
        return next(error);
    }
}

// POST /api/users/:userId/password
// Body: { password }
async function resetPassword(req, res, next) {
    try {
        const user = await userService.resetPassword({
            actingUserId: req.user.userId,
            userId: req.params.userId,
            password: req.body?.password
        });

        return res.status(200).json({ message: 'Password reset', user });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listUsers,
    createUser,
    updateUser,
    resetPassword
};
