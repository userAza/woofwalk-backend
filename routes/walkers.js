const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * ==============================
 * PUBLIC — SEARCH WALKERS
 * GET /api/walkers/search
 * ==============================
 * ?location=&date=&dogs=
 */
router.get("/search", async (req, res) => {
  const { location, date, dogs } = req.query;

  if (!location || !date || !dogs) {
    return res.status(400).json({ error: "Missing filters" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        w.id,
        w.name,
        w.bio,
        w.location,
        w.price_per_30min,
        w.max_dogs_per_walk,
        w.extra_dog_fee_per_dog
      FROM walkers w
      WHERE
        w.is_banned = 0
        AND LOWER(w.location) LIKE LOWER(?)
        AND w.max_dogs_per_walk >= ?
        AND NOT EXISTS (
          SELECT 1
          FROM bookings b
          WHERE b.walker_id = w.id
            AND b.date = ?
            AND b.status = 'accepted'
        )
      ORDER BY w.created_at DESC
      `,
      [`%${location}%`, Number(dogs), date]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==============================
 * PUBLIC — WALKER PROFILE
 * GET /api/walkers/:id
 * ==============================
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
      [walkerId]
    );

    const [[rating]] = await pool.query(
      `
      SELECT 
        COUNT(*) AS count,
        AVG(rating) AS avg_rating
      FROM reviews
      WHERE walker_id = ?
      `,
      [walkerId]
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
 * ==============================
 * PUBLIC — WALKER AVAILABILITY
 * GET /api/walkers/:id/availability
 * ==============================
 */
router.get("/:id/availability", async (req, res) => {
  const walkerId = Number(req.params.id);

  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT date, start_time, end_time
      FROM walker_availability
      WHERE walker_id = ?
      ORDER BY date, start_time
      `,
      [walkerId]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to load availability" });
  }
});

module.exports = router;
