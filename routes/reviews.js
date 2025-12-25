const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

/* ==============================
   CREATE REVIEW (USER ONLY)
============================== */
router.post("/", authRequired, async (req, res) => {
  const { booking_id, rating, comment } = req.body;

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
      return res.status(403).json({ error: "Not allowed to review" });
    }

    const [[exists]] = await pool.query(
      "SELECT id FROM reviews WHERE booking_id = ?",
      [booking_id]
    );

    if (exists) {
      return res.status(409).json({ error: "Booking already reviewed" });
    }

    await pool.query(
      `
      INSERT INTO reviews (booking_id, walker_id, user_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
      `,
      [booking_id, booking.walker_id, req.user.id, rating, comment || null]
    );

    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ==============================
   GET REVIEWS + AVG FOR WALKER
============================== */
router.get("/walker/:walkerId", async (req, res) => {
  const walkerId = Number(req.params.walkerId);
  if (!Number.isFinite(walkerId)) {
    return res.status(400).json({ error: "Invalid walker id" });
  }

  try {
    const [[avg]] = await pool.query(
      `
      SELECT COALESCE(AVG(rating), 0) AS average_rating
      FROM reviews
      WHERE walker_id = ?
      `,
      [walkerId]
    );

    const [reviews] = await pool.query(
      `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.name AS user_name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.walker_id = ?
      ORDER BY r.created_at DESC
      `,
      [walkerId]
    );

    res.json({
      average_rating: Number(avg.average_rating),
      reviews
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
