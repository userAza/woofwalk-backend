const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * GET /api/walkers/search
 * ?location=&date=&start_time=&end_time=&dogs=
 */
router.get("/search", async (req, res) => {
  const { location, date, start_time, end_time, dogs } = req.query;

  if (!location || !date || !start_time || !end_time || !dogs) {
    return res.status(400).json({ error: "Missing query params" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT DISTINCT w.*
      FROM walkers w
      JOIN walker_availability a ON a.walker_id = w.user_id
      WHERE w.is_banned = 0
        AND w.location = ?
        AND w.max_dogs_per_walk >= ?
        AND a.date = ?
        AND a.start_time <= ?
        AND a.end_time >= ?
      `,
      [location, Number(dogs), date, start_time, end_time]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * GET /api/walkers/:id
 * Public walker profile
 */
router.get("/:id", async (req, res) => {
  const walkerId = Number(req.params.id);

  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [[walker]] = await pool.query(
      "SELECT * FROM walkers WHERE id = ? AND is_banned = 0",
      [walkerId]
    );

    if (!walker) {
      return res.status(404).json({ error: "Walker not found" });
    }

    const [addons] = await pool.query(
      "SELECT id, name, price FROM walker_addons WHERE walker_id = ?",
      [walker.user_id]
    );

    const [[rating]] = await pool.query(
      `
      SELECT 
        COUNT(*) as count,
        AVG(rating) as avg_rating
      FROM reviews
      WHERE walker_id = ?
      `,
      [walker.user_id]
    );

    res.json({
      walker,
      addons,
      rating: {
        count: rating.count,
        avg: rating.avg_rating ? Number(rating.avg_rating).toFixed(1) : null
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});


/**
 * GET /api/walkers/:id
 * Walker profile + avg rating + addons
 */
router.get("/:id", async (req, res) => {
  const walkerId = Number(req.params.id);
  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const [[walker]] = await pool.query(
      "SELECT * FROM walkers WHERE id = ? AND is_banned = 0",
      [walkerId]
    );

    if (!walker) return res.status(404).json({ error: "Walker not found" });

    const [[rating]] = await pool.query(
      "SELECT AVG(rating) AS avg_rating FROM reviews WHERE walker_id = ?",
      [walkerId]
    );

    const [addons] = await pool.query(
      "SELECT id, name, price FROM walker_addons WHERE walker_id = ?",
      [walkerId]
    );

    res.json({
      ...walker,
      avg_rating: rating.avg_rating,
      addons
    });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/walkers/:id/reviews
 */
router.get("/:id/reviews", async (req, res) => {
  const walkerId = Number(req.params.id);
  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT r.rating, r.comment, r.created_at, u.name AS user_name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.walker_id = ?
      ORDER BY r.created_at DESC
      `,
      [walkerId]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
