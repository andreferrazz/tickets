import { queryRows } from './sql';
import { uniqueEmail, uniqueToken } from './unique';

export interface SeededPerson {
    id: string;
    email: string;
    /** A session of their own, so a spec can sign in as them and log out freely. */
    token: string;
}

export interface NewPerson {
    role: 'buyer' | 'creator';
    membership?: { organizationId: string; role: 'participant' | 'staff' };
    /** A boleto is issued to a name and a tax id; only its buyers need one. */
    taxId?: string;
}

/**
 * A person with a complete profile, optionally a member of an organization,
 * and a session. For specs whose subject is what that person may do, not how
 * they came to exist; the invitation flow has its own spec.
 */
export async function seedPerson(person: NewPerson): Promise<SeededPerson> {
    const email = uniqueEmail(person.role);
    const [{ id }] = await queryRows<{ id: string }>(
        `insert into users (email, role, name, tax_id, abacate_customer_id, inserted_at, updated_at)
         values ($1, $2, 'E2E Seeded', $3, 'cust_e2e_seeded', now() at time zone 'utc', now() at time zone 'utc')
         returning id`,
        [email, person.role, person.taxId ?? null]
    );
    if (person.membership) {
        await queryRows(
            `insert into organization_memberships (organization_id, user_id, role, inserted_at, updated_at)
             values ($1, $2, $3, now() at time zone 'utc', now() at time zone 'utc')`,
            [person.membership.organizationId, id, person.membership.role]
        );
    }
    return { id, email, token: await seedSession(id) };
}

/** A fresh one-day session for `userId`. */
export async function seedSession(userId: string): Promise<string> {
    const token = uniqueToken('e2e-session');
    await queryRows(
        `insert into sessions (user_id, token, expires_at, inserted_at)
         values ($1, $2, (now() at time zone 'utc') + interval '1 day', now() at time zone 'utc')`,
        [userId, token]
    );
    return token;
}

export interface NewInvitation {
    email: string;
    inviterId: string;
    organizationId: string;
    /** Already past its expiry, for the refusal path. */
    expired?: boolean;
}

/** A pending participant invitation written straight to the table; returns its link token. */
export async function seedInvitation(invitation: NewInvitation): Promise<string> {
    const token = uniqueToken('e2e-invite');
    const offset = invitation.expired ? "- interval '1 hour'" : "+ interval '1 day'";
    await queryRows(
        `insert into invitations (inviter_id, organization_id, role, email, status, token, expires_at, inserted_at)
         values ($1, $2, 'participant', $3, 'pending', $4, (now() at time zone 'utc') ${offset},
                 now() at time zone 'utc')`,
        [invitation.inviterId, invitation.organizationId, invitation.email, token]
    );
    return token;
}
