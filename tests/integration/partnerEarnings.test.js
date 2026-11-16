const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const importRepository = require('../../repositories/importRepository');
const partnerRepository = require('../../repositories/partnerRepository');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const BLINKIT_HEADER = 'Partner ID,Rider Name,Order Date,Total Earnings';
const ZEPTO_HEADER = 'Zepto Rider ID,Week Start,Week End,Net Payable';
const ZOMATO_HEADER = 'Delivery Partner ID,Partner Name,Date,Payout (INR)';

let partnerIdByName;

async function partnerId(name) {
    if (!partnerIdByName) {
        const { body } = await h.api('GET', '/api/partners');
        partnerIdByName = new Map(body.partners.map(partner => [partner.name, partner.partnerId]));
    }

    return partnerIdByName.get(name);
}

// Pass null to leave a form field out.
async function upload(partner, lines, { fileName = 'earnings.csv' } = {}) {
    const form = new FormData();
    form.append('type', 'partner_earnings');

    if (partner !== null) form.append('partnerId', String(await partnerId(partner) ?? partner));

    form.append('file', new Blob([lines.join('\n')], { type: 'text/csv' }), fileName);

    return h.api('POST', '/api/imports', form);
}

async function map(riderId, partner, partnerRiderId) {
    const res = await h.api('PUT', `/api/partner-mappings/riders/${riderId}`, {
        mappings: [{ partnerId: await partnerId(partner), partnerRiderId }]
    });

    assert.equal(res.status, 200);
}

async function earnings() {
    const result = await h.pool.query(
        `SELECT partner_rider_id, TO_CHAR(earning_date, 'YYYY-MM-DD') AS earning_date,
                amount::text, status, rider_id, name_in_file
         FROM partner_earnings
         ORDER BY partner_rider_id, earning_date`
    );

    return result.rows;
}

