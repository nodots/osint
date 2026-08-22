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

function marginLabel(margin: number | null): string {
  if (margin == null) return "—";
  if (margin === 0) return "Even";
  return `${margin > 0 ? "D" : "R"}+${Math.abs(margin).toFixed(1)}`;
}

// Verbal level for a [0,1] dimension — the drivers grid reads levels, the
// numbers stay available in the assessment history.
function level(value: number): string {
  if (value < 0.25) return "LOW";
  if (value < 0.5) return "MEDIUM";
  if (value < 0.75) return "HIGH";
  return "VERY HIGH";
}

interface ExplanationEntry {
  dimension: string;
  value: number;
  evidence: number[];
}

// Shape written by the worker's assessment pass (methodology 2026.09.1).
interface Explanations {
  drivers?: ExplanationEntry[];
  mitigations?: ExplanationEntry[];
}

const DIMENSION_NAMES: Record<string, string> = {
  federalLeverage: "Federal leverage",
  stateCooperation: "State cooperation",
  administrativeExposure: "Administrative exposure",
  voterRollExposure: "Voter-roll exposure",
  ballotExposure: "Ballot exposure",
  litigationExposure: "Litigation exposure",
  certificationExposure: "Certification exposure",
  recountExposure: "Recount exposure",
  congressionalContestExposure: "Congressional contest exposure",
  institutionalResistance: "Institutional resistance",
};

const DRIVER_LABELS: [keyof RiskAssessment, string][] = [
  ["federalLeverage", "Federal leverage"],
  ["stateCooperation", "State cooperation"],
  ["administrativeExposure", "Administrative exposure"],
  ["voterRollExposure", "Voter-roll exposure"],
  ["ballotExposure", "Ballot exposure"],
  ["litigationExposure", "Litigation exposure"],
  ["certificationExposure", "Certification exposure"],
  ["recountExposure", "Recount exposure"],
  ["congressionalContestExposure", "Congressional contest exposure"],
];

// Risk history via the shared chart: one point per assessment day (newest
// assessment of the day wins), risk on the 0–100 index scale.
function RiskHistoryChart({ assessments }: { assessments: RiskAssessment[] }) {
  const byDay = new Map<string, number>();
  for (const a of [...assessments].reverse()) {
    byDay.set(a.assessedAt.slice(0, 10), Math.round(a.subversionRisk * 100));
  }
  const points = [...byDay.entries()].map(([date, value]) => ({ date, value }));
  return <TimeSeriesChart points={points} width={820} height={200} />;
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

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Link component={RouterLink} to="/races" variant="body2">
        ← All races
      </Link>
      <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mt: 1 }}>
        <Typography variant="h4">{race.districtId}</Typography>
        <Typography variant="h6" color="text.secondary">
          {race.displayName}
        </Typography>
        <Chip
          size="small"
          label={ratingLabel(race.rating)}
          sx={{
            bgcolor: race.rating
              ? RATING_COLORS[race.rating]
              : NO_RATING_COLOR,
            color: "#0a0a0a",
            fontWeight: 600,
          }}
        />
      </Stack>

      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
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
                        <TableCell align="right">
                          {marginLabel(f.margin)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Threat
            </Typography>
            {latest ? (
              <>
                <Row
                  label="Intervention relevance"
                  value={`${Math.round(latest.subversionRisk * 100)} ${riskLevel(latest.subversionRisk * 100).replace("_", " ")}`}
                />
                <Row
                  label="Process vulnerability"
                  value={`${Math.round(latest.processVulnerability * 100)} ${level(latest.processVulnerability)}`}
                />
                {latest.institutionalResistance != null && (
                  <Row
                    label="Institutional resistance"
                    value={`${Math.round(latest.institutionalResistance * 100)} ${level(latest.institutionalResistance)}`}
                  />
                )}
                {latest.activePressure != null && (
                  <Row
                    label="Active intervention pressure"
                    value={`${Math.round(latest.activePressure * 100)} ${level(latest.activePressure)}`}
                  />
                )}
                <Row
                  label="Pivotality"
                  value={`${Math.round(latest.pivotality * 100)}%`}
                />
                <Row
                  label="Assessed"
                  value={`${latest.assessedAt.slice(0, 10)} (methodology ${latest.methodologyVersion})`}
                />
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="overline" color="text.secondary">
                  Drivers
                </Typography>
                {DRIVER_LABELS.map(([key, label]) => (
                  <Row
                    key={key}
                    label={label}
                    value={level(latest[key] as number)} // DRIVER_LABELS only lists numeric dimension keys
                  />
                ))}
                <WhyBlock
                  explanations={latest.explanations as Explanations | null} // worker-written JSON; rendered defensively
                />
              </>
            ) : (
              <Typography color="text.secondary" variant="body2">
                Not yet assessed. Risk assessments require analyst-entered
                state vulnerability inputs.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={12}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Risk history
            </Typography>
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

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Relevant events
            </Typography>
            {detail.events.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                No events linked to this race.
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
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Active cases
            </Typography>
            {detail.cases.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                No litigation linked to this race.
              </Typography>
            ) : (
              detail.cases.map((c) => (
                <Box key={c.id} sx={{ py: 1 }}>
                  <Typography variant="subtitle2">{c.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[c.court, c.docketNumber, c.status]
                      .filter(Boolean)
                      .join(" · ")}
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
        </Grid>
      </Grid>
    </Box>
  );
}

// §48 "WHY?" block: what pushes risk up, what holds it down, with evidence
// counts. Values come straight from the assessment's explanation payload.
function WhyBlock({ explanations }: { explanations: Explanations | null }) {
  const drivers = (explanations?.drivers ?? []).slice(0, 3);
  const mitigations = (explanations?.mitigations ?? []).filter(
    (m) => m.value > 0,
  );
  if (drivers.length === 0 && mitigations.length === 0) return null;
  return (
    <>
      <Divider sx={{ my: 1.5 }} />
      <Typography variant="overline" color="text.secondary">
        Why
      </Typography>
      {drivers.map((d) => (
        <Typography key={d.dimension} variant="body2" sx={{ py: 0.25 }}>
          ↑ {DIMENSION_NAMES[d.dimension] ?? d.dimension} (
          {Math.round(d.value * 100)}
          {d.evidence.length > 0 &&
            `, ${d.evidence.length} evidence event${d.evidence.length === 1 ? "" : "s"}`}
          )
        </Typography>
      ))}
      {mitigations.map((m) => (
        <Typography
          key={m.dimension}
          variant="body2"
          color="text.secondary"
          sx={{ py: 0.25 }}
        >
          ↓ {DIMENSION_NAMES[m.dimension] ?? m.dimension} (
          {Math.round(m.value * 100)}
          {m.evidence.length > 0 &&
            `, ${m.evidence.length} evidence event${m.evidence.length === 1 ? "" : "s"}`}
          )
        </Typography>
      ))}
    </>
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
