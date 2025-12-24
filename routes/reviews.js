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

module.exports = router;
