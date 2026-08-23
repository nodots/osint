import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HouseControlSummary, RaceSummary } from "@elections-tracker/shared";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  fetchDistrictsGeoJSON,
  fetchHouseControl,
  fetchRaces,
  type DistrictFeatureProperties,
} from "../api.js";
import {
  NO_RATING_COLOR,
  RATING_COLORS,
  RATING_ORDER,
  RELEVANCE_RAMP,
  RELEVANCE_RAMP_CSS,
  ratingLabel,
} from "../format.js";

// Same basemap family as the ukraine tracker for platform consistency — and
// the same layer grammar: intensity as blurred, magnitude-scaled circles over
// a dark basemap (cf. the ukraine strikes-circle layer). Intervention
// relevance is the primary encoding; the derived-rating choropleth stays as a
// heavily muted wash underneath (spec: horse race visible but secondary).
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
// Continental US. AK/HI are reachable by panning; a national risk read is the
// default frame (spec §13).
const CENTER: [number, number] = [-96.5, 38.5];
const ZOOM = 3.6;

const SRC_DISTRICTS = "districts";
const SRC_CENTROIDS = "district-centroids";
const LYR_FILL = "districts-fill";
const LYR_LINE = "districts-line";
const LYR_GLOW = "relevance-glow";
const LYR_CORE = "relevance-core";
// Rating wash opacity: quiet enough that the spotlights own the read.
const WASH_OPACITY = 0.14;

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

// interpolate on interventionRelevance (0–1) through the shared ramp.
function relevanceColorExpression(): maplibregl.ExpressionSpecification {
  const stops = RELEVANCE_RAMP.flatMap(([v, c]) => [v, c]);
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "interventionRelevance"], 0],
    ...stops,
  ] as unknown as maplibregl.ExpressionSpecification; // spread-built stops, same inference limitation as above
}

function rampColor(ir: number): string {
  let hex = RELEVANCE_RAMP[0]![1];
  for (const [v, c] of RELEVANCE_RAMP) {
    if (ir >= v) hex = c;
  }
  return hex;
}

// Point FeatureCollection for the spotlight layers, from the polygons'
// server-computed centroids (ST_PointOnSurface).
function centroidCollection(
  fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features
      .filter((f) => (f.properties as DistrictFeatureProperties).centroid)
      .map((f) => {
        const props = f.properties as DistrictFeatureProperties;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: props.centroid },
          properties: props,
        };
      }),
  };
}

