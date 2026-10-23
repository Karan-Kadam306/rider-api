
const RENTAL_RATE_PER_DAY = 59;

function calculateRentalCharge({
    assignmentCount,
    riderStatus,
    terminatedOn,
    usageDate
}) {
    // One or more assignments on a date is charged as one rental day.
    if (!(assignmentCount >= 1)) {
        return {
            eligible: false,
            rentalCharge: 0,
            reason: 'No assignment found for usage date'
        };
    }

    if (riderStatus === 'Terminated' && !terminatedOn) {
        return {
            eligible: false,
            rentalCharge: 0,
            reason: 'Terminated rider is missing termination date'
        };
    }

    if (
        riderStatus === 'Terminated' &&
        usageDate > terminatedOn
    ) {
        return {
            eligible: false,
            rentalCharge: 0,
            reason: 'Usage date is after the termination date'
        };
    }

    return {
        eligible: true,
        rentalRatePerDay: RENTAL_RATE_PER_DAY,
        rentalCharge: RENTAL_RATE_PER_DAY
    };
}

module.exports = {
    calculateRentalCharge,
    RENTAL_RATE_PER_DAY
};
