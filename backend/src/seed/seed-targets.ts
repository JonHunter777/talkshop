// Databases that scripts are allowed to write to / wipe.
// Shared by the seed guard and (later) by the e2e test helpers, so the rule lives in one place.

// The only named database that the seed may touch (on any host, including Atlas).
export const SEED_DEV_DB_NAME = 'talkshop-dev';

// Throw-away e2e databases: `e2e_` + 12 hex chars. Allowed only on local hosts.
export const E2E_DB_NAME_PATTERN = /^e2e_[0-9a-f]{12}$/;

export const LOCAL_DB_HOSTS: readonly string[] = ['127.0.0.1', 'localhost'];
