// How a bike is named in messages and titles: its registration number, or its chassis number
// (VIN) before it has one. Never the internal bike ID, which admins do not see.
export function bikeLabel({ registrationNumber, chassisNumber }) {
    return registrationNumber ?? chassisNumber;
}
