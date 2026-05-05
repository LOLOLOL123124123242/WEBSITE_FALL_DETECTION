const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-before-deployment";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@fallsafe.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin12345";
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || "";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  : null;

const memory = { users: [], events: [] };

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function normalizeType(type) {
  const t = String(type || "normal").toLowerCase();
  if (["fall", "fall_detected", "falldetected"].includes(t)) return "fall";
  if (["sos", "sos_pressed", "sosbutton", "button"].includes(t)) return "sos";
  return "normal";
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function signToken(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: "Login required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid or expired login" });
  }
}

function checkDeviceKey(req, res, next) {
  if (!DEVICE_API_KEY) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); return next(); } catch {}
  }
  const key = req.headers["x-device-key"] || req.query.deviceKey;
  if (key !== DEVICE_API_KEY) return res.status(401).json({ success: false, error: "Invalid device key" });
  next();
}

async function query(sql, params = []) {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const result = await pool.query(sql, params);
  return result;
}

async function initDb() {
  if (!pool) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    memory.users.push({ id: 1, name: "Administrator", email: ADMIN_EMAIL.toLowerCase(), password_hash: hash, created_at: new Date().toISOString() });
    console.log("DATABASE_URL not configured. Using temporary in-memory storage for local testing.");
    return;
  }

  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('normal','sos','fall')),
    battery INTEGER,
    gsm INTEGER,
    location TEXT,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await query("CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC)");
  await query("CREATE INDEX IF NOT EXISTS idx_events_device_id ON events(device_id)");

  const existing = await query("SELECT id FROM users WHERE email=$1", [ADMIN_EMAIL.toLowerCase()]);
  if (!existing.rowCount) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await query("INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3)", ["Administrator", ADMIN_EMAIL.toLowerCase(), hash]);
  }
}

async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!pool) return memory.users.find((u) => u.email === normalized) || null;
  const result = await query("SELECT * FROM users WHERE email=$1", [normalized]);
  return result.rows[0] || null;
}

async function createUser(name, email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  const hash = await bcrypt.hash(password, 10);
  if (!pool) {
    if (memory.users.some((u) => u.email === normalized)) throw new Error("Email already exists");
    const user = { id: memory.users.length + 1, name, email: normalized, password_hash: hash, created_at: new Date().toISOString() };
    memory.users.push(user);
    return user;
  }
  const result = await query("INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) RETURNING *", [name, normalized, hash]);
  return result.rows[0];
}

function mapEvent(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.type,
    battery: row.battery,
    gsm: row.gsm,
    location: row.location,
    message: row.message,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function insertEvent(event) {
  if (!pool) {
    memory.events.push(event);
    return event;
  }
  const result = await query(
    `INSERT INTO events (id,device_id,type,battery,gsm,location,message,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [event.id, event.deviceId, event.type, event.battery, event.gsm, event.location, event.message, event.timestamp]
  );
  return mapEvent(result.rows[0]);
}

async function getEvents(filters = {}) {
  if (!pool) {
    let events = [...memory.events];
    if (filters.deviceId && filters.deviceId !== "all") events = events.filter((e) => e.deviceId === filters.deviceId);
    if (filters.type && filters.type !== "all") events = events.filter((e) => e.type === filters.type);
    if (filters.from) events = events.filter((e) => new Date(e.timestamp) >= new Date(filters.from));
    if (filters.to) events = events.filter((e) => new Date(e.timestamp) <= new Date(filters.to));
    return events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  const where = [];
  const params = [];
  if (filters.deviceId && filters.deviceId !== "all") { params.push(filters.deviceId); where.push(`device_id=$${params.length}`); }
  if (filters.type && filters.type !== "all") { params.push(filters.type); where.push(`type=$${params.length}`); }
  if (filters.from) { params.push(filters.from); where.push(`created_at >= $${params.length}`); }
  if (filters.to) { params.push(filters.to); where.push(`created_at <= $${params.length}`); }
  const sql = `SELECT * FROM events ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const result = await query(sql, params);
  return result.rows.map(mapEvent);
}

function alertText(e) {
  const title = e.type === "fall" ? "🚨 FALL DETECTED" : e.type === "sos" ? "🆘 SOS BUTTON PRESSED" : "✅ NORMAL UPDATE";
  return `${title}\nDevice: ${e.deviceId}\nBattery: ${e.battery ?? "N/A"}%\nGSM: ${e.gsm ?? "N/A"}%\nTime: ${e.timestamp}`;
}

async function sendTelegram(e) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat_id = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat_id) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text: alertText(e) }) });
}
async function sendEmail(e) {
  const url = process.env.EMAIL_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ email: process.env.ALERT_EMAIL || "", subject: `FallSafe Alert: ${e.type.toUpperCase()}`, message: alertText(e), event: e }) });
}
async function alerts(e) {
  if (!["fall", "sos"].includes(e.type)) return;
  try { await sendTelegram(e); } catch (err) { console.log("Telegram alert failed", err.message); }
  try { await sendEmail(e); } catch (err) { console.log("Email alert failed", err.message); }
}