describe('Partner earnings import type', () => {
    it('lists the partners that have a file format, with their columns', async () => {
        const res = await h.api('GET', '/api/imports/types');
        const type = res.body.types.find(item => item.key === 'partner_earnings');

        assert.equal(type.label, 'Partner Earnings');
        assert.equal(type.requiresWorkDate, false);
        assert.equal(type.requiresPartner, true);
        assert.deepEqual(
            type.partners.map(partner => [partner.partnerId, partner.name, partner.requiredColumns]),
            [
                [await partnerId('Blinkit'), 'Blinkit', BLINKIT_HEADER.split(',')],
                [await partnerId('Zepto'), 'Zepto', ZEPTO_HEADER.split(',')],
                [await partnerId('Zomato India Pvt Ltd'), 'Zomato India Pvt Ltd', ['Delivery Partner ID', 'Partner Name', 'Date', 'Payout (INR)']]
            ]
        );
    });

    it('needs a partner that has a file format, and logs nothing otherwise', async () => {
        const lines = [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,100'];

        const missing = await upload(null, lines);
        const unknown = await upload('999', lines);
        const notNumber = await upload('abc', lines);
        const unsupported = await upload('BigBasket', lines);

        assert.equal(missing.status, 400);
        assert.equal(missing.body.error, 'Choose a valid partner for Partner Earnings');
        assert.equal(unknown.status, 400);
        assert.equal(notNumber.status, 400);
        assert.equal(unsupported.status, 400);
        assert.equal(unsupported.body.error, 'BigBasket earnings files are not supported yet');

        const { rows } = await h.pool.query('SELECT COUNT(*)::int AS n FROM import_batches');
        assert.equal(rows[0].n, 0);
    });

    it('logs a file with the wrong columns as Failed, with its partner', async () => {
        const res = await upload('Zepto', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,100']);

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Failed');
        assert.equal(res.body.import.partnerId, await partnerId('Zepto'));
        assert.equal(res.body.import.partnerName, 'Zepto');
        assert.match(res.body.import.errorMessage, /^Missing required columns: Zepto Rider ID/);
    });
});

describe('Importing a Blinkit file', () => {
    beforeEach(async () => {
        await h.createRider('R-1');
        await map('R-1', 'Blinkit', 'BLK-1001');
    });

    it('matches mapped IDs, keeps unknown IDs pending and logs bad rows', async () => {
        const res = await upload('Blinkit', [
            BLINKIT_HEADER,
            ' blk-1001 ,Amit Patil,26-10-2026,850.00',
            'BLK-9999,Unknown Rider,26-10-2026,400',
            'BLK-9999,Unknown Rider,27-10-2026,450.5',
            'BLK-1001,Amit Patil,27-10-2026,abc',
            'BLK-1001,Amit Patil,2026-10-28,100',
            ',No ID,28-10-2026,100',
            'BLK-1001,Amit Patil,29-10-2026,5.555',
            'BLK-1001,Amit Patil,30-10-2026,',
            'BLK-1001,Amit Patil,31-02-2026,100'
        ]);

        assert.equal(res.status, 201);
        assert.equal(res.body.import.status, 'Partial');
        assert.equal(res.body.import.successRows, 3);
        assert.equal(res.body.import.failedRows, 6);
        assert.deepEqual(res.body.import.resultSummary, { matched: 1, pending: 2, ignored: 0, updated: 0, unchanged: 0 });
        assert.deepEqual(res.body.rowErrors.map(row => [row.rowNumber, row.errorMessage]), [
            [5, 'Total Earnings must be an amount like 850.50'],
            [6, 'Order Date must be a date like 26-10-2026'],
            [7, 'Partner ID is required'],
            [8, 'Total Earnings must be an amount like 850.50'],
            [9, 'Total Earnings is required'],
            [10, 'Order Date must be a date like 26-10-2026']
        ]);

        assert.deepEqual(await earnings(), [
            { partner_rider_id: 'BLK-1001', earning_date: '2026-10-26', amount: '850.00', status: 'Matched', rider_id: 'R-1', name_in_file: 'Amit Patil' },
            { partner_rider_id: 'BLK-9999', earning_date: '2026-10-26', amount: '400.00', status: 'Pending', rider_id: null, name_in_file: 'Unknown Rider' },
            { partner_rider_id: 'BLK-9999', earning_date: '2026-10-27', amount: '450.50', status: 'Pending', rider_id: null, name_in_file: 'Unknown Rider' }
        ]);
    });

    it('rejects a second row for the same ID and date', async () => {
        const res = await upload('Blinkit', [
            BLINKIT_HEADER,
            'BLK-1001,Amit Patil,26-10-2026,850',
            'blk-1001,Amit Patil,26-10-2026,900'
        ]);

        assert.deepEqual(res.body.rowErrors.map(row => [row.rowNumber, row.errorMessage]), [
            [3, 'BLK-1001 already has a row for this date on line 2']
        ]);
        assert.equal((await earnings())[0].amount, '850.00');
    });

    it('rejects an ID longer than 100 characters', async () => {
        const res = await upload('Blinkit', [BLINKIT_HEADER, `${'X'.repeat(101)},A,26-10-2026,100`]);

        assert.equal(res.body.import.status, 'Failed');
        assert.equal(res.body.rowErrors[0].errorMessage, 'Partner ID must be 100 characters or fewer');
    });

    it('re-upload: same amounts are unchanged, a new amount updates, missing rows stay', async () => {
        await upload('Blinkit', [
            BLINKIT_HEADER,
            'BLK-1001,Amit Patil,26-10-2026,850',
            'BLK-1001,Amit Patil,27-10-2026,920.50',
            'BLK-9999,Unknown Rider,26-10-2026,400'
        ]);

        const res = await upload('Blinkit', [
            BLINKIT_HEADER,
            'BLK-1001,Amit Patil,26-10-2026,850.00',
            'BLK-1001,Amit Patil,27-10-2026,980.50'
        ]);

        assert.deepEqual(res.body.import.resultSummary, { matched: 0, pending: 0, ignored: 0, updated: 1, unchanged: 1 });
        assert.deepEqual((await earnings()).map(row => [row.partner_rider_id, row.earning_date, row.amount]), [
            ['BLK-1001', '2026-10-26', '850.00'],
            ['BLK-1001', '2026-10-27', '980.50'],
            ['BLK-9999', '2026-10-26', '400.00']
        ]);

        const { rows } = await h.pool.query(
            `SELECT import_id FROM partner_earnings WHERE earning_date = '2026-10-27'`
        );
        assert.equal(Number(rows[0].import_id), res.body.import.importId);
    });

    it('a matched row keeps its rider when its amount changes after the ID moved', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1001,Amit Patil,26-10-2026,850']);

        await map('R-1', 'Blinkit', 'BLK-5000');
        await h.createRider('R-2');
        await map('R-2', 'Blinkit', 'BLK-1001');

        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1001,Amit Patil,26-10-2026,900']);

        const [row] = await earnings();
        assert.equal(row.amount, '900.00');
        assert.equal(row.rider_id, 'R-1');
    });

    it('a pending row with a new amount is matched once its ID is mapped', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-2002,New Rider,26-10-2026,300']);

        await h.createRider('R-2');
        await map('R-2', 'Blinkit', 'BLK-2002');

        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-2002,New Rider,26-10-2026,350']);

        const [row] = await earnings();
        assert.equal(row.status, 'Matched');
        assert.equal(row.rider_id, 'R-2');
    });

    it('a dismissed row stays dismissed unless its amount changes', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-9999,Unknown Rider,26-10-2026,400']);
        await h.pool.query(
            `UPDATE partner_earnings SET status = 'Dismissed', dismiss_reason = 'Test entry'`
        );

        const same = await upload('Blinkit', [BLINKIT_HEADER, 'BLK-9999,Unknown Rider,26-10-2026,400']);
        assert.equal(same.body.import.resultSummary.unchanged, 1);
        assert.equal((await earnings())[0].status, 'Dismissed');

        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-9999,Unknown Rider,26-10-2026,425']);

        const { rows } = await h.pool.query('SELECT status, dismiss_reason, amount::text FROM partner_earnings');
        assert.deepEqual(rows, [{ status: 'Pending', dismiss_reason: null, amount: '425.00' }]);
    });

    it('two uploads of the same file at once save each row only once', async () => {
        const lines = [BLINKIT_HEADER, 'BLK-1001,Amit Patil,26-10-2026,850', 'BLK-9999,Unknown,26-10-2026,400'];

        const results = await Promise.all([upload('Blinkit', lines), upload('Blinkit', lines)]);

        assert.deepEqual(results.map(res => res.status), [201, 201]);
        assert.deepEqual(
            results.map(res => res.body.import.resultSummary.unchanged).sort(),
            [0, 2]
        );
        assert.equal((await earnings()).length, 2);
    });

    // Both batch rows are written before either import takes the partner lock: the second waits, not deadlocks.
    it('two imports that both saved their batch row take the partner lock one after the other', async () => {
        const blinkit = await partnerId('Blinkit');
        const [first, second] = [await h.pool.connect(), await h.pool.connect()];

        try {
            for (const client of [first, second]) {
                await client.query('BEGIN');
                await importRepository.createBatch(client, {
                    importType: 'partner_earnings',
                    fileName: 'earnings.csv',
                    fileSizeBytes: 1,
                    workDate: null,
                    status: 'Completed',
                    totalRows: 0,
                    successRows: 0,
                    failedRows: 0,
                    resultSummary: {},
                    errorMessage: null,
                    partnerId: blinkit
                });
            }

            const locks = [first, second].map(client =>
                partnerRepository.lockPartner(client, { partnerId: blinkit }).then(() => client));

            // Whichever gets the lock commits; the other then gets it. A deadlock rejects one of them.
            const winner = await Promise.race(locks);
            await winner.query('COMMIT');

            await Promise.all(locks);
            await (winner === first ? second : first).query('COMMIT');
        } finally {
            first.release();
            second.release();
        }
    });
});

