import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { RaceSummary } from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchRaces } from "../api.js";
import { PageHeader } from "../components/PageHeader.js";
import { NO_RATING_COLOR, RATING_COLORS, ratingLabel } from "../format.js";

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}`;
}

export function RacesPage() {
  const [races, setRaces] = useState<RaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!races) return <CircularProgress />;
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

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        title="Races"
        meta={`435 districts · ${competitive} competitive · sorted by intervention relevance · indices are ordinal, not probabilities`}
      />
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>District</TableCell>
              <TableCell>Incumbent</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell align="right">Intervention relevance</TableCell>
              <TableCell align="right">Vulnerability</TableCell>
              <TableCell align="right">Resistance</TableCell>
              <TableCell align="right">Pressure</TableCell>
              <TableCell align="right">Pivotality</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {races.map((race) => (
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
      </TableContainer>
    </Box>
  );
}
