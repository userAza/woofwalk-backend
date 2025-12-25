const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, role, address, phone, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "User not found" });

    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/", authRequired, async (req, res) => {
  const { name, address, phone } = req.body;

  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const [result] = await pool.query(
      "UPDATE users SET name = ?, address = ?, phone = ? WHERE id = ?",
      [name, address || null, phone || null, req.user.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/me", authRequired, async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email required" });
  }

  await pool.query(
    `
    UPDATE users
    SET name = ?, email = ?
    WHERE id = ?
    `,
    [name, email, req.user.id]
  );

  res.json({ success: true });
});

module.exports = router;
