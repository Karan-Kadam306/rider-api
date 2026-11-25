const multer = require('multer');
const { MAX_FILE_BYTES } = require('../utils/fileCheck');

// Multer configuration for rider document photos and PDFs.
// Files are kept in memory; the service checks their real type and only then stores them.
const uploadDocument = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_BYTES,
        files: 2,
        fields: 20
    }
});

module.exports = uploadDocument;