describe('Importing Zepto and Zomato files', () => {
    it('Zepto: stores a weekly total on its Monday and checks the week', async () => {
        await h.createRider('R-1');
        await map('R-1', 'Zepto', 'ZPT-2001');

        const res = await upload('Zepto', [
            ZEPTO_HEADER,
            'ZPT-2001,2026-10-26,2026-11-01,3200.00',
            'ZPT-9999,2026-10-26,2026-11-01,1100',
            ',2026-10-26,2026-11-01,900',
            'ZPT-2001,2026-10-27,2026-11-02,100',
            'ZPT-2001,2026-11-02,2026-11-09,100'
        ]);

        assert.equal(res.body.import.status, 'Partial');
        assert.deepEqual(res.body.import.resultSummary, { matched: 1, pending: 1, ignored: 0, updated: 0, unchanged: 0 });
        assert.deepEqual(res.body.rowErrors.map(row => row.errorMessage), [
            'Zepto Rider ID is required',
            'Week Start must be a Monday and Week End the Sunday after it (YYYY-MM-DD)',
            'Week Start must be a Monday and Week End the Sunday after it (YYYY-MM-DD)'
        ]);
        assert.deepEqual((await earnings()).map(row => [row.partner_rider_id, row.earning_date, row.status, row.name_in_file]), [
            ['ZPT-2001', '2026-10-26', 'Matched', null],
            ['ZPT-9999', '2026-10-26', 'Pending', null]
        ]);
    });

    it('Zomato: reads "26 Oct 2026" dates and amounts with commas', async () => {
        const res = await upload('Zomato India Pvt Ltd', [
            ZOMATO_HEADER,
            'ZOM-3002,Sneha Kulkarni,26 Oct 2026,"1,250.50"',
            'ZOM-3008,Meera Joshi,7 Oct 2026,990',
            'ZOM-3008,Meera Joshi,2026-10-28,990',
            'ZOM-3008,Meera Joshi,31 Okt 2026,990'
        ]);

        assert.equal(res.body.import.successRows, 2);
        assert.deepEqual(res.body.rowErrors.map(row => row.errorMessage), [
            'Date must be a date like 26 Oct 2026',
            'Date must be a date like 26 Oct 2026'
        ]);
        assert.deepEqual((await earnings()).map(row => [row.partner_rider_id, row.earning_date, row.amount]), [
            ['ZOM-3002', '2026-10-26', '1250.50'],
            ['ZOM-3008', '2026-10-07', '990.00']
        ]);
    });

    it('the same ID on two partners is two separate earnings', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'X-1,A,26-10-2026,100']);
        await upload('Zepto', [ZEPTO_HEADER, 'X-1,2026-10-26,2026-11-01,200']);

        assert.equal((await earnings()).length, 2);
    });
});

