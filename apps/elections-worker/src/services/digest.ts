import nodemailer from "nodemailer";
import { pool } from "../db.js";

// Email digest (§38: notify only when something meaningful changes). Sent
// after the daily run only when the run produced material ledger entries or
// new material federal actions/blocking rulings. Gated on SMTP_URL — unset
// means the digest is simply off, like the other optional credentials.
//
// Env: SMTP_URL (smtp[s]://user:pass@host:port), DIGEST_FROM, DIGEST_TO
// (comma-separated), DIGEST_RISK_DELTA (default 0.02).

const RISK_DELTA_THRESHOLD = Number(process.env.DIGEST_RISK_DELTA ?? 0.02);

interface ChangeRow {
  district_id: string;
  display_name: string;
  delta_risk: number;
  subversion_risk: string;
  dimension_deltas: Record<string, number> | null;
  first: boolean;
  new_event_titles: string[] | null;
}

interface EventRow {
  title: string;
  event_types: string[];
  jurisdictions: string[];
}

function pct(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}`;
}

export async function sendDigest(runStartedAt: Date): Promise<
  "sent" | "quiet" | "disabled"
> {
  const smtpUrl = process.env.SMTP_URL;
  const to = process.env.DIGEST_TO;
  if (!smtpUrl || !to) {
    console.log("digest skipped — SMTP_URL/DIGEST_TO not set");
    return "disabled";
  }

  const [changes, newEvents] = await Promise.all([
    pool.query<ChangeRow>(
      `SELECT r.district_id, d.display_name, c.delta_risk,
              a.subversion_risk, c.dimension_deltas,
              (c.previous_assessment_id IS NULL) AS first,
              (SELECT array_agg(e.title) FROM events e
                WHERE e.id = ANY(c.new_event_ids)) AS new_event_titles
         FROM assessment_changes c
         JOIN races r ON r.id = c.race_id
         JOIN districts d ON d.id = r.district_id
         JOIN race_risk_assessments a ON a.id = c.assessment_id
        WHERE c.changed_at >= $1
          AND c.previous_assessment_id IS NOT NULL
          AND abs(c.delta_risk) >= $2
        ORDER BY abs(c.delta_risk) DESC
        LIMIT 25`,
      [runStartedAt, RISK_DELTA_THRESHOLD],
    ),
    pool.query<EventRow>(
      `SELECT title, event_types, jurisdictions FROM events
        WHERE discovered_at >= $1 AND material
          AND (jurisdiction_type = 'FEDERAL' OR 'INJUNCTION' = ANY(event_types))
        ORDER BY occurred_at DESC
        LIMIT 15`,
      [runStartedAt],
    ),
  ]);

  if (changes.rows.length === 0 && newEvents.rows.length === 0) {
    console.log("digest: quiet day, nothing sent");
    return "quiet";
  }

  const lines: string[] = [];
  if (newEvents.rows.length > 0) {
    lines.push("NEW MATERIAL DEVELOPMENTS", "");
    for (const e of newEvents.rows) {
      lines.push(
        `• ${e.title}`,
        `  [${e.event_types.join(", ")}] ${e.jurisdictions.join(", ")}`,
        "",
      );
    }
  }
  if (changes.rows.length > 0) {
    lines.push("RISK CHANGES", "");
    for (const c of changes.rows) {
      const dims = Object.entries(c.dimension_deltas ?? {})
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 3)
        .map(([k, v]) => `${k} ${pct(v)}`)
        .join(", ");
      lines.push(
        `• ${c.district_id} (${c.display_name}): risk ${pct(c.delta_risk)} → ${Math.round(Number(c.subversion_risk) * 100)}`,
      );
      if (dims) lines.push(`  ${dims}`);
      for (const title of (c.new_event_titles ?? []).slice(0, 3)) {
        lines.push(`  ↳ ${title}`);
      }
      lines.push("");
    }
  }
  lines.push(
    "Scores are ordinal risk indices, not probabilities. Full ledger and evidence:",
    `${process.env.PUBLIC_ORIGIN ?? "http://localhost:6751"}/elections/changes`,
  );

  // SMTP_URL=console prints the message instead of sending — the dry-run
  // path for local verification.
  const transporter =
    smtpUrl === "console"
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport(smtpUrl);
  const info = await transporter.sendMail({
    from: process.env.DIGEST_FROM ?? "elections-monitor@localhost",
    to,
    subject: `Election Integrity Monitor — ${newEvents.rows.length} development${newEvents.rows.length === 1 ? "" : "s"}, ${changes.rows.length} risk change${changes.rows.length === 1 ? "" : "s"}`,
    text: lines.join("\n"),
  });
  if (smtpUrl === "console" && "message" in info) {
    console.log(String(info.message));
  }
  console.log(
    `digest sent: ${newEvents.rows.length} events, ${changes.rows.length} changes`,
  );
  return "sent";
}
