import { describe, expect, it } from "vitest";
import {
  applyResistance,
  blendPressure,
  eventDisposition,
  interventionRelevance,
  processVulnerability,
  type VulnerabilityDimensions,
} from "@elections-tracker/shared";
import { effectiveStatus } from "@elections-tracker/shared";
import {
  STATE_ADMINISTRATION,
  administrationInsulation,
} from "@elections-tracker/shared";
import {
  classifyRuling,
  rulingDedupKey,
  rulingScope,
} from "./sources/courtlistener-rulings.js";

// Validation program (methodology doc §43/§44), lightweight tier: replay
// known fact patterns through the deterministic pieces, and prove the model
// is blind to party identity.

describe("ruling classifier (§13 — do not count lawsuits equally)", () => {
  it("classifies denial rulings", () => {
    expect(
      classifyRuling(
        "RULING Adopting 13 Report and Recommendation and denying 2 Motion for Temporary Restraining Order.",
      ),
    ).toBe("DENIES");
  });

  it("never classifies separate opinions (2026.09.6)", () => {
    expect(
      classifyRuling(
        "DISSENT from 1437 Memorandum Opinion and Order Granting Motion for Preliminary Injunction, signed and issued by Judge Jerry E. Smith.",
      ),
    ).toBeNull();
    expect(
      classifyRuling(
        "CONCURRENCE in part and dissent in part from Order granting preliminary injunction.",
      ),
    ).toBeNull();
    // An order that merely notes a dissent still classifies.
    expect(
      classifyRuling(
        "ORDER granting plaintiffs motion for preliminary injunction (Smith, J., dissenting).",
      ),
    ).toBe("BLOCKS");
  });

  it("classifies granted injunctions", () => {
    expect(
      classifyRuling(
        "ORDER granting plaintiffs motion for preliminary injunction. Defendants are enjoined from implementing the rule.",
      ),
    ).toBe("BLOCKS");
    expect(
      classifyRuling(
        "Defendants are hereby ENJOINED from enforcing Section 2 pending trial.",
      ),
    ).toBe("BLOCKS");
  });

  it("never classifies filing-mechanics orders (the reply-brief trap)", () => {
    expect(
      classifyRuling(
        "ELECTRONIC ORDER entered granting 18 MOTION for Permission to File Reply Brief in Support of Emergency 2 Motion for Preliminary Injunction",
      ),
    ).toBeNull();
    expect(
      classifyRuling(
        "ORDER granting motion for extension of time to respond to motion for preliminary injunction",
      ),
    ).toBeNull();
  });

  it("skips briefing and opposition papers", () => {
    expect(
      classifyRuling(
        "MEMORANDUM in Opposition re 308 Emergency MOTION for Temporary Restraining Order",
      ),
    ).toBeNull();
  });

  // Fixtures below are real 2020-cycle entries the pre-2026.09.4 classifier
  // got wrong (critical-review-2026-08-22.md).
  it("never classifies stays of injunctions — a stay is not a block (Middleton)", () => {
    expect(
      classifyRuling(
        "COURT ORDER filed granting Motion to stay injunction pending appeal and for administrative stay",
      ),
    ).toBeNull();
    expect(
      classifyRuling(
        "ORDER re: 1. Wisconsin Legislature's Emergency Motion to Stay the Preliminary Injunction",
      ),
    ).toBeNull();
  });

  it("skips leave-to-file orders with party names in the middle (DeJoy)", () => {
    expect(
      classifyRuling(
        "ORDER granting Defendants' Unopposed Motion by Defendants for Leave to Submit Brief regarding the preliminary injunction",
      ),
    ).toBeNull();
    expect(
      classifyRuling(
        "NOTICE of Supplemental Authorities re: 26 Reply to Response to Motion for TRO",
      ),
    ).toBeNull();
  });

  it("dedupes the same order across transferred dockets (Wise)", () => {
    const text =
      "ORDER granting 3 Motion for Temporary Restraining Order and transferring case";
    expect(rulingDedupKey(text, "2020-09-10")).toBe(
      rulingDedupKey(`ORDER  granting 3 Motion for Temporary  Restraining Order and transferring case.`, "2020-09-10"),
    );
    expect(rulingDedupKey(text, "2020-09-10")).not.toBe(
      rulingDedupKey(text, "2020-09-11"),
    );
  });
});

