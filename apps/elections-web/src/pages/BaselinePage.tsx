import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { RaceSummary, ThreatHistoryPoint } from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchRaces, fetchThreatHistory } from "../api.js";
import { PageHeader } from "../components/PageHeader.js";
import baselines from "../data/baselines.json";

// The §43 backtest page: is 2026 normal? Baselines are immutable
// retrodictions shipped as a generated snapshot (see baseline-export in the
// worker); the 2026 series is live.

const ELECTION_DAY_2026 = new Date("2026-11-03T00:00:00Z").getTime();
const C_EARLY = "rgba(255,255,255,0.35)"; // 2016/2018: flat zero lines
// Series hues validated for colorblind separation on the dark surface (the
// previous 2022 purple / 2024 blue pair was ΔE 1.5 under deuteranopia).
const C2020 = "#2f9e7c";
const C2022 = "#9d82d9";
const C2024 = "#33639e";
const C2026 = "#da654c";
const CYCLE_COLORS: Record<string, string> = {
  "2016": C_EARLY,
  "2018": C_EARLY,
  "2020": C2020,
  "2022": C2022,
  "2024": C2024,
};

interface Pt {
  dte: number;
  hrp: number;
}

// Chart geometry (SVG px). The y-scale focuses on the band the non-zero
// series occupy; all-zero cycles render on a separate zero band below a
// broken axis so they stop flattening the plot.
const CH_W = 880;
const CH_H = 368;
const CH_PAD_L = 46;
const CH_PLOT_R = 764; // right margin holds the direct end labels
const CH_PLOT_TOP = 14;
const CH_PLOT_BOTTOM = 298;
const CH_ZERO_Y = 332;
const CH_MAX_DTE = 105;
const TIP_W = 190;

