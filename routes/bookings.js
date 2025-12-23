const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

/**
 * GET all bookings of the logged-in user
 */
router.get("/", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        b.id,
        b.user_id,
        b.dog_id,
        d.name AS dog_name,
        b.date,
        b.time,
        b.duration_minutes,
        b.status,
        b.walker_name,
        b.created_at
       FROM bookings b
       JOIN dogs d ON d.id = b.dog_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * CREATE a new booking
 */
router.post("/", authRequired, async (req, res) => {
  const { dog_id, date, time, duration_minutes } = req.body;

  if (!dog_id || !date || !time || !duration_minutes) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const [dogs] = await pool.query(
      "SELECT id FROM dogs WHERE id = ? AND user_id = ?",
      [dog_id, req.user.id]
    );

    if (dogs.length === 0) {
      return res.status(403).json({ error: "Dog not found for this user" });
    }

    const [result] = await pool.query(
      `INSERT INTO bookings 
       (user_id, dog_id, date, time, duration_minutes, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, dog_id, date, time, duration_minutes]
    );

    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * USER cancels own booking
 */
router.patch("/:id/cancel", authRequired, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * ADMIN: get all bookings
 */
router.get("/admin/all", authRequired, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        b.id,
        b.user_id,
        u.name AS user_name,
        u.email,
        b.dog_id,
        d.name AS dog_name,
        b.date,
        b.time,
        b.duration_minutes,
        b.status,
        b.walker_name,
        b.created_at
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN dogs d ON d.id = b.dog_id
       ORDER BY b.created_at DESC`
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * ADMIN: update booking status (accept, done, cancel)
 */
router.patch("/admin/:id/status", authRequired, adminOnly, async (req, res) => {
  const { status, walker_name } = req.body;

  const allowedStatuses = ["pending", "accepted", "done", "cancelled"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE bookings
       SET status = ?, walker_name = ?
       WHERE id = ?`,
      [status, walker_name || null, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
  
});

router.delete("/:id", authRequired, async (req, res) => {
  const bookingId = Number(req.params.id);

  if (!Number.isFinite(bookingId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM bookings WHERE id = ? AND user_id = ?",
      [bookingId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN DELETE booking
router.delete("/admin/:id", authRequired, adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM bookings WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
