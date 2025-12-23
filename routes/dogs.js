const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// GET all dogs for logged-in user
router.get("/", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, user_id, name, breed, age, notes, created_at FROM dogs WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST create dog
router.post("/", authRequired, async (req, res) => {
  const { name, breed, age, notes } = req.body;

  if (!name || !breed || age === undefined) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO dogs (user_id, name, breed, age, notes) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, name, breed, Number(age), notes || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE dog (only owner) + blocks if dog is used in bookings
router.delete("/:id", authRequired, async (req, res) => {
  const dogId = Number(req.params.id);

  if (!Number.isFinite(dogId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    // check ownership
    const [dogs] = await pool.query(
      "SELECT id FROM dogs WHERE id = ? AND user_id = ?",
      [dogId, req.user.id]
    );
    if (dogs.length === 0) {
      return res.status(404).json({ error: "Dog not found" });
    }

    // block delete if bookings exist
    const [bookings] = await pool.query(
      "SELECT id FROM bookings WHERE dog_id = ? LIMIT 1",
      [dogId]
    );
    if (bookings.length > 0) {
      return res.status(409).json({
        error: "Dog has bookings. Cancel/delete bookings first."
      });
    }

    await pool.query("DELETE FROM dogs WHERE id = ? AND user_id = ?", [dogId, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
