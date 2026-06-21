-- Cleanup: property_members is no longer used. Access is platform-wide (every
-- authenticated user can reach every property), so per-property membership was
-- removed from all routes. Drop the now-unused table and its index.

DROP INDEX IF EXISTS idx_property_members_user;
DROP TABLE IF EXISTS property_members;
