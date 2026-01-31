-- Migration: Update pg_cron schedules for new job queue system
-- Run this in Supabase SQL Editor after deploying the new routes

-- First, remove the old cron job (if it exists)
-- Note: You may need to check the existing job name with: SELECT * FROM cron.job;
SELECT cron.unschedule('generate-reflections');

-- Schedule the new scheduler (creates pending jobs)
-- Runs every 15 minutes - this is FAST, just creates jobs
SELECT cron.schedule(
  'schedule-reflections',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://jotgrowsideas.com/api/cron/schedule-reflections',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  );
  $$
);

-- Schedule the worker (processes pending jobs)
-- Runs every 2 minutes - processes jobs until timeout
SELECT cron.schedule(
  'process-reflection-jobs',
  '*/2 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://jotgrowsideas.com/api/cron/process-jobs',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  );
  $$
);

-- Alternative: If you prefer to pass CRON_SECRET directly (replace YOUR_CRON_SECRET with actual value):
/*
SELECT cron.schedule(
  'schedule-reflections',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://jotgrowsideas.com/api/cron/schedule-reflections',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'process-reflection-jobs',
  '*/2 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://jotgrowsideas.com/api/cron/process-jobs',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
*/

-- To verify the schedules were created:
-- SELECT * FROM cron.job;

-- To check job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
