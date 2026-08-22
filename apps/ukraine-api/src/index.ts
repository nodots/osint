import cors from "cors";
import express from "express";
import { eventsRouter } from "./routes/events.js";
import { controlRouter } from "./routes/control.js";
import { frontlineRouter } from "./routes/frontline.js";
import { timelineRouter } from "./routes/timeline.js";
import { statsRouter } from "./routes/stats.js";
import { thermalRouter } from "./routes/thermal.js";
import { adminRouter } from "./routes/admin.js";

const app = express();
const PORT = Number(process.env.PORT ?? 6732);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:6731";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

// Never let the browser cache API responses — the data updates on ingest and a
// plain reload must always reflect the latest (otherwise a stale /timeline keeps
// the slider's date range frozen at page-load time).
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Vertical prefix: the platform gateway routes /api/ukraine/* here with the
// path preserved, so the prefix is part of every mount.
const BASE = "/api/ukraine";

app.get(`${BASE}/health`, (_req, res) => {
  res.json({ ok: true, service: "ukraine-conflict-tracker-api" });
});

app.use(`${BASE}/events`, eventsRouter);
app.use(`${BASE}/control`, controlRouter);
app.use(`${BASE}/frontline`, frontlineRouter);
app.use(`${BASE}/timeline`, timelineRouter);
app.use(`${BASE}/stats`, statsRouter);
app.use(`${BASE}/thermal`, thermalRouter);
app.use(`${BASE}/admin`, adminRouter);

// Centralized error handler — keeps route handlers free of try/catch noise.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "internal error";
    res.status(500).json({ error: message });
  },
);

app.listen(PORT, () => {
  console.log(`api listening on http://localhost:${PORT}`);
});
