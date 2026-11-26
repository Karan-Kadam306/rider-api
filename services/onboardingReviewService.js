const { pool, inTransaction } = require('../db');
const AppError = require('../errors/AppError');
const applicationRepository = require('../repositories/applicationRepository');
const applicationDocumentRepository = require('../repositories/applicationDocumentRepository');
const reviewRepository = require('../repositories/applicationReviewRepository');
const riderRepository = require('../repositories/riderRepository');
const partnerRepository = require('../repositories/partnerRepository');
const hubService = require('./hubService');
const pricingService = require('./pricingService');
const teamLeaderService = require('./teamLeaderService');
const partnerMappingService = require('./partnerMappingService');
const fileStore = require('./storage');
const { STEPS, STEP_DOCUMENTS } = require('./onboardingService');
const { todayInIst } = require('./billingService');

// Rider Management tabs and the application statuses each one lists. 'all' lists every status.
const TABS = {
    review: ['Pending Review'],
    reapprove: ['Resubmitted'],
    hold: ['On Hold'],
    payment: ['Payment Pending'],
    bike: ['Bike Pending'],
    rejected: ['Rejected'],
    all: null
};

// Queues show the longest-waiting application first; the others the newest first.
const QUEUE_TABS = ['review', 'reapprove', 'hold', 'payment', 'bike'];

// Every item a reviewer verifies before approving: the five documents and the bank account.
const REVIEW_ITEMS = ['aadhaar', 'pan', 'dl', 'address_proof', 'selfie', 'bank'];

// The rider app step that re-uploads each item.
const ITEM_STEPS = { ...Object.fromEntries(Object.entries(STEP_DOCUMENTS).map(([step, item]) => [item, step])), bank: 'bank' };

// Waiting on the reviewer: these can be approved, held or sent back.
const IN_REVIEW = ['Pending Review', 'Resubmitted'];
// Items can also be checked while the application is on hold.
const ITEMS_OPEN = [...IN_REVIEW, 'On Hold'];
const REJECTABLE = [...ITEMS_OPEN, 'Changes Requested'];

const REASON_MAX_LENGTH = 500;
const PLAN_TYPES = ['Postpaid', 'Prepaid'];

function parseId(value, field) {
    if (!/^[1-9]\d{0,14}$/.test(String(value))) {
        throw new AppError(`${field} must be a positive whole number`, 400);
    }

    return Number(value);
}

function cleanReason(value, field, { required = true } = {}) {
    const clean = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

    if (required && !clean) {
        throw new AppError(`${field} is required`, 400);
    }

    if (clean.length > REASON_MAX_LENGTH) {
        throw new AppError(`${field} must be at most ${REASON_MAX_LENGTH} characters`, 400);
    }

    return clean || null;
}

function cleanPagination(page = 1, limit = 20) {
    page = Number(page);
    limit = Number(limit);

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError('Page must be a positive integer and limit must be between 1 and 100', 400);
    }

    return { page, limit, offset: (page - 1) * limit };
}

function cleanFilters({ hubId, planType, includeTest, search }) {
    if (planType && !PLAN_TYPES.includes(planType)) {
        throw new AppError('planType must be Postpaid or Prepaid', 400);
    }

    return {
        hubId: hubId ? parseId(hubId, 'hubId') : null,
        planType: planType || null,
        includeTest: includeTest === 'true',
        search: typeof search === 'string' ? search.trim() : ''
    };
}

// Locks the application and checks it is in one of the allowed statuses.
async function lockApplication(client, applicationId, allowed, action) {
    const application = await applicationRepository.findForUpdate(client, { applicationId });

    if (!application) {
        throw new AppError('Application not found', 404);
    }

    if (!allowed.includes(application.status)) {
        throw new AppError(`A ${application.status} application cannot be ${action}`, 409);
    }

    return application;
}

function toListItem(row) {
    return {
        applicationId: row.application_id,
        applicationNo: row.application_no,
        name: `${row.first_name} ${row.surname}`,
        phone: row.phone,
        status: row.status,
        currentStep: row.current_step,
        planType: row.plan_type,
        riderId: row.rider_id,
        hubName: row.hub_name,
        isTest: row.is_test,
        submittedAt: row.submitted_at,
        createdAt: row.created_at
    };
}

// Badge counts for every tab, with the list's filters applied.
async function getTabCounts(filters) {
    const rows = await reviewRepository.countByStatus(pool, cleanFilters(filters));
    const byStatus = Object.fromEntries(rows.map(row => [row.status, row.total]));

    return Object.fromEntries(Object.entries(TABS).map(([tab, statuses]) => [
        tab,
        (statuses ?? Object.keys(byStatus)).reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
    ]));
}

