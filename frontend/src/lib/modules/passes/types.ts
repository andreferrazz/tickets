export type PassKind = 'ticket' | 'extra';

/** A row of `passes`, as the scanner needs it. */
export interface ScannedPassRow {
    id: string;
    kind: PassKind;
    item_name: string;
    event_id: string;
    order_id: string;
    checked_in_at: Date | null;
}

/** One extra line of the order an extras pass stands for. */
export interface ExtraLineRow {
    name: string;
    quantity: number;
}

export type CheckInStatus = 'checked_in' | 'already_checked_in';

export type CheckInFailure = 'not_found' | 'forbidden' | 'wrong_event';

/** What the scan page shows after a scan; Phoenix's validate response in camelCase. */
export interface CheckInDto {
    status: CheckInStatus;
    kind: PassKind;
    itemName: string;
    /** When the pass was admitted: now, or the first time for a repeat scan. */
    checkedInAt: string | null;
    /** What to hand over for an extras pass; empty for a ticket. */
    extras: ExtraLineRow[];
}

export type CheckInResult =
    { ok: true; value: CheckInDto } | { ok: false; failure: CheckInFailure };
