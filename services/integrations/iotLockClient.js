const crypto = require('crypto');

// Mock of the IoT service that locks and unlocks a bike remotely.
// The real client calls the IoT API with the same arguments and returns the same shape.
// Set MOCK_IOT_FAIL=true to make every call fail, e.g. to try the Failed lock path.

function failIfAsked(action) {
    if (process.env.MOCK_IOT_FAIL === 'true') {
        throw new Error(`IoT ${action} failed (MOCK_IOT_FAIL)`);
    }
}

// Lock a bike. Returns the IoT service's reference for the lock.
async function lockBike(bikeId) {
    failIfAsked('lock');
    return { lockRef: `MOCK-LOCK-${bikeId}-${crypto.randomBytes(4).toString('hex')}` };
}

async function unlockBike(bikeId) {
    failIfAsked('unlock');
    return { lockRef: `MOCK-UNLOCK-${bikeId}-${crypto.randomBytes(4).toString('hex')}` };
}

module.exports = {
    lockBike,
    unlockBike
};
