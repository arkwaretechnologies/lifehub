-- Backfill encounter visit date/time from created_at in clinic timezone (Asia/Manila).
-- Run in Supabase SQL editor when encounters were saved with UTC CURRENT_DATE (off-by-one near midnight).
--
-- Preview mismatches:
-- select trans_id, encounter_date, encounter_time, created_at,
--   timezone('Asia/Manila', created_at)::date as expected_date,
--   timezone('Asia/Manila', created_at)::time as expected_time
-- from encounters
-- where encounter_date is distinct from timezone('Asia/Manila', created_at)::date
--    or encounter_time is null;

update encounters e
set
  encounter_date = timezone('Asia/Manila', e.created_at)::date,
  encounter_time = coalesce(e.encounter_time, timezone('Asia/Manila', e.created_at)::time)
where e.created_at is not null
  and (
    e.encounter_date is distinct from timezone('Asia/Manila', e.created_at)::date
    or e.encounter_time is null
  );
