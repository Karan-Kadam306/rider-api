// Names the review page uses for the API's step and item keys.

// The rider app's steps, in the app's order.
export const STEP_LABELS = {
    personal: 'Personal details',
    address: 'Address',
    aadhaar: 'Aadhaar',
    pan: 'PAN',
    dl: 'Driving licence',
    selfie: 'Selfie',
    emergency_contact: 'Emergency contact',
    policies: 'Policies',
    bank: 'Bank account',
    plan: 'Plan'
};

// Every item verified before approval, and the step that re-uploads it.
export const REVIEW_ITEMS = [
    { item: 'aadhaar', label: 'Aadhaar', step: 'aadhaar' },
    { item: 'pan', label: 'PAN', step: 'pan' },
    { item: 'dl', label: 'Driving licence', step: 'dl' },
    { item: 'address_proof', label: 'Address proof', step: 'address' },
    { item: 'selfie', label: 'Selfie', step: 'selfie' },
    { item: 'bank', label: 'Bank account', step: 'bank' }
];

// Timeline events as sentences.
export const EVENT_LABELS = {
    created: 'Signed up',
    reapplied: 'Applied again',
    submitted: 'Submitted',
    resubmitted: 'Resubmitted with fixes',
    item_verified: 'Verified an item',
    item_rejected: 'Rejected an item',
    changes_requested: 'Sent back for changes',
    held: 'Put on hold',
    released: 'Released from hold',
    rejected: 'Rejected the application',
    approved: 'Approved'
};
