-- Avatar choice. An integer index into a fixed palette rather than an uploaded
-- image: no file storage, no moderation problem, no way to upload something
-- that should not be on a school account.
ALTER TABLE users ADD COLUMN avatar INTEGER NOT NULL DEFAULT 0;
