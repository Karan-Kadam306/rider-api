const ENERGY_RATE_PER_KM = 1.50;

// Calculates the energy charge for a given record based on daily kilometers, record status, bike ID, and rider ID.
function calculateEnergyCharge({
    dailyKm,
    recordStatus,
    bikeId,
    riderId
}) {
    if (recordStatus !== 'Validated') {
        return {
            eligible: false,
            energyCharge: 0,
            reason: `Record status is ${recordStatus}; validation is required`
        };
    }

    if (bikeId == null || riderId == null) {
        return {
            eligible: false,
            energyCharge: 0,
            reason: 'Bike and rider must be matched'
        };
    }

    const km = Number(dailyKm);

    if (!Number.isFinite(km) || km < 0) {
        return {
            eligible: false,
            energyCharge: 0,
            reason: 'Daily KM must be a valid non-negative number'
        };
    }

    return {
        eligible: true,
        dailyKm: km,
        ratePerKm: ENERGY_RATE_PER_KM,
        energyCharge: Math.round(km * ENERGY_RATE_PER_KM * 100) / 100
    };
}

module.exports = {
    calculateEnergyCharge,
    ENERGY_RATE_PER_KM
};
