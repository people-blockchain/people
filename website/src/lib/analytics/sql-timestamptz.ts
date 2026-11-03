/** Bind timestamps for raw `db.execute(sql\`...\`)` (postgres-js rejects `Date` params). */
export function sqlTimestamptz(value: Date): string {
  return value.toISOString();
}