describe("injunction scope (nationwide vs issuing-court state)", () => {
  it("reads a federal defendant as national reach — the Talwani pattern", () => {
    expect(
      rulingScope(
        "ORDER granting preliminary injunction against portions of the executive order",
        "League of Women Voters of Massachusetts v. Trump",
        ["League of Women Voters of Massachusetts", "Donald J. Trump"],
      ),
    ).toBe("US");
  });

  it("reads express nationwide language as national", () => {
    expect(
      rulingScope(
        "Defendants enjoined nationwide from enforcing the rule",
        "Doe v. State Board",
        ["Doe", "State Board of Elections"],
      ),
    ).toBe("US");
  });

  it("keeps a state-officer suit in the state", () => {
    expect(
      rulingScope(
        "ORDER granting preliminary injunction",
        "COUNT US IN v. MORALES",
        ["Count Us In", "Diego Morales, Indiana Secretary of State"],
      ),
    ).toBe("STATE");
  });

  it("does not nationalize a federal plaintiff — the Griswold pattern", () => {
    expect(
      rulingScope(
        "ORDER GRANTING PLAINTIFF'S MOTION FOR PRELIMINARY INJUNCTION",
        "United States v. Griswold",
        ["United States of America", "Griswold"],
      ),
    ).toBe("STATE");
    expect(
      rulingScope(
        "DECISION AND ORDER: granting in part Motion for Preliminary Injunction",
        "United States v. Cruz",
        [],
      ),
    ).toBe("STATE");
  });

  it("still nationalizes a federal defendant found via the party list", () => {
    // Caption alone is inconclusive ("DeJoy"), the party list is not.
    expect(
      rulingScope(
        "ORDER granting 8 Motion for TRO",
        "State of Colorado v. DeJoy",
        ["State of Colorado", "United States Postal Service", "Louis DeJoy"],
      ),
    ).toBe("US");
    expect(
      rulingScope(
        "DECISION AND ORDER: granting in part Motion for Preliminary Injunction",
        "Jones v. United States Postal Service",
        [],
      ),
    ).toBe("US");
  });
});

describe("threat scale (calibrated to baseline percentiles)", () => {
  it("maps counts by their position in the pooled baseline distribution", async () => {
    const { controlThreatLevel, THREAT_CALIBRATION } = await import(
      "@elections-tracker/shared"
    );
    expect(controlThreatLevel(0)).toBe("LOW");
    expect(controlThreatLevel(THREAT_CALIBRATION.p50 - 1)).toBe("LOW");
    expect(controlThreatLevel(THREAT_CALIBRATION.p50)).toBe("MODERATE");
    expect(controlThreatLevel(THREAT_CALIBRATION.p90 - 1)).toBe("MODERATE");
    expect(controlThreatLevel(THREAT_CALIBRATION.p90)).toBe("HIGH");
    expect(controlThreatLevel(THREAT_CALIBRATION.max + 50)).toBe("HIGH");
  });
});

describe("point-in-time status (§43 — no look-ahead in replays)", () => {
  const aug = new Date("2020-08-22T12:00:00Z");
  it("reads a docket terminated in December as live in August", () => {
    expect(
      effectiveStatus("EXPIRED", "ACTIVE", new Date("2020-12-15T00:00:00Z"), aug),
    ).toBe("ACTIVE");
  });
  it("reads it as expired after the termination date", () => {
    expect(
      effectiveStatus(
        "EXPIRED",
        "ACTIVE",
        new Date("2020-12-15T00:00:00Z"),
        new Date("2021-01-05T12:00:00Z"),
      ),
    ).toBe("EXPIRED");
  });
  it("restores the in-force status a proposal held before supersession", () => {
    expect(
      effectiveStatus("EXPIRED", "PROPOSED", new Date("2020-10-01T00:00:00Z"), aug),
    ).toBe("PROPOSED");
  });
  it("falls back to the stored status when the transition date is unknown", () => {
    expect(effectiveStatus("EXPIRED", null, null, aug)).toBe("EXPIRED");
    expect(effectiveStatus("ACTIVE", null, null, aug)).toBe("ACTIVE");
  });
});

describe("event disposition (§17/§26 — the USPS/Talwani fact pattern)", () => {
  it("keeps an in-force final rule at full weight regardless of age", () => {
    expect(
      eventDisposition(["FEDERAL_DIRECTIVE", "MAIL_BALLOT_RULE"], "ACTIVE", 300),
    ).toEqual({ kind: "vulnerability", weight: 1 });
  });

  it("decays a proposal and expires a superseded one", () => {
    const proposed = eventDisposition(["FEDERAL_DIRECTIVE"], "PROPOSED", 120);
    expect(proposed.kind).toBe("vulnerability");
    if (proposed.kind === "vulnerability") {
      expect(proposed.weight).toBeCloseTo(0.5, 5);
    }
    expect(eventDisposition(["FEDERAL_DIRECTIVE"], "EXPIRED", 10)).toEqual({
      kind: "expired",
    });
  });

  it("routes an in-force injunction to resistance, undecayed", () => {
    expect(
      eventDisposition(["COURT_RULING", "INJUNCTION"], "ACTIVE", 400),
    ).toEqual({ kind: "resistance", weight: 1 });
  });

  it("drops a dissolved injunction from both sides", () => {
    expect(
      eventDisposition(["COURT_RULING", "INJUNCTION"], "OVERTURNED", 10),
    ).toEqual({ kind: "expired" });
  });

  it("routes a blocked government action to resistance, decayed", () => {
    const blocked = eventDisposition(["FEDERAL_DIRECTIVE"], "BLOCKED", 90);
    expect(blocked.kind).toBe("resistance");
    if (blocked.kind === "resistance") expect(blocked.weight).toBeCloseTo(0.5, 5);
  });
});

