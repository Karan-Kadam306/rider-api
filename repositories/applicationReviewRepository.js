// Queries behind the admin review of rider applications: the tabs, the review page, file access
// and the review decisions. The rider app's own queries live in applicationRepository.

// Filters shared by the list and its tab counts. statuses: null for every status.
function buildFilters({ statuses = null, hubId = null, planType = null, includeTest = false, search = '' }) {
    return {
        where: `($1::text[] IS NULL OR a.status = ANY($1))
            AND ($2::bigint IS NULL OR a.hub_id = $2)
            AND ($3::text IS NULL OR a.plan_type = $3)
            AND ($4 OR NOT a.is_test)
            AND ($5::text IS NULL
                 OR a.application_no ILIKE $5
                 OR a.phone ILIKE $5
                 OR a.rider_id ILIKE $5
                 OR (p.first_name || ' ' || p.surname) ILIKE $5)`,
        values: [statuses, hubId, planType, includeTest, search ? `%${search}%` : null]
    };
}

// One page of applications. Queues (oldestFirst) show the longest-waiting first.
async function listApplications(client, { limit, offset, oldestFirst, ...filters }) {
    const { where, values } = buildFilters(filters);
    const order = oldestFirst ? 'ASC' : 'DESC';

    const result = await client.query(
        `SELECT a.application_id::int AS application_id,
                a.application_no,
                a.phone,
                a.status,
                a.current_step,
                a.plan_type,
                a.is_test,
                a.rider_id,
                h.name AS hub_name,
                p.first_name,
                p.surname,
                a.submitted_at,
                a.created_at,
                count(*) OVER ()::int AS total
         FROM rider_applications a
         JOIN application_profiles p ON p.application_id = a.application_id
         LEFT JOIN hubs h ON h.hub_id = a.hub_id
         WHERE ${where}
         ORDER BY COALESCE(a.submitted_at, a.created_at) ${order}, a.application_id ${order}
         LIMIT $6 OFFSET $7`,
        [...values, limit, offset]
    );

    return result.rows;
}

// Applications per status with the same filters, for the tab badges.
async function countByStatus(client, filters) {
    const { where, values } = buildFilters({ ...filters, statuses: null });

    const result = await client.query(
        `SELECT a.status, count(*)::int AS total
         FROM rider_applications a
         JOIN application_profiles p ON p.application_id = a.application_id
         WHERE ${where}
         GROUP BY a.status`,
        values
    );

    return result.rows;
}

// The review fields findOnboarding leaves out.
async function findReviewInfo(client, { applicationId }) {
    const result = await client.query(
        `SELECT a.application_id::int AS application_id,
                a.rider_id,
                a.hub_id::int AS hub_id,
                h.name AS hub_name,
                a.is_test,
                a.is_reapplication,
                a.fix_steps,
                a.created_at,
                a.reviewed_at,
                reviewer.name AS reviewed_by,
                assistant.name AS assisted_by
         FROM rider_applications a
         LEFT JOIN hubs h ON h.hub_id = a.hub_id
         LEFT JOIN users reviewer ON reviewer.user_id = a.reviewed_by_user_id
         LEFT JOIN users assistant ON assistant.user_id = a.assisted_by_user_id
         WHERE a.application_id = $1`,
        [applicationId]
    );

    return result.rows[0] ?? null;
}

// Current documents with their files and who reviewed them. Encrypted numbers are left out.
async function findReviewDocuments(client, { applicationId }) {
    const result = await client.query(
        `SELECT d.doc_type,
                d.number_last4,
                TO_CHAR(d.expiry_date, 'YYYY-MM-DD') AS expiry_date,
                d.review_status,
                d.review_reason,
                d.reviewed_at,
                reviewer.name AS reviewed_by,
                d.version,
                COALESCE(
                    json_agg(json_build_object('fileId', f.file_id, 'side', f.side, 'mimeType', f.mime_type) ORDER BY f.side)
                        FILTER (WHERE f.file_id IS NOT NULL),
                    '[]'
                ) AS files
         FROM application_documents d
         LEFT JOIN application_document_files f ON f.document_id = d.document_id
         LEFT JOIN users reviewer ON reviewer.user_id = d.reviewed_by_user_id
         WHERE d.application_id = $1 AND d.is_current
         GROUP BY d.document_id, reviewer.name`,
        [applicationId]
    );

    return result.rows;
}

// The newest result of each check kind.
async function findLatestChecks(client, { applicationId }) {
    const result = await client.query(
        `SELECT DISTINCT ON (kind) kind, status, details, created_at
         FROM application_checks
         WHERE application_id = $1
         ORDER BY kind, created_at DESC, check_id DESC`,
        [applicationId]
    );

    return result.rows;
}