describe('Amounts and dates', () => {
    // "2026-11-17" -> "17-11-2026"
    function blinkitDate(date) {
        return date.split('-').reverse().join('-');
    }

    it('saves a negative amount, which is a partner penalty', async () => {
        const res = await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,-150.50']);

        assert.equal(res.body.import.status, 'Completed');
        assert.equal((await earnings())[0].amount, '-150.50');
    });

    it('rejects a date in the future, but not today', async () => {
        const today = h.todayInIst();

        const res = await upload('Blinkit', [
            BLINKIT_HEADER,
            `BLK-1,A,${blinkitDate(today)},100`,
            `BLK-1,A,${blinkitDate(h.addDays(today, 1))},100`
        ]);

        assert.equal(res.body.import.successRows, 1);
        assert.deepEqual(res.body.rowErrors.map(row => row.errorMessage), ['Order Date cannot be in the future']);
    });

    it('Zomato: reads Indian and Western thousands, any month case, and rejects stray commas', async () => {
        const res = await upload('Zomato India Pvt Ltd', [
            ZOMATO_HEADER,
            'ZOM-1,A,26 OCT 2026,"1,25,000.00"',
            'ZOM-1,A,27 oct 2026,"125,000"',
            'ZOM-1,A,28 Oct 2026,"1,2,5"',
            'ZOM-1,A,29 Oct 2026,"1,25"'
        ]);

        assert.deepEqual(res.body.rowErrors.map(row => [row.rowNumber, row.errorMessage]), [
            [4, 'Payout (INR) must be an amount like 1,250.50'],
            [5, 'Payout (INR) must be an amount like 1,250.50']
        ]);
        assert.deepEqual((await earnings()).map(row => [row.earning_date, row.amount]), [
            ['2026-10-26', '125000.00'],
            ['2026-10-27', '125000.00']
        ]);
    });

    it('Blinkit and Zepto amounts have no commas', async () => {
        const res = await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,"1,250"']);

        assert.equal(res.body.rowErrors[0].errorMessage, 'Total Earnings must be an amount like 850.50');
    });
});

