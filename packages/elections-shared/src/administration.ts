// Election-administration structure per state (methodology 2026.09.5).
//
// stateCooperation measures state government activity on election mechanisms,
// but whether that activity can be enlisted against the count depends on who
// administers elections. A statutorily balanced board (NY's 2–2, WI's 3–3)
// cannot be captured by one party's directives the way an elected or
// governor-appointed partisan official can, so the dimension is discounted
// by the administering institution's structural insulation.
//
// Classification sources: CRS R45549 ("The State and Local Role in Election
// Administration"), the EAC/NCSL state election profiles, and Election
// Reformers Network's board/commission survey. Nine states put a board or
// commission over elections (HI, IL, MD, NC, NY, OK, SC, VA, WI); five have
// a governor-appointed chief election official (DE, FL, NJ, PA, TX); the
// rest elect one (directly, by the legislature, or as lieutenant governor).
// Structures are treated as constant across the backtest window; the two
// mid-window changes (WI's commission created 2016, NC's appointing
// authority moved 2025) are documented limitations.

export type AdministrationStructure =
  | "BALANCED_BOARD" // statutory even partisan split, or nonpartisan commission
  | "PARTISAN_BOARD" // multi-member board with a partisan-majority design
  | "APPOINTED_INDIVIDUAL" // chief election official appointed by the governor
  | "ELECTED_INDIVIDUAL"; // elected (or legislature-chosen) partisan official

// Multiplier on the stateCooperation dimension: 1 = no structural insulation.
export const ADMINISTRATION_INSULATION: Record<AdministrationStructure, number> =
  {
    BALANCED_BOARD: 0.5,
    PARTISAN_BOARD: 0.75,
    APPOINTED_INDIVIDUAL: 1,
    ELECTED_INDIVIDUAL: 1,
  };

export const STATE_ADMINISTRATION: Record<string, AdministrationStructure> = {
  // Balanced boards / nonpartisan commissions.
  NY: "BALANCED_BOARD", // State Board of Elections, 2D–2R by statute
  WI: "BALANCED_BOARD", // Elections Commission, 3–3
  IL: "BALANCED_BOARD", // State Board of Elections, 4–4
  HI: "BALANCED_BOARD", // nonpartisan Chief Election Officer under a bipartisan commission
  // Boards with a partisan-majority design.
  NC: "PARTISAN_BOARD", // 3–2, majority follows the appointing authority
  VA: "PARTISAN_BOARD", // 3–2 State Board of Elections
  MD: "PARTISAN_BOARD", // 5 members, max 3 of one party
  OK: "PARTISAN_BOARD", // 3 members, max 2 of one party
  SC: "PARTISAN_BOARD", // 5-member Election Commission, governor-appointed
  // Governor-appointed chief election officials.
  DE: "APPOINTED_INDIVIDUAL",
  FL: "APPOINTED_INDIVIDUAL",
  NJ: "APPOINTED_INDIVIDUAL",
  PA: "APPOINTED_INDIVIDUAL",
  TX: "APPOINTED_INDIVIDUAL",
  // Elected (or legislature-chosen: ME, NH, TN; lieutenant governor: AK, UT).
  AL: "ELECTED_INDIVIDUAL",
  AK: "ELECTED_INDIVIDUAL",
  AZ: "ELECTED_INDIVIDUAL",
  AR: "ELECTED_INDIVIDUAL",
  CA: "ELECTED_INDIVIDUAL",
  CO: "ELECTED_INDIVIDUAL",
  CT: "ELECTED_INDIVIDUAL",
  GA: "ELECTED_INDIVIDUAL",
  ID: "ELECTED_INDIVIDUAL",
  IN: "ELECTED_INDIVIDUAL",
  IA: "ELECTED_INDIVIDUAL",
  KS: "ELECTED_INDIVIDUAL",
  KY: "ELECTED_INDIVIDUAL",
  LA: "ELECTED_INDIVIDUAL",
  ME: "ELECTED_INDIVIDUAL",
  MA: "ELECTED_INDIVIDUAL",
  MI: "ELECTED_INDIVIDUAL",
  MN: "ELECTED_INDIVIDUAL",
  MS: "ELECTED_INDIVIDUAL",
  MO: "ELECTED_INDIVIDUAL",
  MT: "ELECTED_INDIVIDUAL",
  NE: "ELECTED_INDIVIDUAL",
  NV: "ELECTED_INDIVIDUAL",
  NH: "ELECTED_INDIVIDUAL",
  NM: "ELECTED_INDIVIDUAL",
  ND: "ELECTED_INDIVIDUAL",
  OH: "ELECTED_INDIVIDUAL",
  OR: "ELECTED_INDIVIDUAL",
  RI: "ELECTED_INDIVIDUAL",
  SD: "ELECTED_INDIVIDUAL",
  TN: "ELECTED_INDIVIDUAL",
  UT: "ELECTED_INDIVIDUAL",
  VT: "ELECTED_INDIVIDUAL",
  WA: "ELECTED_INDIVIDUAL",
  WV: "ELECTED_INDIVIDUAL",
  WY: "ELECTED_INDIVIDUAL",
};

// Unknown jurisdictions (territories, DC) get no discount.
export function administrationInsulation(state: string): number {
  const structure = STATE_ADMINISTRATION[state];
  return structure ? ADMINISTRATION_INSULATION[structure] : 1;
}
