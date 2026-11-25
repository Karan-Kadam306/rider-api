const express = require('express');
const router = express.Router();

const controller = require('../controllers/riderOnboardingController');
const uploadDocument = require('../middleware/uploadDocument');

// Mounted at /api/rider-app behind requireRider: every route works on the signed-in phone's application.
const frontAndBack = uploadDocument.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]);

router.get('/plans', controller.getPlans);
router.get('/policies/current', controller.getCurrentPolicy);

router.get('/onboarding', controller.getOnboarding);
router.put('/onboarding/personal', controller.savePersonal);
router.put('/onboarding/address', frontAndBack, controller.saveAddress);
router.put('/onboarding/aadhaar', frontAndBack, controller.saveIdDocument('aadhaar'));
router.put('/onboarding/pan', uploadDocument.fields([{ name: 'front', maxCount: 1 }]), controller.saveIdDocument('pan'));
router.put('/onboarding/dl', frontAndBack, controller.saveIdDocument('dl'));
router.put('/onboarding/selfie', uploadDocument.single('photo'), controller.saveSelfie);
router.put('/onboarding/emergency-contact', controller.saveEmergencyContact);
router.put('/onboarding/policies', controller.acceptPolicy);
router.put('/onboarding/bank', controller.saveBank);
router.put('/onboarding/plan', controller.savePlan);
router.post('/onboarding/submit', controller.submit);

module.exports = router;
