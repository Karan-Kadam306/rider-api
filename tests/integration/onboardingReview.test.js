const h = require('../helpers');
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { JPEG, STEP_SAVES, getOnboarding, submit, submittedApplication } = require('../onboardingFlow');

before(h.startServer);
after(h.stopServer);
beforeEach(h.resetDb);

const ITEMS = ['aadhaar', 'pan', 'dl', 'address_proof', 'selfie', 'bank'];
const base = applicationId => `/api/onboarding/applications/${applicationId}`;

function review(applicationId, item, status, reason, headers) {
    return h.api('PATCH', `${base(applicationId)}/items/${item}`, { status, reason }, headers);
}

async function verifyAll(applicationId) {
    for (const item of ITEMS) {
        const res = await review(applicationId, item, 'Verified');
        assert.equal(res.status, 200, `${item}: ${JSON.stringify(res.body)}`);
    }
}

function approve(applicationId, body = {}, headers) {
    return h.api('POST', `${base(applicationId)}/approve`, { hubId: h.getDefaultHubId(), ...body }, headers);
}

function getApplication(applicationId) {
    return h.api('GET', base(applicationId));
}

describe('Application list', () => {
    it('lists each tab with counts, oldest first in the review queue', async () => {
        const first = await submittedApplication({ firstName: 'Asha', surname: 'Patil', dateOfBirth: '1994-01-10' });
        await submittedApplication();
        const held = await submittedApplication({ firstName: 'Dev', surname: 'Shah', dateOfBirth: '1990-03-03' });
        await h.api('POST', `${base(held.applicationId)}/hold`, { reason: 'Calling the rider' });

        const res = await h.api('GET', '/api/onboarding/applications?tab=review');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.applications.map(app => app.name), ['Asha Patil', 'Ravi Kumar']);
        assert.equal(res.body.applications[0].applicationId, first.applicationId);
        assert.equal(res.body.counts.review, 2);
        assert.equal(res.body.counts.hold, 1);
        assert.equal(res.body.counts.all, 3);
        assert.equal(res.body.pagination.totalRecords, 2);
    });

    it('searches by name or application number and hides test applicants', async () => {
        const { applicationId } = await submittedApplication({ firstName: 'Asha', surname: 'Patil', dateOfBirth: '1994-01-10' });
        await submittedApplication();
        await h.pool.query('UPDATE rider_applications SET is_test = true WHERE application_id = $1', [applicationId]);

        const hidden = await h.api('GET', '/api/onboarding/applications?tab=all');
        const shown = await h.api('GET', '/api/onboarding/applications?tab=all&includeTest=true&search=asha');
        const badTab = await h.api('GET', '/api/onboarding/applications?tab=nope');

        assert.deepEqual(hidden.body.applications.map(app => app.name), ['Ravi Kumar']);
        assert.deepEqual(shown.body.applications.map(app => [app.name, app.isTest]), [['Asha Patil', true]]);
        assert.equal(badTab.status, 400);
    });
});

