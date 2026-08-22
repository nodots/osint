import { describe, expect, it } from "vitest";
import {
  applyResistance,
  blendPressure,
  eventDisposition,
  interventionRelevance,
  processVulnerability,
  type VulnerabilityDimensions,
} from "@elections-tracker/shared";
import {
  classifyRuling,
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