app.get("/", (req, res) => res.json({ name: "FallSafe API", status: "online", database: pool ? "postgresql" : "memory", auth: "jwt", endpoints: ["/api/health", "/api/auth/login", "/api/events", "/api/status", "/api/summary", "/api/analytics", "/api/devices"] }));
app.get("/api/health", (req, res) => res.json({ ok: true, database: pool ? "postgresql" : "memory", time: new Date().toISOString() }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name = "User", email, password } = req.body || {};
    if (!email || !password || password.length < 6) return res.status(400).json({ success: false, error: "Email and password with at least 6 characters are required" });
    const user = await createUser(name, email, password);
    res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.code === "23505" ? "Email already exists" : err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) return res.status(401).json({ success: false, error: "Invalid email or password" });
  res.json({ success: true, token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.post("/api/events", checkDeviceKey, async (req, res) => {
  const b = req.body || {}, now = new Date();
  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceId: b.deviceId || b.device_id || "ESP32-FD-001",
    type: normalizeType(b.type),
    battery: Number.isFinite(Number(b.battery)) ? Number(b.battery) : null,
    gsm: Number.isFinite(Number(b.gsm)) ? Number(b.gsm) : null,
    location: b.location || null,
    message: b.message || null,
    timestamp: b.timestamp || now.toISOString(),
  };
  const saved = await insertEvent(event);
  alerts(saved);
  res.status(201).json({ success: true, event: saved });
});

app.get("/api/events", requireAuth, async (req, res) => res.json(await getEvents(req.query)));

app.get("/api/devices", requireAuth, async (req, res) => {
  const map = new Map();
  for (const e of await getEvents({})) {
    const p = map.get(e.deviceId);
    if (!p || new Date(e.timestamp) > new Date(p.lastUpdate)) map.set(e.deviceId, { deviceId: e.deviceId, battery: e.battery, gsm: e.gsm, lastUpdate: e.timestamp, online: Date.now() - new Date(e.timestamp).getTime() < 5 * 60 * 1000 });
  }
  res.json([...map.values()].sort((a, b) => a.deviceId.localeCompare(b.deviceId)));
});

app.get("/api/status", requireAuth, async (req, res) => {
  const events = await getEvents(req.query);
  const latest = events[0];
  if (!latest) return res.json({ online: false, deviceId: req.query.deviceId && req.query.deviceId !== "all" ? req.query.deviceId : "ESP32-FD-001", battery: null, gsm: null, lastUpdate: null });
  res.json({ online: Date.now() - new Date(latest.timestamp).getTime() < 5 * 60 * 1000, deviceId: latest.deviceId, battery: latest.battery, gsm: latest.gsm, lastUpdate: latest.timestamp, latestEvent: latest });
});

app.get("/api/summary", requireAuth, async (req, res) => {
  const events = await getEvents(req.query);
  res.json({ total: events.length, fall: events.filter((e) => e.type === "fall").length, sos: events.filter((e) => e.type === "sos").length, normal: events.filter((e) => e.type === "normal").length, devices: new Set(events.map((e) => e.deviceId)).size });
});

app.get("/api/analytics", requireAuth, async (req, res) => {
  const events = (await getEvents(req.query)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const batteryHistory = events.filter((e) => e.battery !== null).slice(-30).map((e) => ({ time: e.timestamp, value: e.battery, deviceId: e.deviceId }));
  const gsmHistory = events.filter((e) => e.gsm !== null).slice(-30).map((e) => ({ time: e.timestamp, value: e.gsm, deviceId: e.deviceId }));
  const eventCounts = { normal: events.filter((e) => e.type === "normal").length, sos: events.filter((e) => e.type === "sos").length, fall: events.filter((e) => e.type === "fall").length };
  const byDay = {};
  for (const e of events) {
    const day = e.timestamp.slice(0, 10);
    byDay[day] = byDay[day] || { date: day, normal: 0, sos: 0, fall: 0, total: 0 };
    byDay[day][e.type]++;
    byDay[day].total++;
  }
  res.json({ batteryHistory, gsmHistory, eventCounts, dailyEvents: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)) });
});

app.delete("/api/clear", requireAuth, async (req, res) => {
  if (!pool) memory.events = [];
  else await query("DELETE FROM events");
  res.json({ success: true });
});

initDb()
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`FallSafe backend running on http://localhost:${PORT}`)))
  .catch((err) => { console.error("Failed to initialize database", err); process.exit(1); });
