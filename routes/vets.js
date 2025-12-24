const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const city = (req.query.city || "").trim();

  try {
    let sql = "SELECT id, name, city, address, phone, maps_url, created_at FROM vets";
    const params = [];

    if (city) {
      sql += " WHERE city LIKE ?";
      params.push(`%${city}%`);
    }

    sql += " ORDER BY created_at DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/", authRequired, adminOnly, async (req, res) => {
  const { name, city, address, phone, maps_url } = req.body;

  if (!name || !city) return res.status(400).json({ error: "Missing fields" });

  try {
    const [result] = await pool.query(
      "INSERT INTO vets (name, city, address, phone, maps_url) VALUES (?, ?, ?, ?, ?)",
      [name, city, address || null, phone || null, maps_url || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  const { name, city, address, phone, maps_url } = req.body;
  if (!name || !city) return res.status(400).json({ error: "Missing fields" });

  try {
    const [result] = await pool.query(
      "UPDATE vets SET name=?, city=?, address=?, phone=?, maps_url=? WHERE id=?",
      [name, city, address || null, phone || null, maps_url || null, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete("/:id", authRequired, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const [result] = await pool.query("DELETE FROM vets WHERE id=?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
