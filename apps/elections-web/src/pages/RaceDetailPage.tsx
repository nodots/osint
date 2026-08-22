import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  riskLevel,
  type RaceDetail,
  type RiskAssessment,
} from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { fetchRaceDetail } from "../api.js";
import { TimeSeriesChart } from "../components/TimeSeriesChart.js";
import { NO_RATING_COLOR, RATING_COLORS, ratingLabel } from "../format.js";
import { sourceLinkLabel } from "./EventsPage.js";

const UP_COLOR = "#da654c";
const DOWN_COLOR = "#5590d2";

// Ordinal level colors: alarm tones only where the index earns them.
const LEVEL_COLORS: Record<string, string> = {
  MINIMAL: "rgba(255,255,255,0.7)",
  LOW: "rgba(255,255,255,0.7)",
  MODERATE: "#ec9d86",
  HIGH: "#da654c",
  VERY_HIGH: "#da654c",
};

function marginLabel(margin: number | null): string {
  if (margin == null) return "—";
  if (margin === 0) return "Even";
  return `${margin > 0 ? "D" : "R"}+${Math.abs(margin).toFixed(1)}`;
}

const DRIVER_LABELS: [keyof RiskAssessment, string][] = [
  ["federalLeverage", "Federal leverage"],
  ["stateCooperation", "State cooperation"],
  ["administrativeExposure", "Administrative exposure"],
  ["voterRollExposure", "Voter-roll exposure"],
  ["ballotExposure", "Ballot exposure"],
  ["litigationExposure", "Litigation exposure"],
  ["certificationExposure", "Certification exposure"],
  ["recountExposure", "Recount exposure"],
  ["congressionalContestExposure", "Congressional contest"],
];

interface ExplanationEntry {
  dimension: string;
  value: number;
  evidence: number[];
}

// Shape written by the worker's assessment pass.
interface Explanations {
  drivers?: ExplanationEntry[];
  mitigations?: ExplanationEntry[];
}

// Dimension bar: label, track, value — magnitude readable at a glance,
// evidence count when the assessment carries it.
function DriverBar({
  label,
  value,
  color,
  evidenceCount,
}: {
  label: string;
  value: number;
  color: string;
  evidenceCount?: number;
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ width: 190, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 8, borderRadius: 1, bgcolor: "rgba(255,255,255,0.08)" }}>
        <Box
          sx={{
            width: `${Math.round(value * 100)}%`,
            height: "100%",
            borderRadius: 1,
            bgcolor: color,
            opacity: 0.85,
          }}
        />
      </Box>
      <Typography variant="body2" sx={{ width: 30, textAlign: "right" }}>
        {Math.round(value * 100)}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ width: 64, flexShrink: 0 }}
      >
        {evidenceCount ? `${evidenceCount} events` : ""}
      </Typography>
    </Stack>
  );
}

function HeroStat({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 300, color: color ?? "text.primary" }}>
        {value}
      </Typography>
      {sublabel && (
        <Typography variant="caption" color="text.secondary">
          {sublabel}
        </Typography>
      )}
    </Stack>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right", ml: 2 }}>
        {value}
      </Typography>
    </Stack>
  );
}