export function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DistrictFeatureProperties | null>(
    null,
  );
  const [control, setControl] = useState<HouseControlSummary | null>(null);
  const [topRaces, setTopRaces] = useState<RaceSummary[]>([]);
  const [showSpotlights, setShowSpotlights] = useState(true);
  const [showWash, setShowWash] = useState(true);
  const geojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);

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

    fetchHouseControl(controller.signal)
      .then(setControl)
      .catch(() => undefined); // context strip only — the map works without it
    fetchRaces(controller.signal)
      .then((races) =>
        setTopRaces(
          [...races]
            .filter((r) => r.interventionRelevance != null)
            .sort(
              (a, b) =>
                (b.interventionRelevance ?? 0) - (a.interventionRelevance ?? 0),
            )
            .slice(0, 10),
        ),
      )
      .catch(() => undefined);

    map.on("load", async () => {
      try {
        const fc = await fetchDistrictsGeoJSON(controller.signal);
        geojsonRef.current = fc;
        map.addSource(SRC_DISTRICTS, { type: "geojson", data: fc });
        map.addSource(SRC_CENTROIDS, {
          type: "geojson",
          data: centroidCollection(fc),
        });

        // SECONDARY: derived-rating choropleth, muted to a wash.
        map.addLayer({
          id: LYR_FILL,
          type: "fill",
          source: SRC_DISTRICTS,
          paint: {
            "fill-color": ratingFillExpression(),
            "fill-opacity": WASH_OPACITY,
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

        // PRIMARY: intervention-relevance spotlights (ukraine strike-layer
        // grammar — blurred halo + sharper core, both scaled by the index).
        map.addLayer({
          id: LYR_GLOW,
          type: "circle",
          source: SRC_CENTROIDS,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "interventionRelevance"], 0],
              0, 3,
              0.2, 8,
              0.35, 16,
              0.55, 30,
            ] as unknown as maplibregl.ExpressionSpecification, // spread-free but the tuple type still defeats inference on nested arrays
            "circle-color": relevanceColorExpression(),
            "circle-opacity": 0.45,
            "circle-blur": 1,
          },
        });
        map.addLayer({
          id: LYR_CORE,
          type: "circle",
          source: SRC_CENTROIDS,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "interventionRelevance"], 0],
              0, 1,
              0.2, 2.5,
              0.55, 5,
            ] as unknown as maplibregl.ExpressionSpecification, // as above
            "circle-color": relevanceColorExpression(),
            "circle-opacity": 0.9,
            "circle-blur": 0.2,
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

    const select = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      setSelected(feature.properties as unknown as DistrictFeatureProperties); // GeoJSON properties survive the round-trip as the endpoint's flat contract
    };
    for (const layer of [LYR_FILL, LYR_GLOW, LYR_CORE]) {
      map.on("click", layer, select);
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      controller.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Layer toggles (ukraine Legend pattern).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LYR_GLOW)) return;
    const visibility = showSpotlights ? "visible" : "none";
    map.setLayoutProperty(LYR_GLOW, "visibility", visibility);
    map.setLayoutProperty(LYR_CORE, "visibility", visibility);
  }, [showSpotlights, loading]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LYR_FILL)) return;
    map.setPaintProperty(LYR_FILL, "fill-opacity", showWash ? WASH_OPACITY : 0);
  }, [showWash, loading]);

  const openDistrict = (districtId: string) => {
    const feature = geojsonRef.current?.features.find(
      (f) => (f.properties as DistrictFeatureProperties).id === districtId,
    );
    if (!feature) return;
    const props = feature.properties as DistrictFeatureProperties;
    setSelected(props);
    if (props.centroid) {
      mapRef.current?.flyTo({ center: props.centroid, zoom: 6.5 });
    }
  };

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const projection = control?.baselineProjection ?? null;
  const demPct = projection
    ? (projection.dem / (projection.dem + projection.rep)) * 100
    : 50;

  return (
    <Box sx={{ display: "flex", gap: 2.5, height: "calc(100vh - 130px)" }}>
      <Box sx={{ position: "relative", flexGrow: 1, minWidth: 0 }}>
        <Box ref={containerRef} sx={{ position: "absolute", inset: 0 }} />
        {loading && (
          <CircularProgress
            size={32}
            sx={{ position: "absolute", top: 16, left: 16 }}
          />
        )}

        {/* secondary horse-race strip: compact seat bar, top-left */}
        {projection && (
          <Paper
            variant="outlined"
            sx={{ position: "absolute", top: 14, left: 14, p: 1.25, px: 1.75, width: 240, opacity: 0.95 }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>
              House projection — context
            </Typography>
            <Box sx={{ display: "flex", height: 8, borderRadius: 0.5, overflow: "hidden", mt: 0.75 }}>
              <Box sx={{ width: `${demPct}%`, bgcolor: "rgba(42,106,184,0.55)" }} />
              <Box sx={{ width: `${100 - demPct}%`, bgcolor: "rgba(194,59,43,0.55)" }} />
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
              <Typography variant="caption">D {projection.dem}</Typography>
              <Typography variant="caption" color="text.secondary">
                {control?.competitiveRaces} competitive
              </Typography>
              <Typography variant="caption">R {projection.rep}</Typography>
            </Stack>
          </Paper>
        )}

        {/* legend: relevance primary, rating demoted, layer switches */}
        <Paper
          variant="outlined"
          sx={{ position: "absolute", bottom: 24, left: 14, p: 1.5, width: 300, opacity: 0.95 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Intervention relevance
          </Typography>
          <Box sx={{ height: 12, borderRadius: 0.5, mt: 0.75, background: RELEVANCE_RAMP_CSS }} />
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.25 }}>
            {[0, 25, 50, 75, 100].map((v) => (
              <Typography key={v} variant="caption" color="text.secondary">
                {v}
              </Typography>
            ))}
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Derived rating — muted base wash; full color on selection
          </Typography>
          <Stack direction="row" spacing="2px" sx={{ mt: 0.5 }}>
            {RATING_ORDER.map((rating) => (
              <Box
                key={rating}
                sx={{ flex: 1, height: 6, borderRadius: "1px", bgcolor: RATING_COLORS[rating], opacity: 0.45 }}
              />
            ))}
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={0}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption">Relevance spotlights</Typography>
              <Switch size="small" checked={showSpotlights} onChange={() => setShowSpotlights((v) => !v)} />
            </Stack>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption">Rating wash</Typography>
              <Switch size="small" checked={showWash} onChange={() => setShowWash((v) => !v)} />
            </Stack>
          </Stack>
        </Paper>
      </Box>

      {/* ranked rail: the leaders, live */}
      <Paper
        variant="outlined"
        sx={{ width: 316, flexShrink: 0, p: 2, display: "flex", flexDirection: "column", overflow: "auto" }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: "0.08em", mb: 1 }}
        >
          Highest intervention relevance
        </Typography>
        {topRaces.map((race, i) => (
          <Stack
            key={race.districtId}
            direction="row"
            alignItems="center"
            spacing={1.25}
            onClick={() => openDistrict(race.districtId)}
            sx={{
              py: 0.75,
              borderBottom: i < topRaces.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
              cursor: "pointer",
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ width: 16 }}>
              {i + 1}
            </Typography>
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {race.districtId}
            </Typography>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                boxSizing: "border-box",
                border: `2px solid ${race.rating ? RATING_COLORS[race.rating] : NO_RATING_COLOR}`,
                opacity: 0.8,
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ width: 52 }}>
              {ratingLabel(race.rating)}
            </Typography>
            <Typography
              variant="body1"
              sx={{ fontWeight: 700, color: rampColor(race.interventionRelevance ?? 0) }}
            >
              {Math.round((race.interventionRelevance ?? 0) * 100)}
            </Typography>
          </Stack>
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ mt: "auto", pt: 1.5, borderTop: "1px solid rgba(255,255,255,0.12)", lineHeight: 1.5 }}>
          Click a spotlight or a row for the district drawer. Indices are
          ordinal, not probabilities; ratings feed pivotality inside the index.
        </Typography>
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
              {selected.interventionRelevance != null && (
                <Typography variant="h6" sx={{ color: rampColor(selected.interventionRelevance), fontWeight: 700 }}>
                  {Math.round(selected.interventionRelevance * 100)}
                </Typography>
              )}
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
            <Divider sx={{ my: 1.5 }} />
            <Link component={RouterLink} to={`/races/${selected.id}`}>
              Full race intelligence →
            </Link>
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