async function listApplications({ tab = 'review', page, limit, ...filters }) {
    if (!(tab in TABS)) {
        throw new AppError(`tab must be one of: ${Object.keys(TABS).join(', ')}`, 400);
    }

    const pagination = cleanPagination(page, limit);
    const rows = await reviewRepository.listApplications(pool, {
        ...cleanFilters(filters),
        statuses: TABS[tab],
        oldestFirst: QUEUE_TABS.includes(tab),
        limit: pagination.limit,
        offset: pagination.offset
    });
    const totalRecords = rows[0]?.total ?? 0;

    return {
        applications: rows.map(toListItem),
        pagination: { page: pagination.page, limit: pagination.limit, totalRecords, totalPages: Math.ceil(totalRecords / pagination.limit) }
    };
}

function toReviewItem(row) {
    return row && {
        reviewStatus: row.review_status,
        reviewReason: row.review_reason,
        reviewedBy: row.reviewed_by ?? null,
        reviewedAt: row.reviewed_at ?? null
    };
}

// Everything the review page shows. ID and account numbers stay masked; files are fetched one by one.
async function getApplication(applicationId) {
    const id = parseId(applicationId, 'applicationId');
    const info = await reviewRepository.findReviewInfo(pool, { applicationId: id });

    if (!info) {
        throw new AppError('Application not found', 404);
    }

    const [application, documents, bank, checks, events, { currentDeposit }] = await Promise.all([
        applicationRepository.findOnboarding(pool, { applicationId: id }),
        reviewRepository.findReviewDocuments(pool, { applicationId: id }),
        applicationDocumentRepository.findCurrentBankAccount(pool, { applicationId: id }),
        reviewRepository.findLatestChecks(pool, { applicationId: id }),
        reviewRepository.findEvents(pool, { applicationId: id }),
        pricingService.getPricing()
    ]);

    return {
        applicationId: id,
        applicationNo: application.application_no,
        status: application.status,
        phone: application.phone,
        riderId: info.rider_id,
        hub: info.hub_id && { hubId: info.hub_id, name: info.hub_name },
        isTest: info.is_test,
        isReapplication: info.is_reapplication,
        assistedBy: info.assisted_by,
        fixSteps: info.fix_steps,
        changeNote: application.change_note,
        holdReason: application.hold_reason,
        rejectReason: application.reject_reason,
        reviewedBy: info.reviewed_by,
        reviewedAt: info.reviewed_at,
        submittedAt: application.submitted_at,
        createdAt: info.created_at,
        profile: {
            firstName: application.first_name,
            surname: application.surname,
            dateOfBirth: application.date_of_birth,
            address: application.address_line1 && {
                addressLine1: application.address_line1,
                addressLine2: application.address_line2,
                city: application.city,
                state: application.state,
                pincode: application.pincode,
                addressProofKind: application.address_proof_kind
            },
            emergencyContact: application.emergency_name && {
                name: application.emergency_name,
                relation: application.emergency_relation,
                phone: application.emergency_phone
            }
        },
        documents: Object.fromEntries(documents.map(row => [row.doc_type, {
            numberLast4: row.number_last4,
            expiryDate: row.expiry_date,
            version: row.version,
            files: row.files,
            ...toReviewItem(row)
        }])),
        bank: bank && {
            accountLast4: bank.account_last4,
            ifsc: bank.ifsc,
            holderName: bank.holder_name,
            nameAtBank: bank.verified_name,
            verificationStatus: bank.verification_status,
            ...toReviewItem(bank)
        },
        plan: {
            planType: application.plan_type,
            pack: application.pack_id && {
                name: application.pack_name,
                price: application.pack_price,
                kmIncluded: application.pack_km_included
            },
            depositAmount: currentDeposit?.amount ?? null
        },
        policy: application.policy_version && {
            version: application.policy_version,
            acceptedAt: application.policy_accepted_at
        },
        checks: Object.fromEntries(checks.map(row => [row.kind, { status: row.status, details: row.details, checkedAt: row.created_at }])),
        timeline: events.map(row => ({
            event: row.event_type,
            fromStatus: row.from_status,
            toStatus: row.to_status,
            by: row.actor_type === 'user' ? row.actor_name : row.actor_type,
            note: row.note,
            data: row.data,
            at: row.created_at
        }))
    };
}

