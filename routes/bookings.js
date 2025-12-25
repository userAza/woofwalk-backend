const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/* ======================
   USER – SEE OWN BOOKINGS
====================== */
router.get("/", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT 
      b.id,
      b.date,
      b.start_time,
      b.end_time,
      b.status,
      b.created_at,
      w.name AS walker_name,
      GROUP_CONCAT(DISTINCT d.name SEPARATOR ', ') AS dogs,
      GROUP_CONCAT(
        DISTINCT CONCAT(a.name, ':', ba.price_snapshot)
        SEPARATOR '|'
      ) AS addons
    FROM bookings b
    LEFT JOIN walkers w ON w.id = b.walker_id
    LEFT JOIN booking_dogs bd ON bd.booking_id = b.id
    LEFT JOIN dogs d ON d.id = bd.dog_id
    LEFT JOIN booking_addons ba ON ba.booking_id = b.id
    LEFT JOIN walker_addons a ON a.id = ba.addon_id
    WHERE b.user_id = ?
    GROUP BY b.id
    ORDER BY b.created_at DESC
    `,
    [req.user.id]
  );

  res.json(rows);
});


/* ======================
   USER – CREATE BOOKING
====================== */
router.post("/", authRequired, async (req, res) => {
  const { walker_id, date, start_time, end_time, dog_ids, addon_ids } = req.body;

  if (
    !walker_id ||
    !date ||
    !start_time ||
    !end_time ||
    !Array.isArray(dog_ids) ||
    dog_ids.length === 0
  ) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  try {
    // block banned user
    const [[user]] = await pool.query(
      "SELECT is_banned FROM users WHERE id = ?",
      [req.user.id]
    );
    if (user?.is_banned) {
      return res.status(403).json({ error: "User is banned" });
    }

    // block banned walker
    const [[walker]] = await pool.query(
      "SELECT is_banned FROM walkers WHERE id = ?",
      [walker_id]
    );
    if (!walker || walker.is_banned) {
      return res.status(403).json({ error: "Walker unavailable" });
    }

    // validate dogs
    const [dogs] = await pool.query(
      `SELECT id FROM dogs WHERE user_id = ? AND id IN (${dog_ids
        .map(() => "?")
        .join(",")})`,
      [req.user.id, ...dog_ids]
    );
    if (dogs.length !== dog_ids.length) {
      return res.status(403).json({ error: "One or more dogs are not yours" });
    }

    // check availability window
    const [[slot]] = await pool.query(
      `
      SELECT 1
      FROM walker_availability
      WHERE walker_id = ?
        AND date = ?
        AND start_time <= ?
        AND end_time >= ?
      `,
      [walker_id, date, start_time, end_time]
    );

    if (!slot) {
      return res.status(400).json({ error: "Time outside availability" });
    }

    // prevent overlapping accepted bookings
    const [[conflict]] = await pool.query(
      `
      SELECT 1
      FROM bookings
      WHERE walker_id = ?
        AND date = ?
        AND status = 'accepted'
        AND NOT (end_time <= ? OR start_time >= ?)
      `,
      [walker_id, date, start_time, end_time]
    );

    if (conflict) {
      return res.status(400).json({ error: "Time slot unavailable" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO bookings (user_id, walker_id, date, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [req.user.id, walker_id, date, start_time, end_time]
    );

    const bookingId = result.insertId;

    await pool.query(
      `INSERT INTO booking_dogs (booking_id, dog_id) VALUES ?`,
      [dog_ids.map((d) => [bookingId, d])]
    );

    // addons (optional)
    if (Array.isArray(addon_ids) && addon_ids.length > 0) {
      const [addons] = await pool.query(
        `SELECT id, price FROM walker_addons
         WHERE walker_id = ? AND id IN (${addon_ids.map(() => "?").join(",")})`,
        [walker_id, ...addon_ids]
      );

      if (addons.length !== addon_ids.length) {
        return res.status(400).json({ error: "Invalid addons" });
      }

      await pool.query(
        `
        INSERT INTO booking_addons (booking_id, addon_id, price_snapshot)
        VALUES ?
        `,
        [addons.map((a) => [bookingId, a.id, a.price])]
      );
    }

    res.status(201).json({ id: bookingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================
   USER – CANCEL BOOKING
====================== */
router.patch("/:id/cancel", authRequired, async (req, res) => {
  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  const [result] = await pool.query(
    `
    UPDATE bookings
    SET status = 'cancelled'
    WHERE id = ? AND user_id = ?
    `,
    [bookingId, req.user.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ error: "Booking not found" });
  }

  res.json({ success: true });
});

/* ======================
   WALKER – SEE OWN BOOKINGS
====================== */
router.get("/walker", authRequired, async (req, res) => {
  if (req.user.role !== "walker") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const [rows] = await pool.query(
    `
    SELECT
      b.id,
      b.date,
      b.start_time,
      b.end_time,
      b.status,
      b.created_at,
      u.name AS user_name,
      GROUP_CONCAT(d.name SEPARATOR ', ') AS dogs
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN walkers w ON w.id = b.walker_id
    LEFT JOIN booking_dogs bd ON bd.booking_id = b.id
    LEFT JOIN dogs d ON d.id = bd.dog_id
    WHERE w.user_id = ?
    GROUP BY b.id
    ORDER BY b.date
    `,
    [req.user.id]
  );

  res.json(rows);
});

/* ======================
   WALKER – MARK DONE
====================== */
router.patch("/walker/:id/done", authRequired, async (req, res) => {
  if (req.user.role !== "walker") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  const [result] = await pool.query(
    `
    UPDATE bookings
    SET status = 'done'
    WHERE id = ?
      AND walker_id = (SELECT id FROM walkers WHERE user_id = ?)
    `,
    [bookingId, req.user.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ error: "Booking not found or not yours" });
  }

  res.json({ success: true });
});

module.exports = router;
