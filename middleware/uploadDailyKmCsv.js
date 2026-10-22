const multer = require('multer');

const uploadDailyKmCsv = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
        files: 1
    },
    fileFilter: (req, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.csv' || '.excel')) {
            return callback(
                new Error('Only CSV And Excel files are allowed')
            );
        }

        callback(null, true);
    }
});

module.exports = uploadDailyKmCsv;