// Opens one uploaded file and records who looked at it.
async function openFile({ applicationId, fileId, userId, ip }) {
    const appId = parseId(applicationId, 'applicationId');
    const file = await reviewRepository.findFile(pool, { applicationId: appId, fileId: parseId(fileId, 'fileId') });

    if (!file) {
        throw new AppError('File not found', 404);
    }

    await reviewRepository.insertAccessLog(pool, {
        userId,
        applicationId: appId,
        documentId: file.document_id,
        fileId: file.file_id,
        ip
    });

    return { mimeType: file.mime_type, stream: fileStore.read(file.storage_key) };
}

// Verify or reject one document, or the bank account. A rejection needs a reason for the rider.
async function reviewItem({ applicationId, item, status, reason, userId }) {
    const id = parseId(applicationId, 'applicationId');

    if (!REVIEW_ITEMS.includes(item)) {
        throw new AppError(`item must be one of: ${REVIEW_ITEMS.join(', ')}`, 400);
    }

    if (!['Verified', 'Rejected'].includes(status)) {
        throw new AppError('status must be Verified or Rejected', 400);
    }

    const cleanedReason = status === 'Rejected' ? cleanReason(reason, 'reason') : null;

    await inTransaction(async client => {
        await lockApplication(client, id, ITEMS_OPEN, 'reviewed');

        const review = { applicationId: id, status, reason: cleanedReason, userId };
        const found = item === 'bank'
            ? await reviewRepository.reviewBankAccount(client, review)
            : await reviewRepository.reviewDocument(client, { ...review, docType: item });

        if (!found) {
            throw new AppError('This item has not been uploaded', 404);
        }

        await applicationRepository.insertEvent(client, {
            applicationId: id,
            eventType: status === 'Verified' ? 'item_verified' : 'item_rejected',
            actorType: 'user',
            actorUserId: userId,
            note: cleanedReason,
            data: { item }
        });
    });

    return getApplication(id);
}

async function hold({ applicationId, reason, userId }) {
    const id = parseId(applicationId, 'applicationId');
    const cleanedReason = cleanReason(reason, 'reason');

    await inTransaction(async client => {
        const application = await lockApplication(client, id, IN_REVIEW, 'put on hold');

        await reviewRepository.markHeld(client, { applicationId: id, reason: cleanedReason });
        await applicationRepository.insertEvent(client, {
            applicationId: id,
            eventType: 'held',
            fromStatus: application.status,
            toStatus: 'On Hold',
            actorType: 'user',
            actorUserId: userId,
            note: cleanedReason
        });
    });

    return getApplication(id);
}

// Back to the status it was held from.
async function release({ applicationId, userId }) {
    const id = parseId(applicationId, 'applicationId');

    await inTransaction(async client => {
        await lockApplication(client, id, ['On Hold'], 'released');

        const status = await reviewRepository.findStatusBeforeHold(client, { applicationId: id }) ?? 'Pending Review';

        await reviewRepository.markReleased(client, { applicationId: id, status });
        await applicationRepository.insertEvent(client, {
            applicationId: id,
            eventType: 'released',
            fromStatus: 'On Hold',
            toStatus: status,
            actorType: 'user',
            actorUserId: userId
        });
    });

    return getApplication(id);
}

// Sends steps back to the rider. Steps of rejected items are always included, so the rider
// can re-upload everything that failed.
async function requestChanges({ applicationId, steps, note, userId }) {
    const id = parseId(applicationId, 'applicationId');
    const cleanedNote = cleanReason(note, 'note', { required: false });

    if (steps !== undefined && (!Array.isArray(steps) || !steps.every(step => STEPS.includes(step)))) {
        throw new AppError(`steps must be a list of: ${STEPS.join(', ')}`, 400);
    }

    await inTransaction(async client => {
        const application = await lockApplication(client, id, IN_REVIEW, 'sent back');
        const documents = await reviewRepository.findReviewDocuments(client, { applicationId: id });
        const bank = await applicationDocumentRepository.findCurrentBankAccount(client, { applicationId: id });

        const rejectedSteps = [...documents, bank && { doc_type: 'bank', ...bank }]
            .filter(row => row?.review_status === 'Rejected')
            .map(row => ITEM_STEPS[row.doc_type]);
        // In the app's step order.
        const fixSteps = STEPS.filter(step => rejectedSteps.includes(step) || steps?.includes(step));

        if (!fixSteps.length) {
            throw new AppError('Choose at least one step for the rider to fix', 400);
        }

        await reviewRepository.markChangesRequested(client, { applicationId: id, fixSteps, note: cleanedNote });
        await applicationRepository.insertEvent(client, {
            applicationId: id,
            eventType: 'changes_requested',
            fromStatus: application.status,
            toStatus: 'Changes Requested',
            actorType: 'user',
            actorUserId: userId,
            note: cleanedNote,
            data: { steps: fixSteps }
        });
    });

    return getApplication(id);
}

