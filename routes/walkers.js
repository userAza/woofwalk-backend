const express = require("express");
const pool = require("../db");

const router = express.Router();

/* ==============================
   PUBLIC — SEARCH WALKERS
============================== */
router.get("/search", async (req, res) => {
  const { location, date, start_time, end_time, dogs } = req.query;

  if (!location || !date || !start_time || !end_time || !dogs) {
    return res.status(400).json({ error: "Missing filters" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        w.id,
        w.name,
        w.location,
        w.price_per_30min
      FROM walkers w
      WHERE
        w.is_banned = 0
        AND LOWER(w.location) LIKE LOWER(?)
        AND w.max_dogs_per_walk >= ?
        AND EXISTS (
          SELECT 1
          FROM walker_availability wa
          WHERE wa.walker_id = w.id
            AND wa.date = ?
            AND wa.start_time <= ?
            AND wa.end_time >= ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM bookings b
          WHERE b.walker_id = w.id
            AND b.date = ?
            AND b.status = 'accepted'
            AND NOT (b.end_time <= ? OR b.start_time >= ?)
        )
      ORDER BY w.created_at DESC
      `,
      [
        `%${location}%`,
        Number(dogs),
        date,
        start_time,
        end_time,
        date,
        start_time,
        end_time
      ]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ==============================
   PUBLIC — WALKER PROFILE
============================== */
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

    res.json(walker);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ==============================
   PUBLIC — WALKER AVAILABILITY (RESTORED)
============================== */
router.get("/:id/availability", async (req, res) => {
  const walkerId = Number(req.params.id);
  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

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
});

module.exports = router;
