-- Distinguish a visit the member actually scanned out of from one the hourly sweep
-- closed on their behalf. Without this the two are indistinguishable, so any average
-- visit duration silently mixes measured time with estimated time.
--
-- Existing rows keep `checked_out`; historical durations are NOT rewritten here. That
-- is an operational data decision for the club to make, not a side effect of a deploy.
ALTER TABLE `club_attendance`
  MODIFY `status` ENUM('checked_in', 'checked_out', 'auto_closed') NOT NULL DEFAULT 'checked_in';
