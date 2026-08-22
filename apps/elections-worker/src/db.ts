import pg from "pg";

// Mirrors the api's client: DATE as raw string, BIGINT as number, UTC pinned.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (v) => v);
const INT8_OID = 20;
pg.types.setTypeParser(INT8_OID, (v) => Number(v));

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://osint:osint@localhost:5432/elections_tracker";

export const pool = new pg.Pool({
  connectionString,
  options: "-c timezone=UTC",
});
