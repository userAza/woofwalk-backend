const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

/* USERS */
router.get("/users", authRequired, adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, email, role, subscription_active, is_banned FROM users"
  );
  res.json(rows);
});

router.post("/users/:id/subscription", authRequired, adminOnly, async (req, res) => {
  await pool.query(
    "UPDATE users SET subscription_active = NOT subscription_active WHERE id = ?",
    [req.params.id]
  );
  res.json({ success: true });
});

router.patch("/users/:id/ban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE users SET is_banned = 1 WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

router.patch("/users/:id/unban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE users SET is_banned = 0 WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

/* WALKERS */
router.get("/walkers", authRequired, adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, location, price_per_30min, is_banned FROM walkers"
  );
  res.json(rows);
});

router.patch("/walkers/:id/ban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE walkers SET is_banned = 1 WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

router.patch("/walkers/:id/unban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE walkers SET is_banned = 0 WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

/* BOOKINGS */
router.get("/bookings", authRequired, adminOnly, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT 
      b.id,
      b.date,
      b.status,
      b.total_price,
      b.walker_id,
      u.name AS user_name,
      w.name AS walker_name
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN walkers w ON w.id = b.walker_id
    ORDER BY b.created_at DESC
  `);
  res.json(rows);
});

router.patch("/bookings/:id/status", authRequired, adminOnly, async (req, res) => {
  const { status } = req.body;

  const allowed = ["pending", "accepted", "done", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  await pool.query(
    "UPDATE bookings SET status = ? WHERE id = ?",
    [status, req.params.id]
  );

  res.json({ success: true });
});

module.exports = router;
