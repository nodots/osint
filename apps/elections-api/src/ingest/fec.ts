import { unzipSync } from "fflate";

// FEC bulk candidate master (cn.zip) parsing, shared by the candidate and
// ratings seeds. U.S. government work, public domain, no API key or rate
// limit. Layout: https://www.fec.gov/campaign-finance-data/candidate-master-file-description/

// Cycle-parameterized (ELECTION_CYCLE) so historical baselines replay the
// identical pipeline against past elections.
export const ELECTION_CYCLE = Number(process.env.ELECTION_CYCLE ?? 2026);
const YY = String(ELECTION_CYCLE % 100).padStart(2, "0");
export const FEC_CN_URL =
  process.env.FEC_CN_URL ??
  `https://www.fec.gov/files/bulk-downloads/${ELECTION_CYCLE}/cn${YY}.zip`;

export interface FecCandidate {
  candId: string;
  name: string; // FEC "LAST, FIRST" form
  party: string; // CAND_PTY_AFFILIATION, e.g. "DEM" | "REP"
  state: string;
  district: string; // two-digit, "00" = at-large
  incumbentChallengerOpen: string; // "I" | "C" | "O"
}

export async function loadZipEntry(
  localPath: string | undefined,
  url: string,
  suffix: string,
): Promise<Uint8Array> {
  let bytes: Uint8Array;
  if (localPath) {
    const { readFile } = await import("node:fs/promises");
    bytes = await readFile(localPath);
  } else {
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`download failed: ${res.status} ${res.statusText} ${url}`);
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  const zip = unzipSync(bytes);
  const entry = Object.entries(zip).find(([n]) => n.endsWith(suffix))?.[1];
  if (!entry) {
    throw new Error(
      `zip has no ${suffix} entry (contains: ${Object.keys(zip).join(", ")})`,
    );
  }
  return entry;
}

// Cycle statutory House candidates (CAND_STATUS "C").
export function parseHouseCandidates(cnTxt: Uint8Array): FecCandidate[] {
  const out: FecCandidate[] = [];
  for (const line of new TextDecoder().decode(cnTxt).split("\n")) {
    if (!line.trim()) continue;
    const f = line.split("|");
    // CAND_ID|CAND_NAME|CAND_PTY_AFFILIATION|CAND_ELECTION_YR|CAND_OFFICE_ST|
    // CAND_OFFICE|CAND_OFFICE_DISTRICT|CAND_ICI|CAND_STATUS|...
    if (f[5] !== "H" || f[3] !== String(ELECTION_CYCLE) || f[8] !== "C") continue;
    out.push({
      candId: f[0] ?? "",
      name: f[1] ?? "",
      party: f[2] ?? "",
      state: f[4] ?? "",
      district: f[6] ?? "",
      incumbentChallengerOpen: f[7] ?? "",
    });
  }
  return out;
}

export function fecDistrictId(state: string, district: string): string {
  return district === "00" ? `${state}-AL` : `${state}-${district}`;
}

// "CARL, JERRY LEE, JR" -> "Jerry Lee Carl Jr". FEC names also carry
// honorifics ("KAPTUR, MARCY HON. M.C.") and misplaced suffixes
// ("BEGICH, NICHOLAS III"), so those tokens are stripped/reordered.
const HONORIFICS = new Set(["HON", "MC", "MR", "MRS", "MS", "DR", "REP", "SEN"]);
const SUFFIXES: Record<string, string> = {
  JR: "Jr",
  SR: "Sr",
  II: "II",
  III: "III",
  IV: "IV",
  V: "V",
};

export function displayName(fecName: string): string {
  const [last = "", ...rest] = fecName.split(",").map((p) => p.trim());
  const suffixes: string[] = [];
  const firstTokens: string[] = [];
  for (const token of rest.join(" ").split(/\s+/).filter(Boolean)) {
    const bare = token.replace(/\./g, "").toUpperCase();
    if (SUFFIXES[bare]) suffixes.push(SUFFIXES[bare]);
    else if (!HONORIFICS.has(bare)) firstTokens.push(token);
  }
  const titled = [...firstTokens, last]
    .join(" ")
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  return [titled, ...suffixes].join(" ").trim();
}
