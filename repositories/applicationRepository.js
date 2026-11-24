// Application numbers come from database sequences, so two signups never get the same one.
// Padding is done here: SQL lpad would cut a number that outgrows the width.

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

module.exports = { nextApplicationNo, nextRiderCode };
