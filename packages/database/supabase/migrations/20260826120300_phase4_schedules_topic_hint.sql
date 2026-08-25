-- A scheduled run has no human typing a topic hint at trigger time (unlike
-- the manual "Generate post" form) — the operator sets one niche/hint once
-- when configuring the schedule, reused by every run it triggers. No
-- default: every schedule must be created with a real hint.
alter table schedules add column topic_hint text not null default '';
alter table schedules alter column topic_hint drop default;
