const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const menuRouter = require("./routes/menu");
const reservationRouter = require("./routes/reservation");
const { restaurant } = require("./restaurant");
function createApp(db, options = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Dynamic responses are revalidated; reservation data must never be stored.
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  app.get("/api/restaurant", (req, res) => {
    res.set("Cache-Control", "public, no-cache");
    res.json(restaurant);
  });
  app.use("/api/menu", menuRouter(db));
  app.use("/api/reservations", reservationRouter(db, options.now));
  app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint nie istnieje." }));
  const distPath = path.resolve(__dirname, "../../frontend/dist");
  if (fs.existsSync(path.join(distPath, "index.html"))) {
    // Only Vite's content-hashed assets can safely be cached for a year.
    app.use("/assets", express.static(path.join(distPath, "assets"), {
      maxAge: "1y", immutable: true, index: false,
    }));
    app.use(express.static(distPath, {
      setHeaders(res) { res.setHeader("Cache-Control", "no-cache"); },
    }));
    app.get("/", (req, res) => res.sendFile(path.join(distPath, "index.html"), { headers: { "Cache-Control": "no-cache" } }));
  }
  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Niepoprawny JSON." });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Żądanie jest zbyt duże." });
    console.error(error);
    res.status(500).json({ error: "Błąd serwera. Spróbuj ponownie później." });
  });
  return app;
}
module.exports = { createApp };