function BaselineChart({
  live,
  matched,
}: {
  live: Pt[];
  matched: number | null;
}) {
  const [hover, setHover] = useState<{ dte: number; py: number } | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  // JSON import gives per-cycle literal types; the export guarantees this shape.
  const historical = Object.entries(baselines.cycles) as [string, { series: Pt[] }][];
  const zeroCycles = historical.filter(([, c]) => c.series.every((p) => p.hrp === 0));
  const lineCycles = historical.filter(([, c]) => c.series.some((p) => p.hrp !== 0));

  const plotted = [
    ...live.map((p) => p.hrp),
    ...lineCycles.flatMap(([, c]) => c.series.map((p) => p.hrp)),
    ...(matched != null ? [matched] : []),
  ];
  const lo = (plotted.length ? Math.min(...plotted) : 0) - 5;
  const hi = (plotted.length ? Math.max(...plotted) : 10) + 4;

  const plotW = CH_PLOT_R - CH_PAD_L;
  const x = (dte: number) => CH_PAD_L + ((CH_MAX_DTE - dte) / CH_MAX_DTE) * plotW;
  const y = (v: number) =>
    CH_PLOT_TOP + ((hi - v) / (hi - lo)) * (CH_PLOT_BOTTOM - CH_PLOT_TOP);
  const path = (pts: Pt[]) =>
    pts
      .filter((p) => p.dte <= CH_MAX_DTE)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dte).toFixed(1)},${y(p.hrp).toFixed(1)}`)
      .join(" ");

  const gridValues: number[] = [];
  for (let v = Math.ceil(lo / 20) * 20; v <= hi; v += 20) gridValues.push(v);

  const last = live[live.length - 1];
  const todayDte = last?.dte ?? null;
  const hoverDte = hover?.dte ?? todayDte;
  const pinned = hover == null;

  const visibleLines = lineCycles.filter(([cycle]) => !hidden[cycle]);
  const liveVisible = !hidden["2026"];
  const liveByDte = new Map(live.map((p) => [p.dte, p.hrp]));

  const rows: { id: string; label: string; value: number; color: string; live?: boolean }[] = [];
  if (hoverDte != null) {
    for (const [cycle, c] of visibleLines) {
      const pt = c.series.find((p) => p.dte === hoverDte);
      if (pt) rows.push({ id: cycle, label: cycle, value: pt.hrp, color: CYCLE_COLORS[cycle] ?? C_EARLY });
    }
    const lv = liveVisible ? liveByDte.get(hoverDte) : undefined;
    if (lv != null) {
      rows.push({
        id: "2026",
        label: hoverDte === todayDte ? "2026 · today" : "2026",
        value: lv,
        color: C2026,
        live: true,
      });
    }
    rows.sort((a, b) => b.value - a.value);
  }

  // Direct end labels, nudged apart when two series end near the same count.
  const endLabels = visibleLines
    .map(([cycle, c]) => {
      const end = c.series.find((p) => p.dte === 0) ?? c.series[c.series.length - 1];
      return { cycle, value: end?.hrp ?? 0, color: CYCLE_COLORS[cycle] ?? C_EARLY, ty: y(end?.hrp ?? 0) + 4 };
    })
    .sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < endLabels.length; i++) {
    const prev = endLabels[i - 1]!;
    const cur = endLabels[i]!;
    if (cur.ty - prev.ty < 14) cur.ty = prev.ty + 14;
  }

  const cursorX = hoverDte != null ? x(hoverDte) : null;
  // Flip before the tooltip reaches the end-label gutter, not the SVG edge.
  // Pinned (unhovered) it sits left of the today line, in the emptier region
  // below the early stretch of the lines.
  const tipLeft =
    cursorX == null
      ? 0
      : pinned
        ? Math.max(0, cursorX - TIP_W - 16)
        : cursorX + 16 + TIP_W > CH_PLOT_R + 4
          ? cursorX - TIP_W - 16
          : cursorX + 16;
  const tipTop = pinned || hover == null ? 118 : Math.max(16, Math.min(190, hover.py - 24));
  const zeroLabel = zeroCycles.map(([cycle]) => cycle).join(" & ");
  const chips = [
    ...lineCycles.map(([cycle]) => ({ id: cycle, color: CYCLE_COLORS[cycle] ?? C_EARLY })),
    { id: "2026", color: C2026 },
  ];
  const matchedFlip = last != null && x(last.dte) > 480;

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center" sx={{ width: CH_W }}>
        {chips.map((c) => (
          <Box
            key={c.id}
            component="button"
            onClick={() => setHidden((h) => ({ ...h, [c.id]: !h[c.id] }))}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              background: "transparent",
              border: "none",
              borderRadius: 0.5,
              px: 1,
              py: 0.5,
              cursor: "pointer",
              opacity: hidden[c.id] ? 0.45 : 1,
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
            }}
          >
            <Box sx={{ width: 16, borderTop: `2.5px solid ${hidden[c.id] ? "rgba(255,255,255,0.25)" : c.color}` }} />
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.75)" }}>{c.id}</Typography>
          </Box>
        ))}
        {zeroCycles.length > 0 && (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1, py: 0.5 }}>
            <Box sx={{ width: 16, borderTop: `2px solid ${C_EARLY}` }} />
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)" }}>
              {zeroCycles.length > 1
                ? `${zeroCycles[0]![0]}–${zeroCycles[zeroCycles.length - 1]![0].slice(2)}`
                : zeroCycles[0]![0]}
            </Typography>
          </Stack>
        )}
      </Stack>
      <Box sx={{ position: "relative", width: CH_W }}>
        <svg
          width={CH_W}
          height={CH_H}
          role="img"
          aria-label="High-risk pivotal races by days until election day, six cycles compared"
        >
          {gridValues.map((v) => (
            <g key={v}>
              <line x1={CH_PAD_L} y1={y(v)} x2={CH_PLOT_R} y2={y(v)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              <text x={CH_PAD_L - 8} y={y(v) + 4} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="end">{v}</text>
            </g>
          ))}
          {last && (
            <line
              x1={x(last.dte)} y1={CH_PLOT_TOP} x2={x(last.dte)} y2={CH_PLOT_BOTTOM}
              stroke="rgba(218,101,76,0.30)" strokeWidth={1} strokeDasharray="2 4"
            />
          )}
          {visibleLines.map(([cycle, c]) => (
            <path key={cycle} d={path(c.series)} fill="none" stroke={CYCLE_COLORS[cycle] ?? C_EARLY} strokeWidth={2} strokeLinejoin="round" />
          ))}
          {liveVisible && <path d={path(live)} fill="none" stroke={C2026} strokeWidth={2.5} strokeLinejoin="round" />}
          {endLabels.map((el) => (
            <g key={el.cycle}>
              <line x1={CH_PLOT_R + 4} y1={el.ty - 4} x2={CH_PLOT_R + 14} y2={el.ty - 4} stroke={el.color} strokeWidth={2.5} />
              <text x={CH_PLOT_R + 19} y={el.ty} fill="rgba(255,255,255,0.55)" fontSize={12}>{el.cycle}</text>
              <text x={CH_PLOT_R + 84} y={el.ty} fill="rgba(255,255,255,0.92)" fontSize={12} fontWeight={500} textAnchor="end">{el.value}</text>
            </g>
          ))}
          {liveVisible && last && (
            <g>
              <circle cx={x(last.dte)} cy={y(last.hrp)} r={8} fill="none" stroke="rgba(218,101,76,0.35)" strokeWidth={1.5} />
              <circle cx={x(last.dte)} cy={y(last.hrp)} r={4} fill="#121212" stroke={C2026} strokeWidth={2} />
              {matched != null && (
                <g>
                  <line
                    x1={x(last.dte)} y1={y(last.hrp) + 10} x2={x(last.dte)} y2={y(matched) - 6}
                    stroke="rgba(218,101,76,0.3)" strokeWidth={1} strokeDasharray="3 3"
                  />
                  <circle cx={x(last.dte)} cy={y(matched)} r={4} fill="#121212" stroke={C2026} strokeWidth={1.5} strokeDasharray="2 2" />
                  <text
                    x={x(last.dte) + (matchedFlip ? -11 : 11)}
                    y={y(matched) - 7}
                    fill="rgba(255,255,255,0.55)"
                    fontSize={11}
                    textAnchor={matchedFlip ? "end" : "start"}
                  >
                    {matched} · today without the state-legislation layer
                  </text>
                </g>
              )}
            </g>
          )}
          {zeroCycles.length > 0 && (
            <g>
              <path d="M40 312 L52 305" stroke="rgba(255,255,255,0.30)" strokeWidth={1.5} />
              <path d="M40 317 L52 310" stroke="rgba(255,255,255,0.30)" strokeWidth={1.5} />
              <text x={(CH_PAD_L + CH_PLOT_R) / 2} y={324} fill="rgba(255,255,255,0.50)" fontSize={11} textAnchor="middle">
                {zeroLabel} · zero throughout — blowout-projected majorities zero the pivotality term
              </text>
              <line x1={CH_PAD_L} y1={CH_ZERO_Y} x2={CH_PLOT_R} y2={CH_ZERO_Y} stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
              <text x={CH_PAD_L - 8} y={CH_ZERO_Y + 4} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="end">0</text>
            </g>
          )}
          <text x={CH_PAD_L} y={CH_H - 10} fill="rgba(255,255,255,0.45)" fontSize={11}>105 days out</text>
          <text x={x(50)} y={CH_H - 10} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="middle">50 days out</text>
          <text x={CH_PLOT_R} y={CH_H - 10} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="end">election day</text>
          {!pinned && cursorX != null && rows.length > 0 && (
            <g>
              <line x1={cursorX} y1={CH_PLOT_TOP} x2={cursorX} y2={CH_PLOT_BOTTOM} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
              {rows.map((r) => (
                <circle key={r.id} cx={cursorX} cy={y(r.value)} r={3.5} fill="#121212" stroke={r.color} strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={CH_PAD_L}
            y={8}
            width={plotW}
            height={CH_PLOT_BOTTOM - 2}
            fill="transparent"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const rel = (e.clientX - rect.left) / rect.width;
              const dte = Math.max(0, Math.min(CH_MAX_DTE, Math.round(CH_MAX_DTE - rel * CH_MAX_DTE)));
              // +8: the hit rect starts at SVG y=8, the tooltip positions from y=0.
              setHover({ dte, py: e.clientY - rect.top + 8 });
            }}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        {hoverDte != null && rows.length > 0 && (
          <Box
            sx={{
              position: "absolute",
              left: `${tipLeft}px`,
              top: `${tipTop}px`,
              pointerEvents: "none",
              bgcolor: "#1d1d1d",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 1,
              px: 1.25,
              py: 1,
              minWidth: 158,
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", display: "block", mb: 0.5 }}>
              {hoverDte === 0 ? "election day" : `${hoverDte} days out`}
              {pinned ? " · today" : ""}
            </Typography>
            {rows.map((r) => (
              <Stack key={r.id} direction="row" spacing={0.875} alignItems="center" sx={{ py: "1.5px" }}>
                <Box sx={{ width: 12, borderTop: `2.5px solid ${r.color}` }} />
                <Typography variant="caption" sx={{ fontWeight: 500, color: r.live ? "#e0836e" : "rgba(255,255,255,0.92)", minWidth: 26 }}>
                  {r.value}
                </Typography>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>{r.label}</Typography>
              </Stack>
            ))}
            {zeroCycles.length > 0 && hoverDte <= 100 && (
              <Stack direction="row" spacing={0.875} alignItems="center" sx={{ py: "1.5px" }}>
                <Box sx={{ width: 12, borderTop: `2.5px solid rgba(255,255,255,0.35)` }} />
                <Typography variant="caption" sx={{ fontWeight: 500, color: "rgba(255,255,255,0.5)", minWidth: 26 }}>0</Typography>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>{zeroLabel}</Typography>
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function CompositionRow({
  label,
  values,
}: {
  label: string;
  values: [number, number, number];
}) {
  const colors = [C2022, C2024, C2026];
  return (
    <Stack direction="row" spacing={1.75} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ width: 180, flexShrink: 0 }}>
        {label}
      </Typography>
      <Stack spacing="3px" sx={{ flex: 1 }}>
        {values.map((v, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="center">
            <Box sx={{ height: 8, borderRadius: 1, bgcolor: colors[i], width: `${v}%` }} />
            <Typography variant="caption" color={i === 2 ? "text.primary" : "text.secondary"}>
              {v}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

export function BaselinePage() {
  const [history, setHistory] = useState<ThreatHistoryPoint[] | null>(null);
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchThreatHistory(controller.signal), fetchRaces(controller.signal)])
      .then(([h, r]) => {
        setHistory(h);
        setRaces(r);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!history) return <CircularProgress />;

  const live: Pt[] = history.map((p) => ({
    dte: Math.round((ELECTION_DAY_2026 - new Date(`${p.date}T00:00:00Z`).getTime()) / 86400000),
    hrp: p.highRiskPivotalRaces,
  }));
  const last = live[live.length - 1];
  const matched = baselines.matchedSources2026;
  // Each baseline's count at the same distance from election day as the
  // live series' latest point — the only honest cross-cycle comparison.
  const atSameDte = (cycle: keyof typeof baselines.cycles): number | null => {
    if (!last) return null;
    const series = baselines.cycles[cycle].series as Pt[];
    const pt = series.reduce<Pt | null>(
      (best, p) =>
        best == null || Math.abs(p.dte - last.dte) < Math.abs(best.dte - last.dte)
          ? p
          : best,
      null,
    );
    return pt?.hrp ?? null;
  };

  const mean = (pick: (r: RaceSummary) => number | null) => {
    const vals = races.map(pick).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : 0;
  };
  const comp = (cycle: "2022" | "2024", key: string) =>
    (baselines.cycles[cycle].composition as Record<string, number>)[key] ?? 0;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        title="Is 2026 normal? The backtest"
        meta={`identical pipeline replayed against every cycle 2016–2024 · baselines generated ${baselines.generatedAt} · methodology ${baselines.methodologyVersion} · indices are ordinal, not probabilities`}
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              High-risk pivotal races by days until election day
            </Typography>
            <BaselineChart live={live} matched={matched} />
            <Typography variant="caption" color="text.secondary">
              the count the threat level is defined on (intervention relevance ≥ 12 and
              pivotality ≥ 10; the level is the live count&apos;s percentile in this
              chart&apos;s pooled history) · 2016–2024 are 100-day replays ending on
              their election days; 2026 is the live series so far
            </Typography>
            <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "rgba(255,255,255,0.38)" }}>
              y-scale focused on the band where the data lives; zero cycles sit on the
              band below · hover for exact counts at any distance from election day ·
              click a legend entry to hide a cycle
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2.5} sx={{ height: "100%" }}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Stack spacing={1.25}>
                <Typography variant="overline" color="text.secondary">
                  The finding · {last?.dte ?? "—"} days out
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.55 }}>
                  On identical sources — every cycle now carries its own
                  era&apos;s state legislation alongside its litigation — 2026
                  sits at the top of the recent-cycle range at the same
                  distance from election day: level with 2024, above 2020 and
                  2022, not outside the range. Recent litigious cycles read
                  high here; that is the model registering live election
                  activity, not a verdict of subversion.
                </Typography>
                <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
                  {(["2016", "2018", "2020", "2022"] as const).map((c) => (
                    <Stack key={c}>
                      <Typography variant="h4" sx={{ fontWeight: 300, color: CYCLE_COLORS[c] }}>
                        {atSameDte(c) ?? "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{c}</Typography>
                    </Stack>
                  ))}
                  <Stack>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: C2024 }}>
                      {atSameDte("2024") ?? "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">2024</Typography>
                  </Stack>
                  <Stack>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: C2026 }}>
                      {last?.hrp ?? "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">2026 · live</Typography>
                  </Stack>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  Sensitivity: with the state-legislation layer removed, 2026
                  reads {matched ?? "—"}. The ordering against the other cycles
                  does not change.
                </Typography>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">
                What changed in this backtest
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>
                An earlier run of this backtest read every prior cycle at zero.
                That was look-ahead bias: replays judged each case by its
                current status, so litigation that later ended was invisible on
                the historical days it was live. With status resolved as of
                each replay day (methodology 2026.09.4), litigious cycles read
                as litigious — 2020 had{" "}
                {baselines.cycles["2020"].volumes.dockets} dockets and{" "}
                {baselines.cycles["2020"].volumes.blockingInjunctions} blocking
                injunctions and now shows it. The correction replaced the
                earlier &quot;no prior cycle comes close&quot; finding with the
                comparison shown here.
              </Typography>
            </Paper>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              What is different — mean signal, end of each series
            </Typography>
            <Stack spacing={1.75} sx={{ mt: 1.5 }}>
              <CompositionRow
                label="Litigation exposure"
                values={[comp("2022", "litigationExposure"), comp("2024", "litigationExposure"), mean((r) => r.litigationExposure)]}
              />
              <CompositionRow
                label="Active pressure"
                values={[comp("2022", "activePressure"), comp("2024", "activePressure"), mean((r) => r.activePressure)]}
              />
              <CompositionRow
                label="Institutional resistance"
                values={[comp("2022", "institutionalResistance"), comp("2024", "institutionalResistance"), mean((r) => r.institutionalResistance)]}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
              2026 carries more litigation exposure and more active exercise of
              mechanisms, with less judicial-resistance headroom, than either baseline
              reached by its election day. Rows: 2022 (purple), 2024 (blue), 2026
              (warm, live).
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              Read this honestly
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              Baselines are retrodictions: history recomputed under today&apos;s
              methodology from event occurrence dates, with status resolved as
              of each replay day from recorded transition dates (a small
              residual — under 3% of cases — has no recorded date and keeps its
              current status). State legislation is replayed from the
              OpenStates bulk archive, but its record thins sharply before
              2017, so 2016&apos;s legislative layer is undercounted.
              State-court and county incidents are
              under-covered in every cycle, RECAP&apos;s coverage thins before
              ~2018 and grows since, the high-risk cutoff is a fixed constant
              many races sit near, and the injunction-as-resistance reading is
              direction-blind — in 2020 courts blocked both restrictions and
              expansions, and the model counts both as resistance.
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
              <Link component={RouterLink} to="/methodology" variant="body2">
                Methodology and backtest summary →
              </Link>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
