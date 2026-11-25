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

// Locked while a step is saved or the application is submitted, so two saves cannot both move the step.
async function findForUpdate(client, { applicationId }) {
    const result = await client.query(
        `SELECT application_id::int AS application_id, phone, status, current_step, fix_steps
         FROM rider_applications
         WHERE application_id = $1
         FOR UPDATE`,
        [applicationId]
    );

    return result.rows[0] ?? null;
}

async function updateProgress(client, { applicationId, currentStep, fixSteps }) {
    await client.query(
        `UPDATE rider_applications
         SET current_step = $2, fix_steps = $3, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, currentStep, fixSteps]
    );
}

async function updatePlan(client, { applicationId, planType, packId }) {
    await client.query(
        `UPDATE rider_applications SET plan_type = $2, prepaid_pack_id = $3, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, planType, packId]
    );
}

async function markSubmitted(client, { applicationId, status }) {
    await client.query(
        `UPDATE rider_applications SET status = $2, submitted_at = now(), updated_at = now()
         WHERE application_id = $1`,
        [applicationId, status]
    );
}

async function updatePersonal(client, { applicationId, firstName, surname, dateOfBirth }) {
    await client.query(
        `UPDATE application_profiles
         SET first_name = $2, surname = $3, date_of_birth = $4, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, firstName, surname, dateOfBirth]
    );
}

async function updateAddress(client, { applicationId, addressLine1, addressLine2, city, state, pincode, addressProofKind }) {
    await client.query(
        `UPDATE application_profiles
         SET address_line1 = $2, address_line2 = $3, city = $4, state = $5, pincode = $6,
             address_proof_kind = $7, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, addressLine1, addressLine2, city, state, pincode, addressProofKind]
    );
}

async function updateEmergencyContact(client, { applicationId, name, relation, phone }) {
    await client.query(
        `UPDATE application_profiles
         SET emergency_name = $2, emergency_relation = $3, emergency_phone = $4, updated_at = now()
         WHERE application_id = $1`,
        [applicationId, name, relation, phone]
    );
}

// The application with its profile, chosen pack and accepted policy, for the rider's own view.
async function findOnboarding(client, { applicationId }) {
    const result = await client.query(
        `SELECT a.application_id::int AS application_id,
                a.application_no,
                a.phone,
                a.status,
                a.current_step,
                a.fix_steps,
                a.plan_type,
                a.hold_reason,
                a.reject_reason,
                a.submitted_at,
                p.first_name,
                p.surname,
                TO_CHAR(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                p.address_line1,
                p.address_line2,
                p.city,
                p.state,
                p.pincode,
                p.address_proof_kind,
                p.emergency_name,
                p.emergency_relation,
                p.emergency_phone,
                pack.pack_id::int AS pack_id,
                pack.name AS pack_name,
                pack.price::float8 AS pack_price,
                pack.km_included AS pack_km_included,
                accepted.version AS policy_version,
                accepted.accepted_at AS policy_accepted_at
         FROM rider_applications a
         JOIN application_profiles p ON p.application_id = a.application_id
         LEFT JOIN prepaid_packs pack ON pack.pack_id = a.prepaid_pack_id
         LEFT JOIN LATERAL (
             SELECT pv.version, pa.accepted_at
             FROM policy_acceptances pa
             JOIN policy_versions pv ON pv.policy_version_id = pa.policy_version_id
             WHERE pa.application_id = a.application_id
             ORDER BY pv.version DESC
             LIMIT 1
         ) accepted ON true
         WHERE a.application_id = $1`,
        [applicationId]
    );

    return result.rows[0] ?? null;
}

// The newest policy already in effect.
async function findCurrentPolicy(client) {
    const result = await client.query(
        `SELECT policy_version_id::int AS policy_version_id, version, title, body,
                TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from
         FROM policy_versions
         WHERE effective_from <= CURRENT_DATE
         ORDER BY version DESC
         LIMIT 1`
    );

    return result.rows[0] ?? null;
}

// Accepting the same version again (after going back a step) refreshes the record.
async function upsertPolicyAcceptance(client, { applicationId, policyVersionId, ipAddress, deviceInfo, postpaidRateId, depositId }) {
    await client.query(
        `INSERT INTO policy_acceptances (application_id, policy_version_id, ip, device_info, postpaid_rate_id, deposit_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (application_id, policy_version_id) DO UPDATE
         SET accepted_at = now(), ip = EXCLUDED.ip, device_info = EXCLUDED.device_info,
             postpaid_rate_id = EXCLUDED.postpaid_rate_id, deposit_id = EXCLUDED.deposit_id`,
        [applicationId, policyVersionId, ipAddress, deviceInfo, postpaidRateId, depositId]
    );
}

async function insertCheck(client, { applicationId, kind, status, details }) {
    await client.query(
        `INSERT INTO application_checks (application_id, kind, status, details) VALUES ($1, $2, $3, $4)`,
        [applicationId, kind, status, details]
    );
}

module.exports = {
    REAPPLY_AFTER_DAYS,
    nextApplicationNo,
    nextRiderCode,
    findLatestByPhone,
    insertApplication,
    insertProfile,
    insertEvent,
    findForUpdate,
    updateProgress,
    updatePlan,
    markSubmitted,
    updatePersonal,
    updateAddress,
    updateEmergencyContact,
    findOnboarding,
    findCurrentPolicy,
    upsertPolicyAcceptance,
    insertCheck
};
