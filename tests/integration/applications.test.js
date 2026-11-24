const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const applicationRepository = require('../../repositories/applicationRepository');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const HASH = 'a'.repeat(64);

async function insertApplication({ phone = '9876543210', status = 'Draft', ...columns } = {}) {
    const values = {
        application_no: await applicationRepository.nextApplicationNo(h.pool),
        phone,
        status,
        submitted_at: status === 'Draft' ? null : new Date(),
        ...columns
    };
    const names = Object.keys(values);

    const result = await h.pool.query(
        `INSERT INTO rider_applications (${names.join(', ')})
         VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})
         RETURNING application_id::int AS application_id`,
        Object.values(values)
    );

    return result.rows[0].application_id;
}

async function insertDocument(applicationId, docType, columns = {}) {
    const values = {
        application_id: applicationId,
        doc_type: docType,
        ...(['aadhaar', 'pan', 'dl'].includes(docType) && { number_enc: 'enc', number_hash: HASH, number_last4: '1234' }),
        ...(docType === 'dl' && { expiry_date: '2030-01-01' }),
        ...columns
    };
    const names = Object.keys(values);

    const result = await h.pool.query(
        `INSERT INTO application_documents (${names.join(', ')})
         VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})
         RETURNING document_id::int AS document_id`,
        Object.values(values)
    );

    return result.rows[0].document_id;
}

async function insertPack() {
    const result = await h.pool.query(
        `INSERT INTO prepaid_packs (kind, name, price, km_included, validity_days)
         VALUES ('Weekly', '400 KM Weekly', 1000, 400, 7)
         RETURNING pack_id::int AS pack_id`
    );

    return result.rows[0].pack_id;
}

// Rejects with the named constraint, so a test cannot pass on some other error.
function rejectsWith(promise, constraint) {
    return assert.rejects(promise, error => error.constraint === constraint || error.message.includes(constraint));
}

describe('Application and rider numbers', () => {
    it('gives running application numbers padded to 7 digits', async () => {
        const first = await applicationRepository.nextApplicationNo(h.pool);
        const second = await applicationRepository.nextApplicationNo(h.pool);

        assert.match(first, /^YS-APP-\d{7}$/);
        assert.equal(Number(second.slice(7)), Number(first.slice(7)) + 1);
    });

    it('builds rider codes from the approval date and a running number', async () => {
        const code = await applicationRepository.nextRiderCode(h.pool, '2026-11-23');

        assert.match(code, /^YS-RID-20261123\d{6}$/);
        assert.ok(code.length <= 30);
    });
});

describe('rider_applications rules', () => {
    it('allows one open application per phone, and a new one after a rejection', async () => {
        const first = await insertApplication();

        await rejectsWith(insertApplication(), 'idx_rider_applications_open_phone');

        await h.pool.query(
            `UPDATE rider_applications SET status = 'Rejected', reject_reason = 'Fake documents', submitted_at = now()
             WHERE application_id = $1`,
            [first]
        );

        await insertApplication({ is_reapplication: true });
    });

    it('rejects an unknown status or step', async () => {
        await rejectsWith(insertApplication({ status: 'Approved' }), 'rider_applications_status_check');
        await rejectsWith(insertApplication({ current_step: 'payment' }), 'rider_applications_step_check');
    });

    it('needs a pack for Prepaid and none for Postpaid', async () => {
        const packId = await insertPack();

        await rejectsWith(insertApplication({ plan_type: 'Prepaid' }), 'rider_applications_plan_check');
        await rejectsWith(
            insertApplication({ plan_type: 'Postpaid', prepaid_pack_id: packId }),
            'rider_applications_plan_check'
        );

        await insertApplication({ plan_type: 'Prepaid', prepaid_pack_id: packId });
        await insertApplication({ phone: '9876543211', plan_type: 'Postpaid' });
    });

    it('needs a reason to hold or reject and a submit time after Draft', async () => {
        await rejectsWith(insertApplication({ status: 'On Hold', hold_reason: ' ' }), 'rider_applications_hold_check');
        await rejectsWith(insertApplication({ status: 'Rejected' }), 'rider_applications_reject_check');
        await rejectsWith(
            insertApplication({ status: 'Pending Review', submitted_at: null }),
            'rider_applications_submitted_check'
        );
    });

    it('needs a rider once approved', async () => {
        await rejectsWith(insertApplication({ status: 'Payment Pending' }), 'rider_applications_rider_check');

        await h.createRider('YS-RID-20261123000001');
        await insertApplication({ status: 'Payment Pending', rider_id: 'YS-RID-20261123000001' });
    });
});

