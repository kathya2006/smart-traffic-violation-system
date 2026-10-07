// Shared, in-memory app state.
export const state = {
  user: null,        // current user (from /api/auth/me)
  meta: null,        // dropdown data (violation types, locations, ...)
  refreshBadges: () => {},
  navigate: (hash) => { location.hash = hash; },
};

export const isStaff = () => state.user && (state.user.role === 'officer' || state.user.role === 'admin');
