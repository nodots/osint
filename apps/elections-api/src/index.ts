import cors from "cors";
import express from "express";
import { districtsRouter } from "./routes/districts.js";
import { racesRouter } from "./routes/races.js";
import { eventsRouter } from "./routes/events.js";
import { houseControlRouter } from "./routes/house-control.js";
import { changesRouter } from "./routes/changes.js";

const app = express();
const PORT = Number(process.env.PORT ?? 6752);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:6751";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

// Never let the browser cache API responses — assessments and events change on
// analyst publish and a plain reload must always reflect the latest.
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Vertical prefix: the platform gateway routes /api/elections/* here with the
// path preserved, so the prefix is part of every mount.
const BASE = "/api/elections";

app.get(`${BASE}/health`, (_req, res) => {
  res.json({ ok: true, service: "elections-tracker-api" });
});

app.use(`${BASE}/districts`, districtsRouter);
app.use(`${BASE}/races`, racesRouter);
app.use(`${BASE}/events`, eventsRouter);
app.use(`${BASE}/house-control`, houseControlRouter);
app.use(`${BASE}/changes`, changesRouter);

// Centralized error handler — keeps route handlers free of try/catch noise.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "internal error";
    res.status(500).json({ error: message });
  },
);

app.listen(PORT, () => {
  console.log(`elections api listening on http://localhost:${PORT}`);
});
