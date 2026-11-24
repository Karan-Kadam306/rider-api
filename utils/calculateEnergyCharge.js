// Calculates the energy charge for a given record based on daily kilometers, record status, bike ID, and rider ID.
// ratePerKm is the postpaid energy rate in effect on the record's usage date.
function calculateEnergyCharge({
    dailyKm,
    recordStatus,
    bikeId,
    riderId,
    ratePerKm
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
        ratePerKm,
        energyCharge: Math.round(km * ratePerKm * 100) / 100
    };
}

module.exports = {
    calculateEnergyCharge
};