describe('Reviewing an application', () => {
    it('shows the details with masked numbers, the checks and the timeline', async () => {
        const { applicationId } = await submittedApplication();

        const res = await getApplication(applicationId);
        const { application } = res.body;

        assert.equal(res.status, 200);
        assert.equal(application.status, 'Pending Review');
        assert.equal(application.profile.firstName, 'Ravi');
        assert.equal(application.documents.aadhaar.files.length, 2);
        assert.equal(application.documents.aadhaar.reviewStatus, 'Pending');
        assert.equal(application.bank.nameAtBank !== undefined, true);
        assert.equal(application.plan.planType, 'Postpaid');
        assert.deepEqual(Object.keys(application.checks).sort(), ['bank', 'dl', 'duplicate', 'pan']);
        assert.deepEqual(application.timeline.map(event => event.event), ['created', 'submitted']);
        assert.equal(JSON.stringify(application).includes('account_enc'), false);
    });

    it('streams a file and logs every view; another application\'s file is not found', async () => {
        const { applicationId } = await submittedApplication();
        const other = await submittedApplication({ firstName: 'Asha', surname: 'Patil', dateOfBirth: '1994-01-10' });
        const { body: { application } } = await getApplication(applicationId);
        const fileId = application.documents.selfie.files[0].fileId;
        // A raw fetch, since api() reads every body as text.
        const cookie = await h.signIn(await h.createUser({ email: 'viewer@test.local', role: 'admin' }));

        const res = await fetch(h.url(`${base(applicationId)}/files/${fileId}`), { headers: { Cookie: cookie } });
        const wrongApplication = await h.api('GET', `${base(other.applicationId)}/files/${fileId}`);

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'image/jpeg');
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), JPEG);
        assert.equal(wrongApplication.status, 404);

        const { rows } = await h.pool.query('SELECT application_id::int, file_id::int FROM document_access_log');
        assert.deepEqual(rows, [{ application_id: applicationId, file_id: fileId }]);
    });

    it('verifies and rejects items; a rejection needs a reason', async () => {
        const { applicationId } = await submittedApplication();

        const verified = await review(applicationId, 'pan', 'Verified');
        const noReason = await review(applicationId, 'aadhaar', 'Rejected', '  ');
        const rejected = await review(applicationId, 'bank', 'Rejected', 'Name does not match');
        const badItem = await review(applicationId, 'passport', 'Verified');

        assert.equal(verified.body.application.documents.pan.reviewStatus, 'Verified');
        assert.equal(noReason.status, 400);
        assert.equal(rejected.body.application.bank.reviewStatus, 'Rejected');
        assert.equal(rejected.body.application.bank.reviewReason, 'Name does not match');
        assert.equal(badItem.status, 400);
    });
});

