/**
 * The database interface this project owns. Repositories depend on this, never
 * on `pg` directly, so the driver stays swappable and tests can pass a fake.
 *
 * @example
 * const rows = await queryable.query<{ id: string }>('select id from events where status = $1', [
 * 	'published'
 * ]);
 */
export interface Queryable {
	query<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
}
