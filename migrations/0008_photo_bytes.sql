-- ARB-E10 cost guardrail: record each photo's stored byte size so the Worker
-- can sum total R2 usage cheaply (from D1, no R2 listing) and refuse uploads
-- that would cross the free-tier storage budget. Existing rows default to 0.

ALTER TABLE photos ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
