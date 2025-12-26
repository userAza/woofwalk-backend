const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.get("/my-subscription", authRequired, async (req, res) => {
  try {
    const [[sub]] = await pool.query(
      `
      SELECT 
        discount_percent,
        active_until,
        CASE 
          WHEN active_until >= CURDATE() THEN 1
          ELSE 0
        END AS active
      FROM user_subscriptions
      WHERE user_id = ?
      `,
      [req.user.id]
    );

    if (!sub) {
      return res.json({ active: false, discount_percent: 0, active_until: null });
    }

    res.json(sub);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/all", authRequired, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        u.id AS user_id,
        u.name,
        u.email,
        COALESCE(s.discount_percent, 0) AS discount_percent,
        s.active_until,
        CASE 
          WHEN s.active_until IS NOT NULL AND s.active_until >= CURDATE() THEN 1
          ELSE 0
        END AS active,
        COUNT(b.id) AS total_bookings,
        COALESCE(SUM(CASE WHEN b.status = 'done' THEN 1 ELSE 0 END), 0) AS completed_bookings
      FROM users u
      LEFT JOIN user_subscriptions s ON s.user_id = u.id
      LEFT JOIN bookings b ON b.user_id = u.id
      WHERE u.role = 'user'
      GROUP BY u.id
      ORDER BY completed_bookings DESC, u.name
      `
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/grant/:userId", authRequired, adminOnly, async (req, res) => {
  const userId = Number(req.params.userId);
  
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const activeUntil = new Date();
    activeUntil.setMonth(activeUntil.getMonth() + 1);

    await pool.query(
      `
      INSERT INTO user_subscriptions (user_id, discount_percent, active_until)
      VALUES (?, 20, ?)
      ON DUPLICATE KEY UPDATE
        discount_percent = 20,
        active_until = ?
      `,
      [userId, activeUntil, activeUntil]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/revoke/:userId", authRequired, adminOnly, async (req, res) => {
  const userId = Number(req.params.userId);
  
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    await pool.query(
      "UPDATE user_subscriptions SET active_until = NULL WHERE user_id = ?",
      [userId]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;