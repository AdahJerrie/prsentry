DROP INDEX IF EXISTS idx_installations_installed_by;
ALTER TABLE installations DROP COLUMN IF EXISTS installed_by;
DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
