const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkUpload, MAX_FILE_BYTES } = require('../../utils/fileCheck');
const fileStore = require('../../services/storage/localFileStore');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.from('%PDF-1.7\n');
const EXE = Buffer.from('MZ\x90\x00 renamed program');

describe('checkUpload', () => {
    it('detects JPEG, PNG and PDF from their first bytes', () => {
        assert.equal(checkUpload(JPEG).mimeType, 'image/jpeg');
        assert.equal(checkUpload(PNG).ext, 'png');

        const pdf = checkUpload(PDF);
        assert.equal(pdf.mimeType, 'application/pdf');
        assert.equal(pdf.sizeBytes, PDF.length);
        assert.match(pdf.sha256, /^[0-9a-f]{64}$/);
    });

    it('rejects another file type, an empty file and a file over 5 MB', () => {
        const tooBig = Buffer.alloc(MAX_FILE_BYTES + 1);
        JPEG.copy(tooBig);

        assert.throws(() => checkUpload(EXE), { statusCode: 400, message: 'Only JPEG, PNG or PDF files are allowed' });
        assert.throws(() => checkUpload(Buffer.alloc(0)), { message: 'The file is empty' });
        assert.throws(() => checkUpload(tooBig), { message: 'The file is larger than 5 MB' });
    });

    it('accepts exactly 5 MB', () => {
        const exact = Buffer.alloc(MAX_FILE_BYTES);
        JPEG.copy(exact);

        assert.equal(checkUpload(exact).sizeBytes, MAX_FILE_BYTES);
    });

    it('rejects a PDF where only a photo is allowed', () => {
        assert.throws(() => checkUpload(PDF, { allowPdf: false }), { message: 'Only JPEG or PNG photos are allowed' });
        assert.equal(checkUpload(PNG, { allowPdf: false }).ext, 'png');
    });
});

describe('localFileStore', () => {
    let savedDir;
    let uploadDir;

    before(() => {
        savedDir = process.env.UPLOAD_DIR;
        uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rider-uploads-'));
        process.env.UPLOAD_DIR = uploadDir;
    });

    after(() => {
        process.env.UPLOAD_DIR = savedDir;
        fs.rmSync(uploadDir, { recursive: true, force: true });
    });

    it('saves a file under a random key, reads it back and deletes it', async () => {
        const key = await fileStore.save(JPEG, 'jpg');

        assert.match(key, /^[0-9a-f]{2}\/[0-9a-f]{32}\.jpg$/);
        assert.notEqual(await fileStore.save(JPEG, 'jpg'), key);

        const chunks = [];
        for await (const chunk of fileStore.read(key)) {
            chunks.push(chunk);
        }
        assert.deepEqual(Buffer.concat(chunks), JPEG);

        await fileStore.delete(key);
        assert.equal(fs.existsSync(path.join(uploadDir, key)), false);
        // Already gone is not an error.
        await fileStore.delete(key);
    });

    it('rejects keys that could reach other files', async () => {
        for (const key of ['../x.jpg', 'ab/../../etc.jpg', 'ab/x.jpg', '/etc/passwd', 'ab\\0123456789abcdef0123456789abcdef.jpg']) {
            assert.throws(() => fileStore.read(key), /Invalid storage key/, key);
        }

        await assert.rejects(fileStore.save(JPEG, 'exe'), /Invalid storage key/);
    });

    it('refuses an UPLOAD_DIR that is missing, relative or inside the project', async () => {
        const projectDir = path.join(__dirname, '..', '..');

        for (const dir of ['', 'uploads', projectDir, path.join(projectDir, 'uploads')]) {
            process.env.UPLOAD_DIR = dir;
            await assert.rejects(fileStore.save(JPEG, 'jpg'), /UPLOAD_DIR/, dir);
        }

        process.env.UPLOAD_DIR = uploadDir;
    });
});
