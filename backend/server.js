const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, "data", "events.json");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function loadEvents() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveEvents(events) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2));
}

function normalizeType(type) {
  const t = String(type || "normal").toLowerCase();
  if (["fall", "fall_detected", "falldetected"].includes(t)) return "fall";
  if (["sos", "sos_pressed", "sosbutton", "button"].includes(t)) return "sos";
  return "normal";
}

app.get("/", (req, res) => {
  res.json({
    name: "FallSafe API",
    status: "online",
    endpoints: ["/api/health", "/api/events", "/api/status", "/api/summary", "/api/clear"]
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post("/api/events", (req, res) => {
  const body = req.body || {};
  const now = new Date();

  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceId: body.deviceId || body.device_id || "ESP32-FD-001",
    type: normalizeType(body.type),
    battery: Number.isFinite(Number(body.battery)) ? Number(body.battery) : null,
    gsm: Number.isFinite(Number(body.gsm)) ? Number(body.gsm) : null,
    message: body.message || null,
    timestamp: body.timestamp || now.toISOString()
  };

  const events = loadEvents();
  events.push(event);
  saveEvents(events);

  res.status(201).json({ success: true, event });
});

app.get("/api/events", (req, res) => {
  const events = loadEvents();
  res.json(events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
});

app.get("/api/status", (req, res) => {
  const events = loadEvents().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const latest = events[0] || null;

  if (!latest) {
    return res.json({
      online: false,
      deviceId: "ESP32-FD-001",
      battery: null,
      gsm: null,
      lastUpdate: null
    });
  }

  const lastMs = new Date(latest.timestamp).getTime();
  const online = Date.now() - lastMs < 5 * 60 * 1000;

  res.json({
    online,
    deviceId: latest.deviceId,
    battery: latest.battery,
    gsm: latest.gsm,
    lastUpdate: latest.timestamp,
    latestEvent: latest
  });
});

app.get("/api/summary", (req, res) => {
  const events = loadEvents();
  const counts = {
    total: events.length,
    fall: events.filter(e => e.type === "fall").length,
    sos: events.filter(e => e.type === "sos").length,
    normal: events.filter(e => e.type === "normal").length
  };
  res.json(counts);
});

app.delete("/api/clear", (req, res) => {
  saveEvents([]);
  res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FallSafe backend running on http://localhost:${PORT}`);
});
