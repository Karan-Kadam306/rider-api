const multer = require('multer');
const AppError = require('../errors/AppError');

// Multer configuration for CSV imports.
// The file is kept in memory only; it is parsed and never stored.
const uploadCsv = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
        files: 1
    },
    fileFilter: (req, file, callback) => {
        // Only CSV is parsed by the import service.
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            return callback(
                new AppError('Only CSV files are allowed', 400)
            );
        }

        callback(null, true);
    }
});

module.exports = uploadCsv;
