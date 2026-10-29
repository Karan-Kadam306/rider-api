const multer = require('multer');
const AppError = require('../errors/AppError');

// Multer configuration for handling CSV file uploads.
// This middleware is used to handle the upload of daily kilometers CSV files.
const uploadDailyKmCsv = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
        files: 1
    },
    fileFilter: (req, file, callback) => {
        // Only CSV is parsed by the upload route.
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            return callback(
                new AppError('Only CSV files are allowed', 400)
            );
        }

        callback(null, true);
    }
});

module.exports = uploadDailyKmCsv;
