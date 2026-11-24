const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Stores document files on local disk under UPLOAD_DIR. S3 can replace it later with the same
// save/read/delete functions. Files are named randomly and only ever reached through their key.

const REPO_ROOT = path.join(__dirname, '..', '..');
// e.g. "3f/3fa91c0e5b7d4a2e9c1b6d8f0a2e4c6b.jpg"
const KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{32}\.(jpg|png|pdf)$/;

// UPLOAD_DIR must be outside the project, so uploads are never committed or served as static files.
function getRoot() {
    const root = process.env.UPLOAD_DIR;

    if (!root || !path.isAbsolute(root)) {
        throw new Error('UPLOAD_DIR must be set to an absolute path');
    }

    const relative = path.relative(REPO_ROOT, root);

    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        throw new Error('UPLOAD_DIR must be outside the project folder');
    }

    return root;
}

function filePath(key) {
    if (!KEY_PATTERN.test(key)) {
        throw new Error('Invalid storage key');
    }

    return path.join(getRoot(), key);
}

// ext comes from checkUpload, never from the client. Returns the storage key.
async function save(buffer, ext) {
    const name = crypto.randomBytes(16).toString('hex');
    const key = `${name.slice(0, 2)}/${name}.${ext}`;
    const target = filePath(key);

    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    // wx: never overwrite an existing file.
    await fs.promises.writeFile(target, buffer, { flag: 'wx' });

    return key;
}

function read(key) {
    return fs.createReadStream(filePath(key));
}

// Deleting a file that is already gone is not an error.
async function remove(key) {
    try {
        await fs.promises.unlink(filePath(key));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

module.exports = { save, read, delete: remove };
