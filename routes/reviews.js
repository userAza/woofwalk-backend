const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.post("/", authRequired, async (req, res) => {
  const { booking_id, rating } = req.body;

  if (!booking_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    const [[booking]] = await pool.query(
      `
      SELECT id, walker_id
      FROM bookings
      WHERE id = ?
        AND user_id = ?
        AND status = 'done'
      `,
      [booking_id, req.user.id]
    );

    if (!booking) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const [[existing]] = await pool.query(
        `SELECT id FROM reviews WHERE booking_id = ?`,
        [booking_id]
    );

    if (existing) {
    return res.status(409).json({ error: "Review already exists for this booking" });
    }

    

    await pool.query(
      `
      INSERT INTO reviews (booking_id, walker_id, user_id, rating)
      VALUES (?, ?, ?, ?)
      `,
      [booking_id, booking.walker_id, req.user.id, rating]
    );

    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reviews/walker/:walkerId
router.get("/walker/:walkerId", async (req, res) => {
  const walkerId = Number(req.params.walkerId);

  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        r.id,
        r.rating,
        r.created_at,
        u.name AS user_name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.walker_id = ?
      ORDER BY r.created_at DESC
      `,
      [walkerId]
    );

    const [[avg]] = await pool.query(
      `SELECT AVG(rating) AS average FROM reviews WHERE walker_id = ?`,
      [walkerId]
    );

    res.json({
      average_rating: Number(avg.average) || 0,
      reviews: rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;
