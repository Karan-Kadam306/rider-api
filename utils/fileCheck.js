const crypto = require('crypto');
const AppError = require('../errors/AppError');

// Checks a document upload by its first bytes, never by its name or the type the client sent,
// so a renamed program cannot pass as a photo.

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const FILE_TYPES = [
    { mimeType: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
    { mimeType: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { mimeType: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] } // %PDF-
];

function detectFileType(buffer) {
    return FILE_TYPES.find(type => type.magic.every((byte, index) => buffer[index] === byte)) ?? null;
}

// allowPdf is false for the selfie, which must be a photo.
function checkUpload(buffer, { allowPdf = true } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new AppError('The file is empty', 400);
    }

    if (buffer.length > MAX_FILE_BYTES) {
        throw new AppError('The file is larger than 5 MB', 400);
    }

    const type = detectFileType(buffer);

    if (!type || (!allowPdf && type.ext === 'pdf')) {
        throw new AppError(allowPdf ? 'Only JPEG, PNG or PDF files are allowed' : 'Only JPEG or PNG photos are allowed', 400);
    }

    return {
        mimeType: type.mimeType,
        ext: type.ext,
        sizeBytes: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    };
}

module.exports = { checkUpload, detectFileType, MAX_FILE_BYTES };