describe('Rows that failed to import', () => {
    const WEEK = '2026-10-26';

    async function blocker(weekStart = WEEK) {
        return (await h.api('GET', `/api/payouts/weeks/${weekStart}`)).body.payout.blocker;
    }

    function openErrors() {
        return h.api('GET', '/api/partner-earnings/row-errors');
    }

    // Mapped, so the saved rows are not Pending (which would block the payout first).
    beforeEach(async () => {
        await h.createRider('R-1');
        await h.createRider('R-2');
        await map('R-1', 'Blinkit', 'BLK-1');
        await map('R-2', 'Blinkit', 'BLK-2');
    });

    it('block the payout of their week until a later file supplies the row', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,100', 'blk-2,B,27-10-2026,abc']);

        const { body } = await openErrors();
        assert.equal(body.pagination.totalRecords, 1);
        assert.deepEqual(
            [body.rowErrors[0].partnerName, body.rowErrors[0].partnerRiderId, body.rowErrors[0].earningDate, body.rowErrors[0].rowNumber],
            ['Blinkit', 'BLK-2', '2026-10-27', 3]
        );
        assert.equal(await blocker(), 'Cannot trigger the payout: 1 partner earnings row(s) failed to import for this week');
        // Another week is not blocked by it.
        assert.doesNotMatch(await blocker('2026-10-19') ?? '', /failed to import/);

        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-2,B,27-10-2026,120']);

        assert.equal((await openErrors()).body.pagination.totalRecords, 0);
        assert.doesNotMatch(await blocker() ?? '', /failed to import/);

        const { rows: [closed] } = await h.pool.query('SELECT resolve_note FROM import_row_errors');
        assert.equal(closed.resolve_note, 'Replaced by import #2');
    });

    it('a duplicate row in the file stays open, since its amount is unclear', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,100', 'BLK-1,A,26-10-2026,150']);

        assert.equal((await openErrors()).body.pagination.totalRecords, 1);
    });

    it('a row without a readable date blocks every week until dismissed', async () => {
        await upload('Blinkit', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,100', 'BLK-1,A,26/10/2026,100']);

        assert.match(await blocker(), /failed to import/);
        assert.match(await blocker('2026-10-12'), /failed to import/);

        const errorId = (await openErrors()).body.rowErrors[0].errorId;
        const noNote = await h.api('POST', `/api/partner-earnings/row-errors/${errorId}/dismiss`, { note: ' ' });
        assert.equal(noNote.status, 400);

        const dismissed = await h.api('POST', `/api/partner-earnings/row-errors/${errorId}/dismiss`, { note: 'Same as line 2' });
        assert.equal(dismissed.status, 200);
        assert.doesNotMatch(await blocker() ?? '', /failed to import/);

        const again = await h.api('POST', `/api/partner-earnings/row-errors/${errorId}/dismiss`, { note: 'Same as line 2' });
        assert.equal(again.status, 404);
    });

    it('a file with the wrong columns logs no row errors, so it blocks nothing', async () => {
        await upload('Zepto', [BLINKIT_HEADER, 'BLK-1,A,26-10-2026,100']);

        assert.equal((await openErrors()).body.pagination.totalRecords, 0);
    });
});
