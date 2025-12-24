const express = require("express");
const pool = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// TOGGLE subscription
router.post("/toggle", authRequired, async (req, res) => {
  const DISCOUNT_PERCENT = 10;
  const MONTHS = 1;

  try {
    const [[sub]] = await pool.query(
      "SELECT active_until FROM user_subscriptions WHERE user_id = ?",
      [req.user.id]
    );

    // unsubscribe
    if (sub && sub.active_until && new Date(sub.active_until) > new Date()) {
      await pool.query(
        "UPDATE user_subscriptions SET active_until = NULL WHERE user_id = ?",
        [req.user.id]
      );
      return res.json({ subscribed: false });
    }

    // subscribe
    const [result] = await pool.query(
      `
      INSERT INTO user_subscriptions (user_id, discount_percent, active_until)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MONTH))
      ON DUPLICATE KEY UPDATE
        discount_percent = VALUES(discount_percent),
        active_until = VALUES(active_until)
      `,
      [req.user.id, DISCOUNT_PERCENT, MONTHS]
    );

    res.json({ subscribed: true, discount_percent: DISCOUNT_PERCENT });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
