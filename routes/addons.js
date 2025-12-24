const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// WALKER creates an addon
router.post("/", authRequired, async (req, res) => {
  if (req.user.role !== "walker") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { name, price } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const [[walker]] = await pool.query(
      `SELECT id FROM walkers WHERE user_id = ?`,
      [req.user.id]
    );

    if (!walker) {
      return res.status(404).json({ error: "Walker profile not found" });
    }

    const [result] = await pool.query(
      `INSERT INTO walker_addons (walker_id, name, price)
       VALUES (?, ?, ?)`,
      [walker.id, name, price]
    );

    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// GET addons for a walker
router.get("/walker/:walkerId", async (req, res) => {
  const walkerId = Number(req.params.walkerId);

  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, price
       FROM walker_addons
       WHERE walker_id = ?
       ORDER BY name`,
      [walkerId]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;
