const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;

const JWT_SECRET =
  process.env.JWT_SECRET || "change-this-secret-before-deployment";

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@fallsafe.local";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "admin12345";

const DEVICE_API_KEY =
  process.env.DEVICE_API_KEY || "";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

const memory = {
  users: [],
  events: [],
};

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "2mb" }));

function normalizeType(type) {
  const t = String(type || "normal").toLowerCase();

  if (["fall", "fall_detected"].includes(t)) return "fall";
  if (["sos", "button"].includes(t)) return "sos";
  if (["location"].includes(t)) return "location";

  return "normal";
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function signToken(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, {
    expiresIn: "7d",
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Login required",
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
}

function checkDeviceKey(req, res, next) {
  if (!DEVICE_API_KEY) return next();

  const key =
    req.headers["x-device-key"] || req.query.deviceKey;

  if (key !== DEVICE_API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Invalid device key",
    });
  }

  next();
}

async function query(sql, params = []) {
  if (!pool) throw new Error("DATABASE_URL missing");
  return pool.query(sql, params);
}

async function initDb() {
  if (!pool) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    memory.users.push({
      id: 1,
      name: "Administrator",
      email: ADMIN_EMAIL.toLowerCase(),
      password_hash: hash,
      created_at: new Date().toISOString(),
    });

    console.log("Using memory database");
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL,
      battery INTEGER,
      gsm INTEGER,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      phone TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existing = await query(
    "SELECT id FROM users WHERE email=$1",
    [ADMIN_EMAIL.toLowerCase()]
  );

  if (!existing.rowCount) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await query(
      "INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3)",
      ["Administrator", ADMIN_EMAIL.toLowerCase(), hash]
    );
  }
}

async function findUserByEmail(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();

  if (!pool) {
    return (
      memory.users.find((u) => u.email === normalized) ||
      null
    );
  }

  const result = await query(
    "SELECT * FROM users WHERE email=$1",
    [normalized]
  );

  return result.rows[0] || null;
}

async function createUser(name, email, password) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();

  const hash = await bcrypt.hash(password, 10);

  if (!pool) {
    if (
      memory.users.some((u) => u.email === normalized)
    ) {
      throw new Error("Email already exists");
    }

    const user = {
      id: memory.users.length + 1,
      name,
      email: normalized,
      password_hash: hash,
      created_at: new Date().toISOString(),
    };

    memory.users.push(user);

    return user;
  }

  const result = await query(
    `
    INSERT INTO users (name,email,password_hash)
    VALUES ($1,$2,$3)
    RETURNING *
  `,
    [name, normalized, hash]
  );

  return result.rows[0];
}

function mapEvent(row) {
  const data = row.data || {};

  return {
    ...data,
    id: row.id,
    deviceId: row.device_id,
    type: row.type,
    battery: row.battery,
    gsm: row.gsm,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function insertEvent(body) {
  const now = new Date();

  const event = {
    id:
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),

    deviceId:
      body.deviceId ||
      body.device_id ||
      "ESP32-FD-001",

    type: normalizeType(body.type),

    battery: numberOrNull(body.battery),

    gsm: numberOrNull(body.gsm),

    latitude: numberOrNull(
      body.latitude || body.lat
    ),

    longitude: numberOrNull(
      body.longitude || body.lon
    ),

    phone: body.phone || null,

    data: body,

    createdAt: now.toISOString(),
  };

  if (!pool) {
    memory.events.push(event);
    return event;
  }

  const result = await query(
    `
    INSERT INTO events
    (
      id,
      device_id,
      type,
      battery,
      gsm,
      latitude,
      longitude,
      phone,
      data
    )
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `,
    [
      event.id,
      event.deviceId,
      event.type,
      event.battery,
      event.gsm,
      event.latitude,
      event.longitude,
      event.phone,
      event.data,
    ]
  );

  return mapEvent(result.rows[0]);
}

async function getEvents() {
  if (!pool) {
    return memory.events.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );
  }

  const result = await query(`
    SELECT *
    FROM events
    ORDER BY created_at DESC
  `);

  return result.rows.map(mapEvent);
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    api: "FallSafe Backend",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: pool ? "postgresql" : "memory",
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name = "User",
      email,
      password,
    } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Missing fields",
      });
    }

    const existing = await findUserByEmail(email);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }

    const user = await createUser(
      name,
      email,
      password
    );

    return res.status(201).json({
      success: true,
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const user = await findUserByEmail(email);

    if (
      !user ||
      !(await bcrypt.compare(
        String(password),
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    return res.json({
      success: true,
      token: signToken(user),
      user: publicUser(user),
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

app.post(
  "/api/events",
  checkDeviceKey,
  async (req, res) => {
    try {
      const saved = await insertEvent(req.body || {});

      return res.status(201).json({
        success: true,
        event: saved,
      });
    } catch (err) {
      console.error(err);

      return res.status(500).json({
        success: false,
        error: "Failed to save event",
      });
    }
  }
);

app.get(
  "/api/events",
  requireAuth,
  async (req, res) => {
    res.json(await getEvents());
  }
);

app.get(
  "/api/status",
  requireAuth,
  async (req, res) => {
    const events = await getEvents();

    const latest = events[0];

    if (!latest) {
      return res.json({
        online: false,
      });
    }

    return res.json({
      online: true,
      latestEvent: latest,
    });
  }
);

app.get(
  "/api/analytics",
  requireAuth,
  async (req, res) => {
    const events = await getEvents();

    const falls = events.filter(
      (e) => e.type === "fall"
    ).length;

    const sos = events.filter(
      (e) => e.type === "sos"
    ).length;

    const locations = events.filter(
      (e) => e.type === "location"
    ).length;

    res.json({
      totalEvents: events.length,
      falls,
      sos,
      location: locations,
    });
  }
);

app.get(
  "/api/devices",
  requireAuth,
  async (req, res) => {
    const events = await getEvents();

    const devices = {};

    events.forEach((e) => {
      devices[e.deviceId] = {
        deviceId: e.deviceId,
        battery: e.battery,
        gsm: e.gsm,
        latitude: e.latitude,
        longitude: e.longitude,
        phone: e.phone,
        lastUpdate: e.createdAt,
        online: true,
      };
    });

    res.json(Object.values(devices));
  }
);

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Server running on port ${PORT}`
      );
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });