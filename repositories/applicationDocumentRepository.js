// Documents, their files and bank accounts of rider applications.
// A new upload never edits the old one: the current row is retired and a new version added.

// Marks the current version as old. Returns its version number, or 0 if there was none.
async function retireCurrentDocument(client, { applicationId, docType }) {
    const result = await client.query(
        `UPDATE application_documents SET is_current = false
         WHERE application_id = $1 AND doc_type = $2 AND is_current
         RETURNING version`,
        [applicationId, docType]
    );

    return result.rows[0]?.version ?? 0;
}

async function insertDocument(client, { applicationId, docType, numberEnc, numberHash, numberLast4, expiryDate, version }) {
    const result = await client.query(
        `INSERT INTO application_documents
            (application_id, doc_type, number_enc, number_hash, number_last4, expiry_date, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING document_id::int AS document_id`,
        [applicationId, docType, numberEnc, numberHash, numberLast4, expiryDate, version]
    );

    return result.rows[0].document_id;
}

async function insertFile(client, { documentId, side, storageKey, sha256, mimeType, sizeBytes }) {
    await client.query(
        `INSERT INTO application_document_files (document_id, side, storage_key, sha256, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [documentId, side, storageKey, sha256, mimeType, sizeBytes]
    );
}

// Current documents with the sides uploaded. Encrypted numbers are left out on purpose.
async function findCurrentDocuments(client, { applicationId }) {
    const result = await client.query(
        `SELECT d.doc_type,
                d.number_last4,
                TO_CHAR(d.expiry_date, 'YYYY-MM-DD') AS expiry_date,
                d.review_status,
                d.review_reason,
                d.version,
                array_agg(f.side ORDER BY f.side) FILTER (WHERE f.side IS NOT NULL) AS sides
         FROM application_documents d
         LEFT JOIN application_document_files f ON f.document_id = d.document_id
         WHERE d.application_id = $1 AND d.is_current
         GROUP BY d.document_id`,
        [applicationId]
    );

    return result.rows;
}

// Encrypted numbers of the current ID documents, for verification at submit.
async function findCurrentNumbers(client, { applicationId }) {
    const result = await client.query(
        `SELECT doc_type, number_enc
         FROM application_documents
         WHERE application_id = $1 AND is_current AND number_enc IS NOT NULL`,
        [applicationId]
    );

    return result.rows;
}

async function retireCurrentBankAccount(client, { applicationId }) {
    const result = await client.query(
        `UPDATE application_bank_accounts SET is_current = false
         WHERE application_id = $1 AND is_current
         RETURNING version`,
        [applicationId]
    );

    return result.rows[0]?.version ?? 0;
}

async function insertBankAccount(client, { applicationId, accountEnc, accountHash, accountLast4, ifsc, holderName, version }) {
    await client.query(
        `INSERT INTO application_bank_accounts
            (application_id, account_enc, account_hash, account_last4, ifsc, holder_name, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [applicationId, accountEnc, accountHash, accountLast4, ifsc, holderName, version]
    );
}

async function findCurrentBankAccount(client, { applicationId }) {
    const result = await client.query(
        `SELECT bank_account_id::int AS bank_account_id, account_enc, account_last4, ifsc, holder_name,
                verified_name, verification_status
         FROM application_bank_accounts
         WHERE application_id = $1 AND is_current`,
        [applicationId]
    );

    return result.rows[0] ?? null;
}

async function updateBankVerification(client, { bankAccountId, verifiedName, verificationStatus }) {
    await client.query(
        `UPDATE application_bank_accounts
         SET verified_name = $2, verification_status = $3, verified_at = now()
         WHERE bank_account_id = $1`,
        [bankAccountId, verifiedName, verificationStatus]
    );
}

// Other applications whose current Aadhaar, PAN, DL or bank account has the same number as this one's.
async function findDuplicates(client, { applicationId }) {
    const result = await client.query(
        `WITH mine AS (
             SELECT doc_type AS field, number_hash AS hash
             FROM application_documents
             WHERE application_id = $1 AND is_current AND number_hash IS NOT NULL
             UNION ALL
             SELECT 'bank', account_hash
             FROM application_bank_accounts
             WHERE application_id = $1 AND is_current
         ),
         theirs AS (
             SELECT doc_type AS field, number_hash AS hash, application_id
             FROM application_documents
             WHERE application_id <> $1 AND is_current AND number_hash IS NOT NULL
             UNION ALL
             SELECT 'bank', account_hash, application_id
             FROM application_bank_accounts
             WHERE application_id <> $1 AND is_current
         )
         SELECT mine.field,
                a.application_no,
                a.status AS application_status,
                a.rider_id,
                r.status AS rider_status
         FROM mine
         JOIN theirs ON theirs.field = mine.field AND theirs.hash = mine.hash
         JOIN rider_applications a ON a.application_id = theirs.application_id
         LEFT JOIN riders r ON r.rider_id = a.rider_id
         ORDER BY mine.field, a.created_at`,
        [applicationId]
    );

    return result.rows;
}

module.exports = {
    retireCurrentDocument,
    insertDocument,
    insertFile,
    findCurrentDocuments,
    findCurrentNumbers,
    retireCurrentBankAccount,
    insertBankAccount,
    findCurrentBankAccount,
    updateBankVerification,
    findDuplicates
};
