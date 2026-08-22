import Box from "@mui/material/Box";

// Single-series time chart used by the overview threat card and race risk
// history: data-range y-scale (a 0-anchored axis flattens the movement that
// is the whole point), recessive gridlines, area fill, sparse date ticks,
// direct end-value label, and optional event annotations.

export interface SeriesPoint {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface SeriesAnnotation {
  date: string;
  label: string;
  color: string;
  // Place the label under the point instead of above (avoids collisions).
  below?: boolean;
}

const LINE_COLOR = "#da654c";
const GRID_COLOR = "rgba(255,255,255,0.08)";
const TICK_COLOR = "rgba(255,255,255,0.45)";
const LABEL_COLOR = "rgba(255,255,255,0.65)";

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function TimeSeriesChart({
  points,
  annotations = [],
  width = 852,
  height = 240,
}: {
  points: SeriesPoint[];
  annotations?: SeriesAnnotation[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) return null;
  const padLeft = 44;
  const padRight = 36;
  const padTop = 28;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 0.4) {
    // Keep a readable band even when the series barely moves.
    const mid = (max + min) / 2;
    min = mid - 0.2;
    max = mid + 0.2;
  }
  const range = max - min;
  min -= range * 0.15;
  max += range * 0.15;

  const x = (i: number) =>
    points.length === 1
      ? padLeft + plotW / 2
      : padLeft + (i / (points.length - 1)) * plotW;
  const y = (v: number) => padTop + ((max - v) / (max - min)) * plotH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${(padLeft + plotW).toFixed(1)},${padTop + plotH} L${padLeft},${padTop + plotH} Z`;

  // ~4 horizontal gridlines at tidy values.
  const step = Number(((max - min) / 4).toPrecision(1));
  const gridValues: number[] = [];
  for (let v = Math.ceil(min / step) * step; v < max; v += step) {
    gridValues.push(Number(v.toFixed(4)));
  }
  const tickIndexes =
    points.length <= 4
      ? points.map((_, i) => i)
      : [0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1];

  const byDate = new Map(points.map((p, i) => [p.date, i]));
  const last = points[points.length - 1]!;

  return (
    <Box sx={{ overflowX: "auto" }}>
      <svg width={width} height={height} role="img" aria-label="Time series">
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={padLeft} y1={y(v)} x2={padLeft + plotW} y2={y(v)} stroke={GRID_COLOR} strokeWidth={1} />
            <text x={padLeft - 8} y={y(v) + 4} fill={TICK_COLOR} fontSize={11} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={area} fill="rgba(218,101,76,0.10)" />
        <path d={path} fill="none" stroke={LINE_COLOR} strokeWidth={2} />
        {annotations.map((a) => {
          const i = byDate.get(a.date);
          if (i === undefined) return null;
          const px = x(i);
          const py = y(points[i]!.value);
          const anchor = px > width - 180 ? "end" : px < 180 ? "start" : "middle";
          return (
            <g key={a.date + a.label}>
              <circle cx={px} cy={py} r={4} fill="#0a0a0a" stroke={a.color} strokeWidth={2} />
              <text
                x={px}
                y={a.below ? py + 18 : py - 10}
                fill={LABEL_COLOR}
                fontSize={11}
                textAnchor={anchor}
              >
                {a.label}
              </text>
            </g>
          );
        })}
        <text x={padLeft + plotW + 8} y={y(last.value) + 4} fill="rgba(255,255,255,0.87)" fontSize={12}>
          {last.value}
        </text>
        {tickIndexes.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            fill={TICK_COLOR}
            fontSize={11}
            textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"}
          >
            {DAY_FORMAT.format(new Date(`${points[i]!.date}T00:00:00Z`))}
          </text>
        ))}
      </svg>
    </Box>
  );
}
