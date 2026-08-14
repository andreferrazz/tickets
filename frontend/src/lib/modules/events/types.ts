/**
 * A row of the `events` table, as Postgres returns it. Column names stay
 * snake_case and timestamps stay `Date` — {@link EventMapper} is what turns this
 * into the wire shape.
 */
export interface EventRow {
    id: string;
    organization_id: string;
    created_by_id: string | null;
    title: string;
    description: string;
    tickets_description: string | null;
    location: string;
    starts_at: Date;
    ends_at: Date | null;
    cover_image_url: string | null;
    status: EventDto['status'];
    seat_selection_enabled: boolean;
    seats_per_table: number | null;
    inserted_at: Date;
    updated_at: Date;
}

export interface EventDto {
	id: string;
	organizationId: string;
	createdById: string | null;
	title: string;
	description: string;
	ticketsDescription: string | null;
	location: string;
	startsAt: string;
	endsAt: string | null;
	coverImageUrl: string | null;
	status: 'draft' | 'published' | 'cancelled' | 'closed';
	seatSelectionEnabled: boolean;
	seatsPerTable: number | null;
	createdAt: string;
	updatedAt: string;
}
