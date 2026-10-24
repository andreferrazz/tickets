-- 0003_drop_payouts.sql
--
-- Withdrawals leave the app: organizers take their money out from the Abacate
-- Pay dashboard instead of the event dashboard's withdraw dialog. The history
-- of past payouts lives on at Abacate Pay, so the table goes with the feature.
-- The organizations' Pix key columns stay until the organizations table itself
-- is dropped by the single-organization migration.

DROP TABLE public.payouts;
