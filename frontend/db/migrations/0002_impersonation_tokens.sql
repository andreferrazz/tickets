-- 0002_impersonation_tokens.sql
--
-- An admin's "log in as this user" link used to carry a regular 30-day session
-- token, and opening any link with any live session token signed the opener in.
-- Links now carry one of these instead: minted only by an admin, valid for a
-- few minutes, dead after one use.

CREATE TABLE public.impersonation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    token character varying(64) NOT NULL,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_by_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at timestamp(0) without time zone NOT NULL,
    used_at timestamp(0) without time zone,
    inserted_at timestamp(0) without time zone NOT NULL
);

CREATE UNIQUE INDEX impersonation_tokens_token_index ON public.impersonation_tokens USING btree (token);
