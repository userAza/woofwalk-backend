const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

router.get("/", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.user_id,
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
      LEFT JOIN walkers w ON w.id = b.walker_id
      LEFT JOIN booking_dogs bd ON bd.booking_id = b.id
      LEFT JOIN dogs d ON d.id = bd.dog_id
      WHERE b.user_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/", authRequired, async (req, res) => {
  const { dog_ids, date, walker_id } = req.body;

  const walkerId = toNumber(walker_id);
  if (!Array.isArray(dog_ids) || dog_ids.length === 0 || !date || !walkerId) {
    return res.status(400).json({ error: "Missing fields (dog_ids, date, walker_id)" });
  }

  const dogIds = dog_ids.map(toNumber).filter((x) => x !== null);

  if (dogIds.length !== dog_ids.length) {
    return res.status(400).json({ error: "Invalid dog_ids" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // check walker exists + not banned
    const [walkers] = await conn.query(
      `
      SELECT id, price_per_30min, max_dogs_per_walk, extra_dog_fee_per_dog, is_banned
      FROM walkers
      WHERE id = ?
      `,
      [walkerId]
    );

    if (walkers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Walker not found" });
    }
    const walker = walkers[0];

    if (walker.is_banned === 1) {
      await conn.rollback();
      return res.status(403).json({ error: "Walker is banned" });
    }

    if (dogIds.length > walker.max_dogs_per_walk) {
      await conn.rollback();
      return res.status(400).json({ error: "Too many dogs for this walker" });
    }

    // check dogs belong to user
    const [dogs] = await conn.query(
      `
      SELECT id
      FROM dogs
      WHERE user_id = ? AND id IN (${dogIds.map(() => "?").join(",")})
      `,
      [req.user.id, ...dogIds]
    );

    if (dogs.length !== dogIds.length) {
      await conn.rollback();
      return res.status(403).json({ error: "One or more dogs are not yours" });
    }

    // pricing (simple version: base = price_per_30min, extra dogs fee for dogs beyond 1)
    const basePrice = Number(walker.price_per_30min || 0);
    const extraDogsFee = Number(walker.extra_dog_fee_per_dog || 0) * Math.max(0, dogIds.length - 1);
    const addonsTotal = 0;
    const discountAmount = 0;
    const totalPrice = basePrice + extraDogsFee + addonsTotal - discountAmount;

    const [ins] = await conn.query(
      `
      INSERT INTO bookings
        (user_id, date, status, walker_id, total_price, base_price, extra_dogs_fee, addons_total, discount_amount)
      VALUES
        (?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `,
      [req.user.id, date, walkerId, totalPrice, basePrice, extraDogsFee, addonsTotal, discountAmount]
    );

    const bookingId = ins.insertId;

    // insert dogs into booking_dogs
    for (const dogId of dogIds) {
      await conn.query(
        `INSERT INTO booking_dogs (booking_id, dog_id) VALUES (?, ?)`,
        [bookingId, dogId]
      );
    }

    await conn.commit();
    res.status(201).json({ id: bookingId, total_price: totalPrice });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    conn.release();
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
  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  const { status } = req.body;
  const allowed = ["pending", "accepted", "done", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE bookings SET status = ? WHERE id = ?`,
      [status, bookingId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
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

module.exports = router;
