import { unzipSync } from "fflate";
import * as shapefile from "shapefile";
import { pool } from "../db/client.js";

// Import the 435 voting congressional districts (geometry + metadata) from the
// Census cartographic boundary file for the 119th Congress. Generalized 1:500k
// shapes — right resolution for a national web map, ~7MB download. Spec §36
// step 2; member/party/PVI/population columns are filled by later seeds.
//
// Usage:
//   pnpm --filter @elections-tracker/api seed:districts [path-to-zip]
// With no argument the zip is fetched from the Census server.

const CENSUS_ZIP_URL =
  process.env.CENSUS_CD_ZIP_URL ??
  "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip";

const CYCLE = Number(process.env.ELECTION_CYCLE ?? 2026);

// State FIPS → USPS for the 50 states. DC (11) and the territories elect
// non-voting delegates (CD code 98) and are excluded from the House count.
const STATE_FIPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "12": "FL", "13": "GA", "15": "HI", "16": "ID",
  "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA",
  "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ",
  "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK",
  "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN",
  "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

interface CdProperties {
  STATEFP: string;
  NAMELSAD: string;
  // The district-code field is congress-numbered (CD118FP, CD119FP, ...);
  // resolved per file below.
  [key: string]: string;
}

function cdField(props: CdProperties): string | null {
  const key = Object.keys(props).find((k) => /^CD\d+FP$/.test(k));
  return key ? (props[key] ?? null) : null;
}

async function loadZip(): Promise<Uint8Array> {
  const localPath = process.argv[2];
  if (localPath) {
    const { readFile } = await import("node:fs/promises");
    return await readFile(localPath);
  }
  console.log(`Downloading ${CENSUS_ZIP_URL}`);
  const res = await fetch(CENSUS_ZIP_URL);
  if (!res.ok) {
    throw new Error(`Census download failed: ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer; // Uint8Array.buffer is ArrayBufferLike; fflate output is never SharedArrayBuffer
}

async function main() {
  const zip = unzipSync(await loadZip());
  const shp = Object.entries(zip).find(([n]) => n.endsWith(".shp"))?.[1];
  const dbf = Object.entries(zip).find(([n]) => n.endsWith(".dbf"))?.[1];
  if (!shp || !dbf) {
    throw new Error(
      `zip is missing .shp/.dbf (contains: ${Object.keys(zip).join(", ")})`,
    );
  }

  const source = await shapefile.open(toArrayBuffer(shp), toArrayBuffer(dbf));

  let seen = 0;
  let upserted = 0;
  let skipped = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (;;) {
      const result = await source.read();
      if (result.done) break;
      seen++;
      const feature = result.value;
      const props = feature.properties as unknown as CdProperties; // shapefile types properties as GeoJsonProperties (nullable bag); the DBF schema is fixed
      const state = STATE_FIPS[props.STATEFP];
      const cd = cdField(props);
      // "98" is the non-voting-delegate code (DC, PR, territories); "ZZ" marks
      // area undefined in any district.
      if (!state || cd == null || cd === "98" || cd === "ZZ") {
        skipped++;
        continue;
      }
      const atLarge = cd === "00";
      const districtNumber = atLarge ? 0 : Number(cd);
      const id = atLarge ? `${state}-AL` : `${state}-${cd}`;
      const displayName = atLarge
        ? `${STATE_NAMES[state]} At-Large`
        : `${STATE_NAMES[state]} ${districtNumber}${ordinal(districtNumber)} District`;

      const geometry =
        feature.geometry.type === "Polygon"
          ? { type: "MultiPolygon", coordinates: [feature.geometry.coordinates] }
          : feature.geometry;

      await client.query(
        `INSERT INTO districts (id, state, district_number, display_name, cycle, geom)
         VALUES ($1, $2, $3, $4, $5, ST_Multi(ST_GeomFromGeoJSON($6))::geography)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           district_number = EXCLUDED.district_number,
           display_name = EXCLUDED.display_name,
           cycle = EXCLUDED.cycle,
           geom = EXCLUDED.geom`,
        [id, state, districtNumber, displayName, CYCLE, JSON.stringify(geometry)],
      );
      upserted++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(
    `Districts: ${seen} features read, ${upserted} upserted, ${skipped} skipped (delegates/undefined).`,
  );
  if (upserted !== 435) {
    console.warn(`Expected 435 voting districts, upserted ${upserted}.`);
  }
  await pool.end();
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
