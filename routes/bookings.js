const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

router.get("/", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT 
      b.id,
      b.date,
      b.status,
      b.created_at,
      w.name AS walker_name,
      GROUP_CONCAT(d.name) AS dogs
     FROM bookings b
     JOIN booking_dogs bd ON bd.booking_id = b.id
     JOIN dogs d ON d.id = bd.dog_id
     LEFT JOIN walkers w ON w.id = b.walker_id
     WHERE b.user_id = ?
     GROUP BY b.id
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );

  res.json(rows);
});


router.post("/", authRequired, async (req, res) => {
  const { walker_id, date, dog_ids } = req.body;

  if (!walker_id || !date || !Array.isArray(dog_ids) || dog_ids.length === 0) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  try {
    // 1) Check that all dogs belong to this user
    const [dogs] = await pool.query(
      `SELECT id FROM dogs WHERE user_id = ? AND id IN (${dog_ids.map(() => "?").join(",")})`,
      [req.user.id, ...dog_ids]
    );

    if (dogs.length !== dog_ids.length) {
      return res.status(403).json({ error: "One or more dogs are not yours" });
    }

    // 2) Create booking
    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, walker_id, date, status)
       VALUES (?, ?, ?, 'pending')`,
      [req.user.id, walker_id, date]
    );

    const bookingId = result.insertId;

    // 3) Link dogs to booking
    const values = dog_ids.map((dogId) => [bookingId, dogId]);
    await pool.query(
      `INSERT INTO booking_dogs (booking_id, dog_id) VALUES ?`,
      [values]
    );

    res.status(201).json({ id: bookingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.patch("/:id/cancel", authRequired, async (req, res) => {
  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  try {
    const [result] = await pool.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ?`,
      [bookingId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/admin/all", authRequired, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.user_id,
        u.name AS user_name,
        u.email,
        b.date,
        b.status,
        b.created_at,
        b.walker_id,
        w.name AS walker_name,
        b.total_price,
        b.base_price,
        b.extra_dogs_fee,
        b.addons_total,
        b.discount_amount,
        GROUP_CONCAT(d.name ORDER BY d.name SEPARATOR ', ') AS dogs
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN walkers w ON w.id = b.walker_id
      LEFT JOIN booking_dogs bd ON bd.booking_id = b.id
      LEFT JOIN dogs d ON d.id = bd.dog_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      `
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.patch("/admin/:id/status", authRequired, adminOnly, async (req, res) => {
  const bookingId = Number(req.params.id);
  const { status, walker_id } = req.body;

  if (!Number.isFinite(bookingId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const allowedStatuses = ["pending", "accepted", "done", "cancelled"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE bookings
       SET status = ?, walker_id = ?
       WHERE id = ?`,
      [status, walker_id || null, bookingId]
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
  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // delete booking_dogs first (unless you have ON DELETE CASCADE)
    await conn.query(
      `DELETE FROM booking_dogs WHERE booking_id = ?`,
      [bookingId]
    );

    const [result] = await conn.query(
      `DELETE FROM bookings WHERE id = ? AND user_id = ?`,
      [bookingId, req.user.id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    await conn.commit();
    res.json({ success: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.delete("/admin/:id", authRequired, adminOnly, async (req, res) => {
  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`DELETE FROM booking_dogs WHERE booking_id = ?`, [bookingId]);

    const [result] = await conn.query(
      `DELETE FROM bookings WHERE id = ?`,
      [bookingId]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    await conn.commit();
    res.json({ success: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
  }
});

router.get("/walker", authRequired, async (req, res) => {
  if (req.user.role !== "walker") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.date,
        b.status,
        b.created_at,
        GROUP_CONCAT(d.name ORDER BY d.name SEPARATOR ', ') AS dogs
      FROM bookings b
      JOIN walkers w ON w.id = b.walker_id
      LEFT JOIN booking_dogs bd ON bd.booking_id = b.id
      LEFT JOIN dogs d ON d.id = bd.dog_id
      WHERE w.user_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.patch("/walker/:id/done", authRequired, async (req, res) => {
  const bookingId = Number(req.params.id);

  if (!Number.isFinite(bookingId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  // only walkers allowed
  if (req.user.role !== "walker") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const [result] = await pool.query(
      `
      UPDATE bookings
      SET status = 'done'
      WHERE id = ?
        AND walker_id = (
          SELECT id FROM walkers WHERE user_id = ?
        )
      `,
      [bookingId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found or not yours" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/walker", authRequired, async (req, res) => {
  if (req.user.role !== "walker") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.date,
        b.status,
        b.created_at,
        u.name AS user_name,
        GROUP_CONCAT(d.name SEPARATOR ', ') AS dogs
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN booking_dogs bd ON bd.booking_id = b.id
      LEFT JOIN dogs d ON d.id = bd.dog_id
      WHERE b.walker_id = (
        SELECT id FROM walkers WHERE user_id = ?
      )
      GROUP BY b.id
      ORDER BY b.date
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;
