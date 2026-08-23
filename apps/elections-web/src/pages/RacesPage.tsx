import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { RaceSummary } from "@elections-tracker/shared";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchRaces } from "../api.js";
import { PageHeader } from "../components/PageHeader.js";
import { NO_RATING_COLOR, RATING_COLORS, ratingLabel } from "../format.js";

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}`;
}

// D-to-R spectrum position, so sorting the rating column walks the scale
// instead of alphabetizing labels.
const RATING_ORDER: Record<string, number> = {
  SOLID_D: 0,
  LIKELY_D: 1,
  LEAN_D: 2,
  TOSS_UP: 3,
  LEAN_R: 4,
  LIKELY_R: 5,
  SOLID_R: 6,
};

type SortKey =
  | "districtId"
  | "incumbentParty"
  | "rating"
  | "interventionRelevance"
  | "processVulnerability"
  | "institutionalResistance"
  | "activePressure"
  | "pivotality";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "districtId", label: "District", numeric: false },
  { key: "incumbentParty", label: "Incumbent", numeric: false },
  { key: "rating", label: "Rating", numeric: false },
  { key: "interventionRelevance", label: "Intervention relevance", numeric: true },
  { key: "processVulnerability", label: "Vulnerability", numeric: true },
  { key: "institutionalResistance", label: "Resistance", numeric: true },
  { key: "activePressure", label: "Pressure", numeric: true },
  { key: "pivotality", label: "Pivotality", numeric: true },
];

function sortValue(race: RaceSummary, key: SortKey): string | number | null {
  if (key === "rating") {
    return race.rating != null ? (RATING_ORDER[race.rating] ?? null) : null;
  }
  return race[key];
}

export function RacesPage() {
  const [races, setRaces] = useState<RaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [orderBy, setOrderBy] = useState<SortKey>("interventionRelevance");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const controller = new AbortController();
    fetchRaces(controller.signal)
      .then(setRaces)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    if (!races) return null;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? races.filter((race) =>
          [
            race.districtId,
            race.displayName,
            race.incumbentParty ?? "",
            ratingLabel(race.rating),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : races;
    const sign = direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, orderBy);
      const vb = sortValue(b, orderBy);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls sink regardless of direction
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return sign * String(va).localeCompare(String(vb));
      }
      return sign * (va - vb);
    });
  }, [races, query, orderBy, direction]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!races || !visible) return <CircularProgress />;
  if (races.length === 0) {
    return (
      <Typography color="text.secondary">
        No races tracked yet. Seed districts and races to begin.
      </Typography>
    );
  }

  const competitive = races.filter(
    (race) => race.rating && /TOSS|LEAN/.test(race.rating),
  ).length;

  const handleSort = (key: SortKey) => {
    if (orderBy === key) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setOrderBy(key);
      setDirection(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
  };

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        title="Races"
        meta={`435 districts · ${competitive} competitive · indices are ordinal, not probabilities`}
      />
      <TextField
        size="small"
        fullWidth
        placeholder="Filter by district, member, party, or rating — e.g. AZ-06, TOSS-UP"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 1.5 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableCell key={col.key} align={col.numeric ? "right" : "left"}>
                  <TableSortLabel
                    active={orderBy === col.key}
                    direction={orderBy === col.key ? direction : col.numeric ? "desc" : "asc"}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((race) => (
              <TableRow key={race.id} hover>
                <TableCell>
                  <Link component={RouterLink} to={`/races/${race.districtId}`}>
                    {race.districtId}
                  </Link>
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {race.displayName}
                  </Typography>
                </TableCell>
                <TableCell>{race.incumbentParty ?? "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={ratingLabel(race.rating)}
                    sx={{
                      bgcolor: race.rating
                        ? RATING_COLORS[race.rating]
                        : NO_RATING_COLOR,
                      color: "#0a0a0a",
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {pct(race.interventionRelevance)}
                </TableCell>
                <TableCell align="right">{pct(race.processVulnerability)}</TableCell>
                <TableCell align="right">{pct(race.institutionalResistance)}</TableCell>
                <TableCell align="right">{pct(race.activePressure)}</TableCell>
                <TableCell align="right">{pct(race.pivotality)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            No races match &quot;{query}&quot;.
          </Typography>
        )}
      </TableContainer>
    </Box>
  );
}
