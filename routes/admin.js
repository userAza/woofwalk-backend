const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

// READ users
router.get("/users", authRequired, adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, email, role, subscription_active, is_banned FROM users"
  );
  res.json(rows);
});

// TOGGLE subscription
router.post(
  "/users/:id/subscription",
  authRequired,
  adminOnly,
  async (req, res) => {
    const { id } = req.params;

    await pool.query(
      "UPDATE users SET subscription_active = NOT subscription_active WHERE id = ?",
      [id]
    );

    res.json({ success: true });
  }
);

// BAN user
router.patch("/users/:id/ban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE users SET is_banned = 1 WHERE id = ?", [
    req.params.id
  ]);
  res.json({ success: true });
});

// UNBAN user
router.patch("/users/:id/unban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE users SET is_banned = 0 WHERE id = ?", [
    req.params.id
  ]);
  res.json({ success: true });
});

// READ walkers
router.get("/walkers", authRequired, adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, location, price_per_30min, is_banned FROM walkers"
  );
  res.json(rows);
});

// BAN / UNBAN walkers (already correct)
router.patch("/walkers/:id/ban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE walkers SET is_banned = 1 WHERE id = ?", [
    req.params.id
  ]);
  res.json({ success: true });
});

router.patch("/walkers/:id/unban", authRequired, adminOnly, async (req, res) => {
  await pool.query("UPDATE walkers SET is_banned = 0 WHERE id = ?", [
    req.params.id
  ]);
  res.json({ success: true });
});

module.exports = router;