export function RaceDetailPage() {
  const { districtId = "" } = useParams();
  const [detail, setDetail] = useState<RaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    fetchRaceDetail(districtId, controller.signal)
      .then(setDetail)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, [districtId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!detail) return <CircularProgress />;

  const { race } = detail;
  const latest = detail.assessments[0] ?? null;
  const explanations = (latest?.explanations ?? null) as Explanations | null; // worker-written JSON; rendered defensively
  const evidenceByDimension = new Map(
    (explanations?.drivers ?? []).map((d) => [d.dimension, d.evidence.length]),
  );
  const riskIndex = latest ? Math.round(latest.subversionRisk * 100) : null;
  const level = riskIndex != null ? riskLevel(riskIndex) : null;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <Link component={RouterLink} to="/races" variant="body2">
        ← All races
      </Link>
      <Stack
        direction="row"
        alignItems="baseline"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        spacing={1}
        sx={{ mt: 1, mb: 2.5 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={2}>
          <Typography variant="h4" sx={{ fontWeight: 300 }}>
            {race.districtId}
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 300 }}>
            {race.displayName}
          </Typography>
          <Chip
            size="small"
            label={ratingLabel(race.rating)}
            sx={{
              bgcolor: race.rating ? RATING_COLORS[race.rating] : NO_RATING_COLOR,
              color: "#0a0a0a",
              fontWeight: 600,
            }}
          />
        </Stack>
        {latest && (
          <Typography variant="caption" color="text.secondary">
            Assessed {latest.assessedAt.slice(0, 10)} · methodology{" "}
            {latest.methodologyVersion} · indices are ordinal, not probabilities
          </Typography>
        )}
      </Stack>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2.5}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">
                Election
              </Typography>
              <Row label="Member" value={detail.currentMember ?? "Vacant"} />
              <Row label="Incumbent party" value={race.incumbentParty ?? "—"} />
              <Row
                label="Democratic candidate"
                value={detail.democraticCandidate ?? "—"}
              />
              <Row
                label="Republican candidate"
                value={detail.republicanCandidate ?? "—"}
              />
              <Row
                label="Projected margin"
                value={marginLabel(detail.projectedMargin)}
              />
              <Row
                label="Rating source"
                value={
                  race.ratingSource
                    ? `${race.ratingSource}${
                        detail.ratingUpdatedAt
                          ? ` (${detail.ratingUpdatedAt.slice(0, 10)})`
                          : ""
                      }`
                    : "—"
                }
              />
              {detail.cookPvi && <Row label="PVI" value={detail.cookPvi} />}
              {detail.forecasts.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="overline" color="text.secondary">
                    Forecast snapshots
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Source</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Rating</TableCell>
                        <TableCell align="right">Margin</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.forecasts.map((f) => (
                        <TableRow key={`${f.source}-${f.snapshotDate}`}>
                          <TableCell>{f.source}</TableCell>
                          <TableCell>{f.snapshotDate}</TableCell>
                          <TableCell>{ratingLabel(f.rating)}</TableCell>
                          <TableCell align="right">{marginLabel(f.margin)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">
                Active cases
              </Typography>
              {detail.cases.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                  No litigation linked to this race.
                </Typography>
              ) : (
                detail.cases.map((c) => (
                  <Box key={c.id} sx={{ py: 1 }}>
                    <Typography variant="subtitle2">{c.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[c.court, c.docketNumber, c.status].filter(Boolean).join(" · ")}
                    </Typography>
                    {c.affectedMechanisms.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Mechanisms: {c.affectedMechanisms.join(", ")}
                      </Typography>
                    )}
                  </Box>
                ))
              )}
            </Paper>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              Threat assessment
            </Typography>
            {latest && riskIndex != null && level ? (
              <Stack spacing={2.5} sx={{ mt: 1 }}>
                <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                  <HeroStat
                    label="Intervention relevance"
                    value={`${riskIndex}`}
                    sublabel={level.replace("_", " ")}
                    color={LEVEL_COLORS[level]}
                  />
                  <HeroStat
                    label="Vulnerability"
                    value={`${Math.round(latest.processVulnerability * 100)}`}
                  />
                  {latest.institutionalResistance != null && (
                    <HeroStat
                      label="Resistance"
                      value={`${Math.round(latest.institutionalResistance * 100)}`}
                      sublabel="suppresses vulnerability"
                      color={DOWN_COLOR}
                    />
                  )}
                  {latest.activePressure != null && (
                    <HeroStat
                      label="Active pressure"
                      value={`${Math.round(latest.activePressure * 100)}`}
                    />
                  )}
                  <HeroStat
                    label="Pivotality"
                    value={`${Math.round(latest.pivotality * 100)}%`}
                    sublabel="chance-weighted control stake"
                  />
                </Stack>

                <Divider />

                <Stack spacing={1}>
                  <Typography variant="overline" color="text.secondary">
                    Vulnerability drivers
                  </Typography>
                  {DRIVER_LABELS.map(([key, label]) => (
                    <DriverBar
                      key={key}
                      label={label}
                      value={latest[key] as number} // DRIVER_LABELS only lists numeric dimension keys
                      color={UP_COLOR}
                      evidenceCount={evidenceByDimension.get(key)}
                    />
                  ))}
                  {latest.institutionalResistance != null && (
                    <>
                      <Divider sx={{ my: 0.5 }} />
                      <DriverBar
                        label="Institutional resistance"
                        value={latest.institutionalResistance}
                        color={DOWN_COLOR}
                        evidenceCount={
                          (explanations?.mitigations ?? []).find(
                            (m) => m.dimension === "institutionalResistance",
                          )?.evidence.length
                        }
                      />
                    </>
                  )}
                </Stack>
              </Stack>
            ) : (
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                Not yet assessed — the daily ingestion pass computes assessments
                from public-source events.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={12}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="overline" color="text.secondary">
                Risk history
              </Typography>
              {detail.assessments.length > 1 && (
                <Typography variant="caption" color="text.secondary">
                  intervention relevance index · {detail.assessments.length} assessments
                </Typography>
              )}
            </Stack>
            {detail.assessments.length >= 2 ? (
              <RiskHistoryChart assessments={detail.assessments} />
            ) : (
              <Typography color="text.secondary" variant="body2">
                {detail.assessments.length === 1
                  ? "One assessment on record — history appears after the next one."
                  : "No assessments yet."}
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={12}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="overline" color="text.secondary">
              Relevant events
            </Typography>
            {detail.events.length === 0 ? (
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                No events linked directly to this race. Statewide and national
                events drive the assessment through the state signals above.
              </Typography>
            ) : (
              detail.events.map((event) => (
                <Box key={event.id} sx={{ py: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {event.occurredAt.slice(0, 10)} ·{" "}
                    {event.eventTypes.join(", ")} · {event.factualStatus}
                  </Typography>
                  <Typography variant="subtitle2">{event.title}</Typography>
                  <Typography variant="body2">{event.summary}</Typography>
                  {event.sourceUrl && (
                    <Link
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noopener"
                      variant="body2"
                    >
                      {sourceLinkLabel(event.sourceName, event.sourceUrl)} ↗
                    </Link>
                  )}
                </Box>
              ))
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// Risk history via the shared chart: one point per assessment day (newest
// assessment of the day wins), risk on the 0–100 index scale.
function RiskHistoryChart({ assessments }: { assessments: RiskAssessment[] }) {
  const byDay = new Map<string, number>();
  for (const a of [...assessments].reverse()) {
    byDay.set(a.assessedAt.slice(0, 10), Math.round(a.subversionRisk * 100));
  }
  const points = [...byDay.entries()].map(([date, value]) => ({ date, value }));
  return <TimeSeriesChart points={points} width={1100} height={200} />;
}
