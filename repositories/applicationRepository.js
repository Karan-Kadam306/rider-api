// Application numbers come from database sequences, so two signups never get the same one.
// Padding is done here: SQL lpad would cut a number that outgrows the width.

// A rejected applicant may apply again this many days after the decision.
const REAPPLY_AFTER_DAYS = 30;

// e.g. YS-APP-0000123
async function nextApplicationNo(client) {
    const result = await client.query(`SELECT nextval('rider_application_no_seq')::text AS n`);
    return `YS-APP-${result.rows[0].n.padStart(7, '0')}`;
}

// The rider code given at approval: approval date, then a running number,
// e.g. YS-RID-20261123005770. approvedOn is 'YYYY-MM-DD'.
async function nextRiderCode(client, approvedOn) {
    const result = await client.query(`SELECT nextval('rider_code_seq')::text AS n`);
    return `YS-RID-${approvedOn.replaceAll('-', '')}${result.rows[0].n.padStart(6, '0')}`;
}

// The phone's newest application, with the date a rejected one may reapply from.
async function findLatestByPhone(client, { phone }) {
    const result = await client.query(
        `SELECT application_id::int AS application_id,
                application_no,
                status,
                current_step,
                rider_id,
                CASE WHEN status = 'Rejected'
                     THEN TO_CHAR(COALESCE(reviewed_at, updated_at)::date + $2::int, 'YYYY-MM-DD')
                END AS can_reapply_from,
                status = 'Rejected' AND COALESCE(reviewed_at, updated_at)::date + $2::int <= CURRENT_DATE AS can_reapply
         FROM rider_applications
         WHERE phone = $1
         ORDER BY created_at DESC, application_id DESC
         LIMIT 1`,
        [phone, REAPPLY_AFTER_DAYS]
    );

    return result.rows[0] ?? null;
}

async function insertApplication(client, { applicationNo, phone, isReapplication }) {
    const result = await client.query(
        `INSERT INTO rider_applications (application_no, phone, is_reapplication)
         VALUES ($1, $2, $3)
         RETURNING application_id::int AS application_id, application_no, status, current_step, rider_id`,
        [applicationNo, phone, isReapplication]
    );

    return result.rows[0];
}

async function insertProfile(client, { applicationId, firstName, surname, dateOfBirth }) {
    await client.query(
        `INSERT INTO application_profiles (application_id, first_name, surname, date_of_birth)
         VALUES ($1, $2, $3, $4)`,
        [applicationId, firstName, surname, dateOfBirth]
    );
}

// actorUserId is set only when staff did it (actorType 'user').
async function insertEvent(client, { applicationId, eventType, fromStatus = null, toStatus = null, actorType, actorUserId = null, note = null }) {
    await client.query(
        `INSERT INTO application_events (application_id, event_type, from_status, to_status, actor_type, actor_user_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [applicationId, eventType, fromStatus, toStatus, actorType, actorUserId, note]
    );
}

module.exports = {
    REAPPLY_AFTER_DAYS,
    nextApplicationNo,
    nextRiderCode,
    findLatestByPhone,
    insertApplication,
    insertProfile,
    insertEvent
};
