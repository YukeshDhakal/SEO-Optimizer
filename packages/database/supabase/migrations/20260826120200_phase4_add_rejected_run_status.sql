alter table pipeline_runs drop constraint pipeline_runs_status_check;
alter table pipeline_runs add constraint pipeline_runs_status_check
  check (status in ('running','succeeded','failed','blocked','rejected'));
