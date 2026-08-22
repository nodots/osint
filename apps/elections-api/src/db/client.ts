import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

// Return DATE columns (OID 1082) as the raw "YYYY-MM-DD" string rather than a
// JS Date. Otherwise res.json serializes them to a full UTC timestamp, which
// shifts the day across timezones and breaks the frontend's date math.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (v) => v);

// Return BIGINT (OID 20) as a JS number. pg defaults to strings because int8
// can exceed 2^53, but every int8 here is a bigserial id or a count — far
// below that — and the API contract types them as numbers.
const INT8_OID = 20;
pg.types.setTypeParser(INT8_OID, (v) => Number(v));

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://osint:osint@localhost:5432/elections_tracker";

// Pin every connection to UTC (via a server option, set at connect time with no
// extra round-trip) so date bucketing is deterministic regardless of the host
// machine's timezone.
export const pool = new pg.Pool({
  connectionString,
  options: "-c timezone=UTC",
});
export const db = drizzle(pool, { schema });
