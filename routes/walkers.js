const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/search", async (req, res) => {
  const { location, dogs, date, start_time, end_time } = req.query;

  if (!location || !dogs || !date || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing filters" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        w.id,
        w.name,
        w.location,
        w.price_per_30min,
        w.max_dogs_per_walk,
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(r.id) AS review_count
      FROM walkers w
      LEFT JOIN reviews r ON r.walker_id = w.id
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
      GROUP BY w.id
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

router.get("/:id", async (req, res) => {
  const walkerId = Number(req.params.id);
  
  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [[walker]] = await pool.query(
      `
      SELECT
        w.*,
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(r.id) AS review_count
      FROM walkers w
      LEFT JOIN reviews r ON r.walker_id = w.id
      WHERE w.id = ?
      GROUP BY w.id
      `,
      [walkerId]
    );

    if (!walker) {
      return res.status(404).json({ error: "Walker not found" });
    }

    const [availability] = await pool.query(
      `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time
      FROM walker_availability
      WHERE walker_id = ?
      ORDER BY date, start_time
      `,
      [walkerId]
    );

    res.json({ walker, availability });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/availability", async (req, res) => {
  const walkerId = Number(req.params.id);
  
  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time
      FROM walker_availability
      WHERE walker_id = ?
      ORDER BY date, start_time
      `,
      [walkerId]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;