describe('Documents, files and bank accounts', () => {
    it('keeps one current version of each document', async () => {
        const applicationId = await insertApplication();
        const first = await insertDocument(applicationId, 'pan');

        await rejectsWith(insertDocument(applicationId, 'pan', { version: 2 }), 'idx_application_documents_current');

        await h.pool.query(`UPDATE application_documents SET is_current = false WHERE document_id = $1`, [first]);
        await insertDocument(applicationId, 'pan', { version: 2 });
        await rejectsWith(
            insertDocument(applicationId, 'pan', { version: 2, is_current: false }),
            'application_documents_application_id_doc_type_version_key'
        );
    });

    it('needs a number for ID documents, none for the selfie, and an expiry only on the DL', async () => {
        const applicationId = await insertApplication();

        await rejectsWith(
            insertDocument(applicationId, 'aadhaar', { number_enc: null }),
            'application_documents_number_check'
        );
        await rejectsWith(
            insertDocument(applicationId, 'selfie', { number_enc: 'enc', number_hash: HASH, number_last4: '1234' }),
            'application_documents_number_check'
        );
        await rejectsWith(insertDocument(applicationId, 'dl', { expiry_date: null }), 'application_documents_expiry_check');
        await rejectsWith(
            insertDocument(applicationId, 'pan', { expiry_date: '2030-01-01' }),
            'application_documents_expiry_check'
        );
        await rejectsWith(
            insertDocument(applicationId, 'pan', { review_status: 'Rejected' }),
            'application_documents_reason_check'
        );
    });

    it('limits files to 5 MB, known types and one per side', async () => {
        const documentId = await insertDocument(await insertApplication(), 'aadhaar');
        const insertFile = (side, sizeBytes, mimeType = 'image/jpeg', key = `k-${side}-${sizeBytes}-${mimeType}`) =>
            h.pool.query(
                `INSERT INTO application_document_files (document_id, side, storage_key, sha256, mime_type, size_bytes)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [documentId, side, key, HASH, mimeType, sizeBytes]
            );

        await insertFile('front', 5242880);
        await rejectsWith(insertFile('back', 5242881), 'application_document_files_size_check');
        await rejectsWith(insertFile('back', 100, 'image/gif'), 'application_document_files_mime_check');
        await rejectsWith(insertFile('front', 100), 'application_document_files_document_id_side_key');
    });

    it('keeps one current bank account per application', async () => {
        const applicationId = await insertApplication();
        const insertAccount = version =>
            h.pool.query(
                `INSERT INTO application_bank_accounts
                    (application_id, account_enc, account_hash, account_last4, ifsc, holder_name, version)
                 VALUES ($1, 'enc', $2, '6789', 'SBIN0001234', 'Ravi Kumar', $3)`,
                [applicationId, HASH, version]
            );

        await insertAccount(1);
        await rejectsWith(insertAccount(2), 'idx_application_bank_accounts_current');
    });
});

describe('Policies and events', () => {
    it('has the placeholder v1 policy, accepted once per application', async () => {
        const applicationId = await insertApplication();
        const { rows: [policy] } = await h.pool.query(`SELECT policy_version_id FROM policy_versions WHERE version = 1`);
        const accept = () =>
            h.pool.query(
                `INSERT INTO policy_acceptances (application_id, policy_version_id) VALUES ($1, $2)`,
                [applicationId, policy.policy_version_id]
            );

        await accept();
        await rejectsWith(accept(), 'policy_acceptances_application_id_policy_version_id_key');
    });

    it('names the user for staff events and no user for rider events', async () => {
        const applicationId = await insertApplication();
        const insertEvent = (actorType, actorUserId) =>
            h.pool.query(
                `INSERT INTO application_events (application_id, event_type, actor_type, actor_user_id)
                 VALUES ($1, 'submitted', $2, $3)`,
                [applicationId, actorType, actorUserId]
            );

        await insertEvent('rider', null);
        await rejectsWith(insertEvent('user', null), 'application_events_actor_check');
        await rejectsWith(insertEvent('rider', 1), 'application_events_actor_check');
    });
});
