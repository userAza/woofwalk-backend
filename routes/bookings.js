const express = require("express");
const pool = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}


  // USER – see own bookings

router.get("/", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT 
      b.id,
      b.date,
      b.status,
      b.created_at,
      w.name AS walker_name,
      GROUP_CONCAT(d.name SEPARATOR ', ') AS dogs
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
});


  // USER – create booking

router.post("/", authRequired, async (req, res) => {
  const { walker_id, date, dog_ids, addon_ids } = req.body;


  if (!walker_id || !date || !Array.isArray(dog_ids) || dog_ids.length === 0) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  try {
    const [dogs] = await pool.query(
      `SELECT id FROM dogs WHERE user_id = ? AND id IN (${dog_ids.map(() => "?").join(",")})`,
      [req.user.id, ...dog_ids]
    );

    if (dogs.length !== dog_ids.length) {
      return res.status(403).json({ error: "One or more dogs are not yours" });
    }

    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, walker_id, date, status)
       VALUES (?, ?, ?, 'pending')`,
      [req.user.id, walker_id, date]
    );

    const bookingId = result.insertId;

    const values = dog_ids.map(dogId => [bookingId, dogId]);
    await pool.query(
      `INSERT INTO booking_dogs (booking_id, dog_id) VALUES ?`,
      [values]
    );
    
    if (Array.isArray(addon_ids) && addon_ids.length > 0) {
      const [addons] = await pool.query(
        `SELECT id, price FROM walker_addons
        WHERE walker_id = ? AND id IN (${addon_ids.map(() => "?").join(",")})`,
        [walker_id, ...addon_ids]
      );

    if (addons.length !== addon_ids.length) {
      return res.status(400).json({ error: "Invalid addons for this walker" });
    }

    const addonValues = addons.map(a => [bookingId, a.id, a.price]);
    await pool.query(
      `INSERT INTO booking_addons (booking_id, addon_id, price_snapshot)
      VALUES ?`,
      [addonValues]
    );
  }


    res.status(201).json({ id: bookingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


   //USER – cancel booking

router.patch("/:id/cancel", authRequired, async (req, res) => {
  const bookingId = toNumber(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid id" });

  const [result] = await pool.query(
    `UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ?`,
    [bookingId, req.user.id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Booking not found" });
  }

  res.json({ success: true });
});


   //ADMIN – list all bookings

router.get("/admin/all", authRequired, adminOnly, async (req, res) => {
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
      b.base_price,
      b.extra_dogs_fee,
      b.total_price,
      GROUP_CONCAT(d.name SEPARATOR ', ') AS dogs
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
});

//   ADMIN – accept booking + pricing

router.patch("/admin/:id/status", authRequired, adminOnly, async (req, res) => {
  const bookingId = Number(req.params.id);
  const { status, walker_id } = req.body;

  if (!Number.isFinite(bookingId)) return res.status(400).json({ error: "Invalid id" });

  const allowedStatuses = ["pending", "accepted", "done", "cancelled", "declined"];
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

  try {
    let basePrice = null;
    let extraDogsFee = null;
    let addonsTotal = 0;
    let discountAmount = 0;
    let totalPrice = null;

    const [[addonsSum]] = await pool.query(
      `SELECT COALESCE(SUM(price_snapshot), 0) AS total
       FROM booking_addons
       WHERE booking_id = ?`,
      [bookingId]
    );
    addonsTotal = Number(addonsSum?.total) || 0;

    if (status === "accepted") {
      if (!walker_id) return res.status(400).json({ error: "walker_id is required when accepting" });

      const [[walker]] = await pool.query(
        `SELECT price_per_30min, extra_dog_fee_per_dog, max_dogs_per_walk
         FROM walkers
         WHERE id = ?`,
        [walker_id]
      );
      if (!walker) return res.status(400).json({ error: "Walker not found" });

      const [[count]] = await pool.query(
        `SELECT COUNT(*) AS total FROM booking_dogs WHERE booking_id = ?`,
        [bookingId]
      );
      const dogCount = Number(count?.total) || 0;

      basePrice = Number(walker.price_per_30min) || 0;

      const includedDogs = Number(walker.max_dogs_per_walk) || 0;
      const extraFeePerDog = Number(walker.extra_dog_fee_per_dog) || 0;
      extraDogsFee = Math.max(0, dogCount - includedDogs) * extraFeePerDog;

      const [[sub]] = await pool.query(
        `
        SELECT discount_percent
        FROM user_subscriptions
        WHERE user_id = (SELECT user_id FROM bookings WHERE id = ?)
          AND active_until > NOW()
        `,
        [bookingId]
      );
      const discountPercent = Number(sub?.discount_percent) || 0;
      discountAmount = (basePrice * discountPercent) / 100;

      totalPrice = basePrice - discountAmount + extraDogsFee + addonsTotal;
    }

    const [result] = await pool.query(
      `
      UPDATE bookings
      SET status = ?,
          walker_id = ?,
          base_price = ?,
          extra_dogs_fee = ?,
          addons_total = ?,
          discount_amount = ?,
          total_price = ?
      WHERE id = ?
      `,
      [status, walker_id || null, basePrice, extraDogsFee, addonsTotal, discountAmount, totalPrice, bookingId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: "Booking not found" });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});




// GET /api/bookings/walker/:walkerId/availability?date=YYYY-MM-DD
router.get("/walker/:walkerId/availability", authRequired, async (req, res) => {
  const walkerId = Number(req.params.walkerId);
  const { date } = req.query;

  if (!Number.isFinite(walkerId) || !date) {
    return res.status(400).json({ error: "Invalid walker or date" });
  }

  try {
    const [[busy]] = await pool.query(
      `
      SELECT 1
      FROM bookings
      WHERE walker_id = ?
        AND date = ?
        AND status IN ('accepted')
      LIMIT 1
      `,
      [walkerId, date]
    );

    res.json({ available: !busy });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// WALKER marks booking as done
router.patch("/walker/:id/done", authRequired, async (req, res) => {
  const bookingId = Number(req.params.id);

  if (!Number.isFinite(bookingId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

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
    res.status(500).json({ error: String(e.message || e) });
  }
});

// WALKER – see own bookings
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
