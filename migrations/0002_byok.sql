-- Adds bring-your-own-key columns to an existing deployment.
-- New deployments get these from schema.sql and do not need this file.
ALTER TABLE users ADD COLUMN ai_provider TEXT;
ALTER TABLE users ADD COLUMN ai_model TEXT;
ALTER TABLE users ADD COLUMN ai_key_encrypted TEXT;
ALTER TABLE users ADD COLUMN ai_key_hint TEXT;
