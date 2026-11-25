const AppError = require('../errors/AppError');
const onboardingService = require('../services/onboardingService');

// The signed-in phone's application (set by requireRider). Riders added before the app have none.
function applicationIdOf(req) {
    if (!req.rider.applicationId) {
        throw new AppError('No application found for this number', 404);
    }

    return req.rider.applicationId;
}

// Uploaded files by field name, e.g. { front: Buffer, back: Buffer }.
function uploadsOf(req) {
    return Object.fromEntries(Object.entries(req.files ?? {}).map(([field, [file]]) => [field, file.buffer]));
}

// GET /api/rider-app/onboarding
// Status, step progress and the details entered so far (ID numbers masked).
async function getOnboarding(req, res, next) {
    try {
        return res.status(200).json(await onboardingService.getOnboarding(applicationIdOf(req)));
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/personal
// Body: { firstName, surname, dateOfBirth }.
async function savePersonal(req, res, next) {
    try {
        const onboarding = await onboardingService.savePersonal({
            applicationId: applicationIdOf(req),
            details: req.body
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/address
// Multipart: addressLine1, addressLine2, city, state, pincode, addressProofKind; files front, back (optional).
async function saveAddress(req, res, next) {
    try {
        const onboarding = await onboardingService.saveAddress({
            applicationId: applicationIdOf(req),
            body: req.body,
            uploads: uploadsOf(req)
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/aadhaar | pan | dl
// Multipart: number, expiryDate (DL only); files front, back (not for PAN).
function saveIdDocument(docType) {
    return async (req, res, next) => {
        try {
            const onboarding = await onboardingService.saveIdDocument({
                applicationId: applicationIdOf(req),
                docType,
                number: req.body?.number,
                expiryDate: req.body?.expiryDate,
                uploads: uploadsOf(req)
            });

            return res.status(200).json(onboarding);
        } catch (error) {
            return next(error);
        }
    };
}

// PUT /api/rider-app/onboarding/selfie
// Multipart: file photo (JPEG or PNG).
async function saveSelfie(req, res, next) {
    try {
        const onboarding = await onboardingService.saveSelfie({
            applicationId: applicationIdOf(req),
            photo: req.file?.buffer
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/emergency-contact
// Body: { name, relation, phone }.
async function saveEmergencyContact(req, res, next) {
    try {
        const onboarding = await onboardingService.saveEmergencyContact({
            applicationId: applicationIdOf(req),
            body: req.body
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/policies
// Body: { policyVersionId }, the version from GET /policies/current.
async function acceptPolicy(req, res, next) {
    try {
        const onboarding = await onboardingService.acceptPolicy({
            applicationId: applicationIdOf(req),
            policyVersionId: req.body?.policyVersionId,
            ipAddress: req.ip,
            deviceInfo: req.get('User-Agent')
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/bank
// Body: { accountNumber, ifsc, holderName }.
async function saveBank(req, res, next) {
    try {
        const onboarding = await onboardingService.saveBank({
            applicationId: applicationIdOf(req),
            body: req.body
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// PUT /api/rider-app/onboarding/plan
// Body: { planType: 'Postpaid' | 'Prepaid', packId } (packId for Prepaid only).
async function savePlan(req, res, next) {
    try {
        const onboarding = await onboardingService.savePlan({
            applicationId: applicationIdOf(req),
            planType: req.body?.planType,
            packId: req.body?.packId
        });

        return res.status(200).json(onboarding);
    } catch (error) {
        return next(error);
    }
}

// POST /api/rider-app/onboarding/submit
// Sends the application for review.
async function submit(req, res, next) {
    try {
        return res.status(200).json(await onboardingService.submit({ applicationId: applicationIdOf(req) }));
    } catch (error) {
        return next(error);
    }
}

// GET /api/rider-app/plans
// Today's postpaid rate, the weekly packs on sale and the deposit.
async function getPlans(req, res, next) {
    try {
        return res.status(200).json(await onboardingService.getPlans());
    } catch (error) {
        return next(error);
    }
}

// GET /api/rider-app/policies/current
async function getCurrentPolicy(req, res, next) {
    try {
        return res.status(200).json({ policy: await onboardingService.getCurrentPolicy() });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getOnboarding,
    savePersonal,
    saveAddress,
    saveIdDocument,
    saveSelfie,
    saveEmergencyContact,
    acceptPolicy,
    saveBank,
    savePlan,
    submit,
    getPlans,
    getCurrentPolicy
};
