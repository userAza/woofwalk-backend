const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const dogsRoutes = require("./routes/dogs");
const bookingsRoutes = require("./routes/bookings");
const authRoutes = require("./routes/auth");
const pool = require("./db");
const walkersRoutes = require("./routes/walkers");
const profilesRoutes = require("./routes/profiles");
const reviewsRoutes = require("./routes/reviews");
const addonsRoutes = require("./routes/addons");
const vetsRoutes = require("./routes/vets");
const subscriptionsRoutes = require("./routes/subscriptions");



dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/dogs", dogsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/walkers", walkersRoutes);
app.use("/api/profiles", profilesRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/addons", addonsRoutes);
app.use("/api/vets", vetsRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);



app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: rows[0].ok });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