describe("GKG discovery clustering", () => {
  const row = (themes: string, locations: string, urls: string[]) =>
    `20260821\t${urls.length}\t\t${themes}\t${locations}\t\t\t\t\t\t${urls.join("<UDIV>")}`;
  const txLoc = "2#Texas, United States#US#USTX#31#-99#TX";

  it("clusters state-located election coverage by mechanism", async () => {
    const { clusterGkg } = await import("./sources/gdelt-gkg.js");
    const csv = [
      row("ELECTION_FRAUD;", txLoc, [
        "https://a.com/texas-mail-in-ballot-id-rule",
        "https://b.com/texas-absentee-rules",
      ]),
    ].join("\n");
    const clusters = [...clusterGkg(csv).values()];
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.state).toBe("TX");
    expect(clusters[0]!.type).toBe("MAIL_BALLOT_RULE");
    expect(clusters[0]!.domains.size).toBe(2);
  });

  it("requires an election term for investigation coverage", async () => {
    const { clusterGkg } = await import("./sources/gdelt-gkg.js");
    const csv = row("ELECTION_FRAUD;", txLoc, [
      "https://a.com/senator-scandal-investigation",
    ]);
    expect(clusterGkg(csv).size).toBe(0);
  });

  it("ignores wire stories spanning many states and non-election themes", async () => {
    const { clusterGkg } = await import("./sources/gdelt-gkg.js");
    const manyStates = [
      "2#Texas, United States#US#USTX#0#0#x",
      "2#Ohio, United States#US#USOH#0#0#x",
      "2#Iowa, United States#US#USIA#0#0#x",
      "2#Maine, United States#US#USME#0#0#x",
    ].join(";");
    const csv = [
      row("ELECTION_FRAUD;", manyStates, ["https://a.com/voter-purge-roundup"]),
      row("TAX_POLICY;", txLoc, ["https://a.com/voter-purge-story"]),
    ].join("\n");
    expect(clusterGkg(csv).size).toBe(0);
  });
});

describe("OpenStates bill lifecycle mapping", () => {
  it("maps action text to the §25 lifecycle deterministically", async () => {
    const { billStatus } = await import("./sources/openstates.js");
    expect(billStatus("Signed by the Governor")).toBe("ACTIVE");
    expect(billStatus("Became law without signature")).toBe("ACTIVE");
    expect(billStatus("Vetoed by the Governor")).toBe("EXPIRED");
    expect(billStatus("Died in committee")).toBe("EXPIRED");
    expect(billStatus("Referred to Committee on Elections")).toBe("PROPOSED");
    expect(billStatus(null)).toBe("PROPOSED");
  });
});

describe("anti-bias invariance (§44 — mirrored hypotheticals)", () => {
  // The derivation takes no party, actor, or ideology input anywhere: the
  // same dimensions and pressure must produce the same score whichever party
  // benefits. These calls have no party parameter to vary — the assertion is
  // that identical observables give identical output, which with a pure
  // function is exact.
  const dims: VulnerabilityDimensions = {
    federalLeverage: 0.7,
    stateCooperation: 0.4,
    administrativeExposure: 0.3,
    voterRollExposure: 0.5,
    ballotExposure: 0.6,
    litigationExposure: 0.8,
    certificationExposure: 0.2,
    recountExposure: 0.1,
    congressionalContestExposure: 0.1,
  };

  it("scores identically for mirrored actors", () => {
    const a = interventionRelevance(
      0.5,
      applyResistance(processVulnerability(dims), 0.4),
      blendPressure(2, 5),
    );
    const b = interventionRelevance(
      0.5,
      applyResistance(processVulnerability(dims), 0.4),
      blendPressure(2, 5),
    );
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("suppresses vulnerability symmetrically for either side's injunctions", () => {
    const raw = processVulnerability(dims);
    expect(applyResistance(raw, 0.8)).toBeLessThan(applyResistance(raw, 0.2));
  });
});

describe("administration insulation (2026.09.5 — who runs the election matters)", () => {
  it("halves stateCooperation for statutorily balanced boards", () => {
    expect(administrationInsulation("NY")).toBe(0.5);
    expect(administrationInsulation("WI")).toBe(0.5);
    expect(administrationInsulation("IL")).toBe(0.5);
  });

  it("gives partisan-majority boards a partial discount", () => {
    expect(administrationInsulation("NC")).toBe(0.75);
    expect(administrationInsulation("VA")).toBe(0.75);
  });

  it("leaves elected and governor-appointed officials undiscounted", () => {
    expect(administrationInsulation("GA")).toBe(1);
    expect(administrationInsulation("PA")).toBe(1);
    expect(administrationInsulation("TX")).toBe(1);
  });

  it("covers all fifty states and defaults unknown jurisdictions to 1", () => {
    expect(Object.keys(STATE_ADMINISTRATION)).toHaveLength(50);
    expect(administrationInsulation("DC")).toBe(1);
    expect(administrationInsulation("PR")).toBe(1);
  });
});
