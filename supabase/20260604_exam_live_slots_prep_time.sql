-- Add prep_time_minutes column to exam_live_slots
alter table if exists public.exam_live_slots
  add column if not exists prep_time_minutes integer not null default 5;
