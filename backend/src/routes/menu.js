const express = require("express");
module.exports = function menuRouter(db) {
  const router = express.Router();
  const dataVersion = db.prepare("PRAGMA data_version");
  const totalChanges = db.prepare("SELECT total_changes() AS count");
  const selectCategories = db.prepare("SELECT * FROM categories ORDER BY sort_order, id");
  const selectDishes = db.prepare(`SELECT id, category_id, name, description, price_grosz
    FROM dishes WHERE available = 1 ORDER BY id`);
  let cachedVersion;
  let cachedChanges;
  let cachedBody;
  router.get("/", (req, res) => {
    // Detect writes through this connection and through other SQLite connections.
    // A read transaction keeps the version and menu in the same snapshot.
    db.exec("BEGIN");
    try {
      const version = dataVersion.get().data_version;
      const changes = totalChanges.get().count;
      if (cachedBody === undefined || version !== cachedVersion || changes !== cachedChanges) {
        const categories = selectCategories.all();
        const dishes = selectDishes.all();
        cachedBody = JSON.stringify({ categories: categories.map((category) => ({
          id: category.id, name: category.name,
          dishes: dishes.filter((dish) => dish.category_id === category.id),
        })) });
        cachedVersion = version;
        cachedChanges = changes;
      }
    } finally {
      db.exec("ROLLBACK");
    }
    res.set("Cache-Control", "public, no-cache");
    res.type("json").send(cachedBody);
  });
  return router;
};
