import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import {
  fetchDistrictsGeoJSON,
  type DistrictFeatureProperties,
} from "../api.js";
import {
  NO_RATING_COLOR,
  RATING_COLORS,
  RATING_ORDER,
  ratingLabel,
} from "../format.js";

// Same basemap family as the ukraine tracker for platform consistency.
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
// Continental US. AK/HI are reachable by panning; a national risk read is the
// default frame (spec §13).
const CENTER: [number, number] = [-96.5, 38.5];
const ZOOM = 3.6;

const SRC_DISTRICTS = "districts";
const LYR_FILL = "districts-fill";
const LYR_LINE = "districts-line";

// MapLibre match expression: rating -> fill color.
function ratingFillExpression(): maplibregl.ExpressionSpecification {
  const branches: string[] = [];
  for (const rating of RATING_ORDER) {
    branches.push(rating, RATING_COLORS[rating] ?? NO_RATING_COLOR);
  }
  return [
    "match",
    ["coalesce", ["get", "rating"], ""],
    ...branches,
    NO_RATING_COLOR,
  ] as unknown as maplibregl.ExpressionSpecification; // spread-built match arms can't be inferred as the tuple type MapLibre declares
}

export function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DistrictFeatureProperties | null>(
    null,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: CENTER,
      zoom: ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const controller = new AbortController();
    map.on("load", async () => {
      try {
        const fc = await fetchDistrictsGeoJSON(controller.signal);
        map.addSource(SRC_DISTRICTS, { type: "geojson", data: fc });
        map.addLayer({
          id: LYR_FILL,
          type: "fill",
          source: SRC_DISTRICTS,
          paint: {
            "fill-color": ratingFillExpression(),
            "fill-opacity": 0.72,
          },
        });
        // Surface-colored borders play the role of the spacer gap between
        // fills, and hide simplification slivers between neighbors.
        map.addLayer({
          id: LYR_LINE,
          type: "line",
          source: SRC_DISTRICTS,
          paint: {
            "line-color": "#0a0a0a",
            "line-width": 0.75,
          },
        });
        setLoading(false);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load map");
          setLoading(false);
        }
      }
    });

    map.on("click", LYR_FILL, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      setSelected(feature.properties as unknown as DistrictFeatureProperties); // GeoJSON properties survive the round-trip as the endpoint's flat contract
    });
    map.on("mouseenter", LYR_FILL, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LYR_FILL, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      controller.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <Box sx={{ position: "relative", height: "calc(100vh - 130px)" }}>
      <Box ref={containerRef} sx={{ position: "absolute", inset: 0 }} />
      {loading && !error && (
        <CircularProgress
          size={32}
          sx={{ position: "absolute", top: 16, left: 16 }}
        />
      )}
      {error && (
        <Alert severity="error" sx={{ position: "absolute", top: 16, left: 16 }}>
          {error}
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{ position: "absolute", bottom: 24, left: 16, p: 1.5, opacity: 0.95 }}
      >
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Derived rating
        </Typography>
        <Stack direction="row" spacing={0} sx={{ mt: 0.5 }}>
          {RATING_ORDER.map((rating) => (
            <Box key={rating} sx={{ textAlign: "center", width: 52 }}>
              <Box
                sx={{
                  height: 10,
                  bgcolor: RATING_COLORS[rating],
                  mx: "1px",
                  borderRadius: 0.5,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {ratingLabel(rating)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>

      <Drawer
        anchor="right"
        open={selected !== null}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <Box sx={{ width: 340, p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6">{selected.id}</Typography>
              <Chip
                size="small"
                label={ratingLabel(selected.rating)}
                sx={{
                  bgcolor: selected.rating
                    ? RATING_COLORS[selected.rating]
                    : NO_RATING_COLOR,
                  color: "#0a0a0a",
                  fontWeight: 600,
                }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {selected.displayName}
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Row label="Member" value={selected.currentMember ?? "Vacant"} />
            <Row
              label="Incumbent party"
              value={selected.incumbentParty ?? "—"}
            />
            <Row
              label="Democratic candidate"
              value={selected.democraticCandidate ?? "—"}
            />
            <Row
              label="Republican candidate"
              value={selected.republicanCandidate ?? "—"}
            />
            <Row
              label="Projected margin"
              value={
                selected.projectedMargin == null
                  ? "—"
                  : `${selected.projectedMargin > 0 ? "D+" : "R+"}${Math.abs(
                      selected.projectedMargin,
                    ).toFixed(1)}`
              }
            />
          </Box>
        )}
      </Drawer>
    </Box>
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
