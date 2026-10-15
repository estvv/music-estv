// Page addresses used across the app, in one place.
export const PROFILE_SETTINGS_PATH = '/profiles/update';

// Public profile, designated by the player's username.
export const profilePath = (username: string) => `/profiles/${encodeURIComponent(username)}`;