async function findEvents(client, { applicationId }) {
    const result = await client.query(
        `SELECT e.event_type, e.from_status, e.to_status, e.actor_type, u.name AS actor_name, e.note, e.data, e.created_at
         FROM application_events e
         LEFT JOIN users u ON u.user_id = e.actor_user_id
         WHERE e.application_id = $1
         ORDER BY e.created_at, e.event_id`,
        [applicationId]
    );

    return result.rows;
}

// A file of any version of this application's documents, so older uploads stay viewable.
async function findFile(client, { applicationId, fileId }) {
    const result = await client.query(
        `SELECT f.file_id::int AS file_id, f.document_id::int AS document_id, f.storage_key, f.mime_type
         FROM application_document_files f
         JOIN application_documents d ON d.document_id = f.document_id
         WHERE f.file_id = $2 AND d.application_id = $1`,
        [applicationId, fileId]
    );

    return result.rows[0] ?? null;
}

async function insertAccessLog(client, { userId, applicationId, documentId, fileId, ip }) {
    await client.query(
        `INSERT INTO document_access_log (user_id, application_id, document_id, file_id, ip)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, applicationId, documentId, fileId, ip]
    );
}

// Reviews the current version of a document. Returns false when it was never uploaded.
async function reviewDocument(client, { applicationId, docType, status, reason, userId }) {
    const result = await client.query(
        `UPDATE application_documents
         SET review_status = $3, review_reason = $4, reviewed_by_user_id = $5, reviewed_at = now()
         WHERE application_id = $1 AND doc_type = $2 AND is_current`,
        [applicationId, docType, status, reason, userId]
    );

    return result.rowCount > 0;
}

async function reviewBankAccount(client, { applicationId, status, reason, userId }) {
    const result = await client.query(
        `UPDATE application_bank_accounts
         SET review_status = $2, review_reason = $3, reviewed_by_user_id = $4, reviewed_at = now()
         WHERE application_id = $1 AND is_current`,
        [applicationId, status, reason, userId]
    );

    return result.rowCount > 0;
}

// The status the application was in when it was last put on hold.
async function findStatusBeforeHold(client, { applicationId }) {
    const result = await client.query(
        `SELECT from_status
         FROM application_events
         WHERE application_id = $1 AND event_type = 'held'
         ORDER BY created_at DESC, event_id DESC
         LIMIT 1`,
        [applicationId]
    );

    return result.rows[0]?.from_status ?? null;
}

async function markHeld(client, { applicationId, reason }) {
    await client.query(
        `UPDATE rider_applications SET status = 'On Hold', hold_reason = $2, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, reason]
    );
}

async function markReleased(client, { applicationId, status }) {
    await client.query(
        `UPDATE rider_applications SET status = $2, hold_reason = NULL, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, status]
    );
}

async function markChangesRequested(client, { applicationId, fixSteps, note }) {
    await client.query(
        `UPDATE rider_applications
         SET status = 'Changes Requested', fix_steps = $2, change_note = $3, hold_reason = NULL, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, fixSteps, note]
    );
}

async function markRejected(client, { applicationId, reason, userId }) {
    await client.query(
        `UPDATE rider_applications
         SET status = 'Rejected', reject_reason = $2, hold_reason = NULL,
             reviewed_by_user_id = $3, reviewed_at = now(), updated_at = now()
         WHERE application_id = $1`,
        [applicationId, reason, userId]
    );
}

async function markApproved(client, { applicationId, riderId, hubId, userId }) {
    await client.query(
        `UPDATE rider_applications
         SET status = 'Payment Pending', rider_id = $2, hub_id = $3,
             reviewed_by_user_id = $4, reviewed_at = now(), updated_at = now()
         WHERE application_id = $1`,
        [applicationId, riderId, hubId, userId]
    );
}

// The application a rider joined through, for the rider page. Riders added before the app have none.
async function findByRiderId(client, { riderId }) {
    const result = await client.query(
        `SELECT application_id::int AS application_id, application_no, status
         FROM rider_applications
         WHERE rider_id = $1`,
        [riderId]
    );

    return result.rows[0] ?? null;
}

module.exports = {
    listApplications,
    countByStatus,
    findReviewInfo,
    findReviewDocuments,
    findLatestChecks,
    findEvents,
    findFile,
    insertAccessLog,
    reviewDocument,
    reviewBankAccount,
    findStatusBeforeHold,
    markHeld,
    markReleased,
    markChangesRequested,
    markRejected,
    markApproved,
    findByRiderId
};
