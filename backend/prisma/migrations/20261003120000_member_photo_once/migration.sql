-- Durable self-service lock: staff may replace/clear a photo without unlocking the app.
ALTER TABLE `club_members` ADD COLUMN `profile_photo_locked` BOOLEAN NOT NULL DEFAULT false;
UPDATE `club_members`
SET `profile_photo_locked` = true
WHERE (profile_picture IS NOT NULL AND LOWER(TRIM(profile_picture)) NOT IN ('', '0', 'null')
  AND LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(profile_picture), '?', 1), '/', -1)) NOT IN ('logo.png', 'user.png', 'no-image.png'))
OR EXISTS (SELECT 1 FROM business_audit_log a
  WHERE a.entity_type = 'club_member' AND CAST(a.entity_id AS BINARY) = CAST(club_members.id AS BINARY)
    AND a.action = 'profile.photo.updated');
