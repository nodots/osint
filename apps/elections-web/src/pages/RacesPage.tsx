import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { RaceSummary } from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { fetchRaces } from "../api.js";

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

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 1000 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>District</TableCell>
            <TableCell>Incumbent</TableCell>
            <TableCell>Rating</TableCell>
            <TableCell align="right">Vulnerability</TableCell>
            <TableCell align="right">Pivotality</TableCell>
            <TableCell align="right">Subversion risk</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {races.map((race) => (
            <TableRow key={race.id} hover>
              <TableCell>{race.displayName}</TableCell>
              <TableCell>{race.incumbentParty ?? "—"}</TableCell>
              <TableCell>{race.rating ?? "—"}</TableCell>
              <TableCell align="right">{pct(race.processVulnerability)}</TableCell>
              <TableCell align="right">{pct(race.pivotality)}</TableCell>
              <TableCell align="right">{pct(race.subversionRisk)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
