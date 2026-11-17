const express = require("express");
const compression = require("compression");
const expressStaticGzip = require("express-static-gzip");
const path = require("node:path");
const fs = require("node:fs");
const menuRouter = require("./routes/menu");
const reservationRouter = require("./routes/reservation");
const { restaurant } = require("./restaurant");
function createApp(db, options = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(compression({ threshold: 512, level: 6 }));
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });
  app.get("/api/restaurant", (req, res) => res.json(restaurant));
  app.use("/api/menu", menuRouter(db));
  app.use("/api/reservations", reservationRouter(db, options.now));
  app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint nie istnieje." }));
  const distPath = path.resolve(__dirname, "../../frontend/dist");
  if (fs.existsSync(path.join(distPath, "index.html"))) {
    app.use(expressStaticGzip(distPath, { enableBrotli: true }));
    app.get("/", (req, res) => res.sendFile(path.join(distPath, "index.html")));
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