describe('Approving', () => {
    it('needs every item verified first', async () => {
        const { applicationId } = await submittedApplication();
        await review(applicationId, 'aadhaar', 'Verified');

        const res = await approve(applicationId);

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Verify every item before approving: pan, dl, address_proof, selfie, bank');
    });

    it('creates the rider with a rider code, hub, team leader and partner ID', async () => {
        const { token, applicationId } = await submittedApplication();
        const leaderId = await h.createUser({ email: 'tl@test.local', role: 'team_leader' });
        const { body: options } = await h.api('GET', '/api/onboarding/approval-options');
        const partnerId = options.partners[0].partnerId;
        await verifyAll(applicationId);

        const res = await approve(applicationId, {
            teamLeaderIds: [leaderId],
            mappings: [{ partnerId, partnerRiderId: 'SW-100' }],
            note: 'Documents checked in person'
        });

        assert.equal(res.status, 200, JSON.stringify(res.body));
        const { application } = res.body;
        const riderId = application.riderId;
        assert.match(riderId, new RegExp(`^YS-RID-${h.todayInIst().replaceAll('-', '')}\\d{6}$`));
        assert.equal(application.status, 'Payment Pending');
        assert.equal(application.hub.hubId, h.getDefaultHubId());
        assert.equal(application.timeline.at(-1).note, 'Documents checked in person');

        const { rows: [rider] } = await h.pool.query('SELECT name, status, hub_id::int FROM riders WHERE rider_id = $1', [riderId]);
        assert.deepEqual(rider, { name: 'Ravi Kumar', status: 'Inactive', hub_id: h.getDefaultHubId() });

        const leaders = await h.api('GET', `/api/riders/${riderId}/team-leaders`);
        assert.deepEqual(leaders.body.teamLeaders.map(leader => leader.userId), [leaderId]);

        const profile = await h.api('GET', `/api/riders/${riderId}/profile`);
        assert.deepEqual(profile.body.partnerMappings.map(mapping => mapping.partnerRiderId), ['SW-100']);
        assert.equal(profile.body.application.applicationId, applicationId);

        // Still onboarding, so not in the riders list until the bike is given.
        const inactive = await h.api('GET', '/api/riders?status=Inactive');
        assert.deepEqual(inactive.body.riders, []);

        assert.equal((await getOnboarding(token)).body.status, 'Payment Pending');
    });

    it('saves nothing when any part fails', async () => {
        const { applicationId } = await submittedApplication();
        const { body: options } = await h.api('GET', '/api/onboarding/approval-options');
        await h.createRider('YS-OLD');
        await h.api('PUT', '/api/partner-mappings/riders/YS-OLD', {
            mappings: [{ partnerId: options.partners[0].partnerId, partnerRiderId: 'SW-100' }]
        });
        await verifyAll(applicationId);

        const res = await approve(applicationId, { mappings: [{ partnerId: options.partners[0].partnerId, partnerRiderId: 'SW-100' }] });

        assert.equal(res.status, 409);
        const { rows } = await h.pool.query(`SELECT count(*)::int AS n FROM riders WHERE rider_id <> 'YS-OLD'`);
        assert.equal(rows[0].n, 0);
        assert.equal((await getApplication(applicationId)).body.application.status, 'Pending Review');
    });

    it('refuses an inactive hub and a phone that already belongs to a rider', async () => {
        const { applicationId } = await submittedApplication();
        const closedHubId = await h.createHub('Closed Hub', { isActive: false });
        await verifyAll(applicationId);

        const closed = await approve(applicationId, { hubId: closedHubId });
        const { rows: [{ phone }] } = await h.pool.query('SELECT phone FROM rider_applications WHERE application_id = $1', [applicationId]);
        await h.pool.query(`INSERT INTO riders (rider_id, name, phone, hub_id) VALUES ('YS-OLD', 'Old', $1, $2)`, [phone, h.getDefaultHubId()]);
        const taken = await approve(applicationId);

        assert.equal(closed.status, 400);
        assert.equal(closed.body.error, 'This hub is inactive');
        assert.equal(taken.status, 409);
        assert.equal(taken.body.error, 'This phone number already belongs to rider YS-OLD');
    });
});

describe('Sending back, holding and rejecting', () => {
    it('sends rejected items back; the rider fixes only those and lands in Re-approve', async () => {
        const { token, applicationId } = await submittedApplication();
        await review(applicationId, 'pan', 'Rejected', 'Photo is blurred');

        const res = await h.api('POST', `${base(applicationId)}/request-changes`, { steps: ['emergency_contact'], note: 'Please also add a second contact' });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body.application.fixSteps, ['pan', 'emergency_contact']);

        const onboarding = (await getOnboarding(token)).body;
        assert.equal(onboarding.status, 'Changes Requested');
        assert.equal(onboarding.changeNote, 'Please also add a second contact');
        assert.equal(onboarding.steps.find(step => step.key === 'pan').reason, 'Photo is blurred');

        assert.equal((await STEP_SAVES.bank(token)).status, 409);
        assert.equal((await STEP_SAVES.pan(token)).status, 200);
        assert.equal((await STEP_SAVES['emergency-contact'](token)).status, 200);
        assert.equal((await submit(token)).body.status, 'Resubmitted');

        const list = await h.api('GET', '/api/onboarding/applications?tab=reapprove');
        assert.deepEqual(list.body.applications.map(app => app.applicationId), [applicationId]);
        assert.equal((await getApplication(applicationId)).body.application.documents.pan.reviewStatus, 'Pending');
    });

    it('needs at least one step to send back', async () => {
        const { applicationId } = await submittedApplication();

        const none = await h.api('POST', `${base(applicationId)}/request-changes`, { steps: [] });
        const unknown = await h.api('POST', `${base(applicationId)}/request-changes`, { steps: ['passport'] });

        assert.equal(none.status, 400);
        assert.equal(unknown.status, 400);
    });

    it('holds with a reason and releases back to where it was', async () => {
        const { token, applicationId } = await submittedApplication();

        const noReason = await h.api('POST', `${base(applicationId)}/hold`, {});
        const held = await h.api('POST', `${base(applicationId)}/hold`, { reason: 'Waiting for police verification' });
        await verifyAll(applicationId);
        const approveWhileHeld = await approve(applicationId);
        const released = await h.api('POST', `${base(applicationId)}/release`);

        assert.equal(noReason.status, 400);
        assert.equal(held.body.application.status, 'On Hold');
        assert.equal((await getOnboarding(token)).body.status, 'Pending Review');
        assert.equal(approveWhileHeld.status, 409);
        assert.equal(released.body.application.status, 'Pending Review');
        assert.equal(released.body.application.holdReason, null);
    });

    it('rejects with a reason, and a rejected application is closed', async () => {
        const { token, applicationId } = await submittedApplication();

        const noReason = await h.api('POST', `${base(applicationId)}/reject`, {});
        const res = await h.api('POST', `${base(applicationId)}/reject`, { reason: 'Licence is not valid for this vehicle' });

        assert.equal(noReason.status, 400);
        assert.equal(res.body.application.status, 'Rejected');
        assert.equal((await getOnboarding(token)).body.rejectReason, 'Licence is not valid for this vehicle');
        assert.equal((await review(applicationId, 'pan', 'Verified')).status, 409);
        assert.equal((await approve(applicationId)).status, 409);
        assert.equal((await h.api('POST', `${base(applicationId)}/hold`, { reason: 'x' })).status, 409);
    });
});

