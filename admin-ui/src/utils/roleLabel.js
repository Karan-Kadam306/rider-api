const ROLE_LABELS = {
    admin: 'Admin',
    staff: 'Staff',
    team_leader: 'Team leader'
};

// "team_leader" → "Team leader"; an unknown role is shown as it is.
export function roleLabel(role) {
    return ROLE_LABELS[role] ?? role;
}
