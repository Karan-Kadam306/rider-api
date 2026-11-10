// One partner ID's earning for one date, locked until the transaction ends.
async function findEarning(client, { partnerId, partnerRiderId, earningDate }) {
    const result = await client.query(
        `SELECT earning_id, amount, status, rider_id
         FROM partner_earnings
         WHERE partner_id = $1 AND partner_rider_id = $2 AND earning_date = $3
         FOR UPDATE`,
        [partnerId, partnerRiderId, earningDate]
    );

    return result.rows[0] ?? null;
}

async function insertEarning(client, { partnerId, partnerRiderId, earningDate, amount, status, riderId, nameInFile, importId }) {
    await client.query(
        `INSERT INTO partner_earnings (
            partner_id,
            partner_rider_id,
            earning_date,
            amount,
            status,
            rider_id,
            name_in_file,
            import_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [partnerId, partnerRiderId, earningDate, amount, status, riderId, nameInFile, importId]
    );
}

// A new amount from a later file. Clears any dismiss reason, since the row is reviewed again.
async function updateEarning(client, { earningId, amount, nameInFile, status, riderId, importId }) {
    await client.query(
        `UPDATE partner_earnings
         SET amount = $2,
             name_in_file = $3,
             status = $4,
             rider_id = $5,
             dismiss_reason = NULL,
             import_id = $6,
             updated_at = now()
         WHERE earning_id = $1`,
        [earningId, amount, nameInFile, status, riderId, importId]
    );
}

module.exports = {
    findEarning,
    insertEarning,
    updateEarning
};