describe('Who can review', () => {
    it('lets staff and onboarding users review, but not team leaders', async () => {
        const { applicationId } = await submittedApplication();
        const asStaff = { Cookie: await h.signIn(await h.createUser({ email: 'staff@test.local' })) };
        const asOnboarding = { Cookie: await h.signIn(await h.createUser({ email: 'exec@test.local', role: 'onboarding' })) };
        const asLeader = { Cookie: await h.signIn(await h.createUser({ email: 'tl@test.local', role: 'team_leader' })) };

        assert.equal((await h.api('GET', '/api/onboarding/applications', undefined, asStaff)).status, 200);
        assert.equal((await review(applicationId, 'pan', 'Verified', undefined, asOnboarding)).status, 200);
        assert.equal((await h.api('GET', '/api/onboarding/approval-options', undefined, asOnboarding)).status, 200);
        assert.equal((await h.api('GET', '/api/onboarding/applications', undefined, asLeader)).status, 403);
        assert.equal((await review(applicationId, 'pan', 'Verified', undefined, asLeader)).status, 403);
    });
});

describe('Rider page Onboarding and Documents tabs', () => {
    it('links the approved rider to the application, but team leaders cannot open it, even for their own rider', async () => {
        const { applicationId } = await submittedApplication();
        const leaderId = await h.createUser({ email: 'tl@test.local', role: 'team_leader' });
        const asLeader = { Cookie: await h.signIn(leaderId) };
        await verifyAll(applicationId);
        const { body: { application } } = await approve(applicationId, { teamLeaderIds: [leaderId] });
        const fileId = application.documents.aadhaar.files[0].fileId;

        const profile = await h.api('GET', `/api/riders/${application.riderId}/profile`);
        assert.equal(profile.body.application.applicationId, applicationId);
        assert.equal((await h.api('GET', `${base(applicationId)}/files/${fileId}`)).status, 200);

        assert.equal((await h.api('GET', `/api/riders/${application.riderId}/profile`, undefined, asLeader)).status, 200);
        assert.equal((await h.api('GET', base(applicationId), undefined, asLeader)).status, 403);
        assert.equal((await h.api('GET', `${base(applicationId)}/files/${fileId}`, undefined, asLeader)).status, 403);
    });
});