async function reject({ applicationId, reason, userId }) {
    const id = parseId(applicationId, 'applicationId');
    const cleanedReason = cleanReason(reason, 'reason');

    await inTransaction(async client => {
        const application = await lockApplication(client, id, REJECTABLE, 'rejected');

        await reviewRepository.markRejected(client, { applicationId: id, reason: cleanedReason, userId });
        await applicationRepository.insertEvent(client, {
            applicationId: id,
            eventType: 'rejected',
            fromStatus: application.status,
            toStatus: 'Rejected',
            actorType: 'user',
            actorUserId: userId,
            note: cleanedReason
        });
    });

    return getApplication(id);
}

// Approval creates the rider in one transaction: the rider code, hub, team leaders and partner IDs
// are all saved, or none of them. The rider starts Inactive and becomes Active when given a bike.
async function approve({ applicationId, hubId, teamLeaderIds = [], mappings = [], note, user }) {
    const id = parseId(applicationId, 'applicationId');
    const cleanedNote = cleanReason(note, 'note', { required: false });

    if (!Array.isArray(teamLeaderIds) || !Array.isArray(mappings)) {
        throw new AppError('teamLeaderIds and mappings must be lists', 400);
    }

    const leaderIds = [...new Set(teamLeaderIds.map(leaderId => parseId(leaderId, 'teamLeaderIds')))];

    await inTransaction(async client => {
        const application = await lockApplication(client, id, IN_REVIEW, 'approved');

        const documents = await reviewRepository.findReviewDocuments(client, { applicationId: id });
        const bank = await applicationDocumentRepository.findCurrentBankAccount(client, { applicationId: id });
        const reviewStatusOf = item => (item === 'bank' ? bank : documents.find(row => row.doc_type === item))?.review_status;
        const unverified = REVIEW_ITEMS.filter(item => reviewStatusOf(item) !== 'Verified');

        if (unverified.length) {
            throw new AppError(`Verify every item before approving: ${unverified.join(', ')}`, 409);
        }

        const hub = await hubService.lockActiveHub(client, hubId);
        const existingRider = await riderRepository.findByPhone(client, application.phone);

        if (existingRider) {
            throw new AppError(`This phone number already belongs to rider ${existingRider.rider_id}`, 409);
        }

        const profile = await applicationRepository.findOnboarding(client, { applicationId: id });
        const riderId = await applicationRepository.nextRiderCode(client, todayInIst());

        await riderRepository.createRider(client, {
            riderId,
            name: `${profile.first_name} ${profile.surname}`,
            phone: application.phone,
            hubId: hub.hub_id,
            isTest: application.is_test,
            status: 'Inactive'
        });

        for (const leaderId of leaderIds) {
            await teamLeaderService.addTeamLeader(client, { riderId, userId: leaderId, actingUserId: user.userId });
        }

        if (mappings.length) {
            await partnerMappingService.addMappingsForNewRider(client, {
                actingUserId: user.userId,
                actingUserRole: user.role,
                riderId,
                mappings
            });
        }

        await reviewRepository.markApproved(client, { applicationId: id, riderId, hubId: hub.hub_id, userId: user.userId });
        await applicationRepository.insertEvent(client, {
            applicationId: id,
            eventType: 'approved',
            fromStatus: application.status,
            toStatus: 'Payment Pending',
            actorType: 'user',
            actorUserId: user.userId,
            note: cleanedNote,
            data: { riderId, hubId: hub.hub_id, teamLeaderIds: leaderIds, mappings: mappings.length }
        });
    });

    return getApplication(id);
}

// The choices the approval dialog offers.
async function getApprovalOptions() {
    const [hubs, teamLeaders, partners] = await Promise.all([
        hubService.listHubs(),
        teamLeaderService.listTeamLeaders(),
        partnerRepository.findPartners(pool)
    ]);

    return {
        hubs: hubs.filter(hub => hub.isActive).map(hub => ({ hubId: hub.hubId, code: hub.code, name: hub.name, city: hub.city })),
        teamLeaders: teamLeaders.map(leader => ({ userId: leader.userId, name: leader.name, riderCount: leader.riderCount })),
        partners: partners.map(partner => ({ partnerId: partner.partner_id, name: partner.name }))
    };
}

module.exports = {
    TABS,
    getTabCounts,
    listApplications,
    getApplication,
    openFile,
    reviewItem,
    hold,
    release,
    requestChanges,
    reject,
    approve,
    getApprovalOptions
};
