-- Quick fix only: run this if the big migration failed on reports_insert policy.
-- Your DB already has reports.reporter_id (not reporter_uid).

drop policy if exists reports_insert on public.reports;

create policy reports_insert on public.reports
  for insert
  with check (auth.uid() = reporter_id);
