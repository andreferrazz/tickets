-- 0004_single_organization.sql
--
-- One deployment serves one organization from now on, so the organization is
-- the database itself. The role a person held in the organization moves onto
-- their users row (creator becomes member; leader stays leader; scan-only
-- staff stays staff), invitations and events stop pointing at an organization,
-- and the two organization tables go.
--
-- Refuses a database holding more than one organization: collapsing two
-- organizations' memberships into one role column would silently merge them.

DO $$
DECLARE
    organization_count integer;
BEGIN
    SELECT count(*) INTO organization_count FROM public.organizations;
    IF organization_count > 1 THEN
        RAISE EXCEPTION 'single-organization migration expects at most 1 organizations row, found %',
            organization_count;
    END IF;
END $$;

-- Roles onto users. Precedence: leader over member over staff, admins untouched.
UPDATE public.users SET role = 'member', updated_at = now() at time zone 'utc'
WHERE role = 'creator';

UPDATE public.users u SET role = 'leader', updated_at = now() at time zone 'utc'
FROM public.organization_memberships m
WHERE m.user_id = u.id AND m.role = 'leader' AND u.role <> 'admin';

UPDATE public.users u SET role = 'member', updated_at = now() at time zone 'utc'
FROM public.organization_memberships m
WHERE m.user_id = u.id AND m.role = 'participant' AND u.role IN ('buyer', 'staff');

UPDATE public.users u SET role = 'staff', updated_at = now() at time zone 'utc'
FROM public.organization_memberships m
WHERE m.user_id = u.id AND m.role = 'staff' AND u.role = 'buyer';

ALTER TABLE public.users
    ADD CONSTRAINT users_role_valid
    CHECK (role IN ('buyer', 'staff', 'member', 'leader', 'admin'));

-- Invitations carry only the role they grant.
UPDATE public.invitations SET role = 'member' WHERE role = 'participant';
ALTER TABLE public.invitations DROP CONSTRAINT invitation_role_must_be_valid;
ALTER TABLE public.invitations
    ADD CONSTRAINT invitation_role_must_be_valid
    CHECK (role IN ('member', 'leader', 'staff'));
ALTER TABLE public.invitations DROP COLUMN organization_id;

ALTER TABLE public.events DROP COLUMN organization_id;

DROP TABLE public.organization_memberships;
DROP TABLE public.organizations;
