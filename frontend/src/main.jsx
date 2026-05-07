import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const API =
  import.meta.env.VITE_API_URL || "https://website-fall-detection.onrender.com";

function normalizeEvent(event) {
  if (!event) return {};
  const data = event.data || event.raw || event.payload || {};
  return { ...data, ...event };
}

function valueFrom(obj, keys, fallback = "N/A") {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return fallback;
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function App() {
  const [mode, setMode] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(localStorage.getItem("lastEmail") || "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState("24h");
  const [compactMode, setCompactMode] = useState(localStorage.getItem("compactMode") === "true");
  const [showCommand, setShowCommand] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [eventFilter, setEventFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 2600);
  }

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.body.dataset.compact = compactMode ? "true" : "false";
    localStorage.setItem("compactMode", String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommand((open) => !open);
      }

      if (event.key === "Escape") {
        setShowCommand(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function getAuthError(data, fallback) {
    return data?.error || data?.message || fallback;
  }

  async function requestJson(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Server returned an invalid response. Check backend URL or routes.");
    }

    return { res, data };
  }

  function validateAuth() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return "Please enter a valid email address.";
    }

    if (!password || password.length < 6) {
      return "Password must be at least 6 characters.";
    }

    if (mode === "register" && !name.trim()) {
      return "Please enter your name.";
    }

    return "";
  }

  async function authSubmit() {
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const normalizedEmail = email.trim().toLowerCase();
    const validationError = validateAuth();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const body =
        mode === "register"
          ? { name: name.trim(), email: normalizedEmail, password }
          : { email: normalizedEmail, password };

      let { res, data } = await requestJson(endpoint, body);

      // Fallback support for older backend routes, if they exist.
      if (res.status === 404) {
        const fallbackEndpoint = mode === "login" ? "/api/login" : "/api/register";
        ({ res, data } = await requestJson(fallbackEndpoint, body));
      }

      if (!res.ok) {
        setMessage(getAuthError(data, mode === "login" ? "Login failed." : "Registration failed."));
        return;
      }

      if (!data.token) {
        setMessage("Authentication succeeded, but backend did not return a token.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("lastEmail", normalizedEmail);
      setEmail(normalizedEmail);
      setToken(data.token);
      setMessage("");
      showToast(mode === "register" ? "Account created and logged in" : "Login successful");
    } catch (err) {
      setMessage(`❌ ${err.message || "Server connection error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [eventsRes, statusRes, analyticsRes] = await Promise.all([
        fetch(`${API}/api/events`, { headers }),
        fetch(`${API}/api/status`, { headers }),
        fetch(`${API}/api/analytics`, { headers }),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(Array.isArray(data) ? data.map(normalizeEvent) : []);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(normalizeEvent(data?.latestEvent ? { ...data.latestEvent, online: data.online } : data));
      }
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch {
      showToast("Dashboard refresh failed");
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboard();
      const timer = setInterval(loadDashboard, 5000);
      return () => clearInterval(timer);
    }
  }, [token]);

  const latestEvent = events[0] || {};
  const live = status || latestEvent || {};

  const stats = useMemo(() => {
    const total = events.length;
    const falls = events.filter((e) => String(e.type).toLowerCase() === "fall").length;
    const sos = events.filter((e) => String(e.type).toLowerCase() === "sos").length;
    const normal = Math.max(total - falls - sos, 0);

    const avgBattery =
      total > 0
        ? Math.round(events.reduce((sum, e) => sum + Number(e.battery || 0), 0) / total)
        : live?.battery ?? 88;

    const avgGsm =
      total > 0
        ? Math.round(events.reduce((sum, e) => sum + Number(e.gsm || 0), 0) / total)
        : live?.gsm ?? 70;

    const fallRate = total > 0 ? Math.round((falls / total) * 100) : 0;
    const sosRate = total > 0 ? Math.round((sos / total) * 100) : 0;
    const healthScore = Math.round((avgBattery + avgGsm) / 2);

    return {
      total: analytics?.totalEvents ?? total,
      falls: analytics?.falls ?? falls,
      sos: analytics?.sos ?? sos,
      normal,
      avgBattery,
      avgGsm,
      fallRate,
      sosRate,
      healthScore,
      latestType: latestEvent?.type || "No incident",
      lastUpdate:
        latestEvent?.createdAt || latestEvent?.timestamp || latestEvent?.time || "No update yet",
    };
  }, [events, analytics, live]);

  const latitude = toNumber(valueFrom(live, ["latitude", "lat"], null));
  const longitude = toNumber(valueFrom(live, ["longitude", "lng", "lon"], null));
  const hasLocation = latitude !== null && longitude !== null && !(latitude === 0 && longitude === 0);
  const mapUrl = hasLocation ? `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed` : "";
  const externalMapUrl = hasLocation ? `https://maps.google.com/?q=${latitude},${longitude}` : "";
  const ax = valueFrom(live, ["ax", "latestAx"], "N/A");
  const ay = valueFrom(live, ["ay", "latestAy"], "N/A");
  const az = valueFrom(live, ["az", "latestAz"], "N/A");
  const phone = valueFrom(live, ["phone", "emergencyNumber"], "Not configured");
  const deviceIdLive = valueFrom(live, ["deviceId", "device_id"], "ESP32-FD-001");

  const filteredEvents = useMemo(() => {
    let list = [...events];

    if (eventFilter !== "all") {
      list = list.filter((event) => String(event.type).toLowerCase() === eventFilter);
    }

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      list = list.filter((event) =>
        JSON.stringify(event).toLowerCase().includes(query)
      );
    }

    list.sort((a, b) => {
      const aTime = new Date(a.createdAt || a.timestamp || a.time || 0).getTime();
      const bTime = new Date(b.createdAt || b.timestamp || b.time || 0).getTime();
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    });

    return list;
  }, [events, eventFilter, searchText, sortOrder]);

  const riskScore = Math.min(
    100,
    Math.round(
      stats.fallRate * 0.5 +
        stats.sosRate * 0.35 +
        (stats.avgBattery < 20 ? 25 : 0) +
        (stats.avgGsm < 35 ? 20 : 0)
    )
  );

  const riskLabel =
    riskScore >= 70 ? "Critical" : riskScore >= 40 ? "Warning" : "Stable";

  const insight =
    riskScore >= 70
      ? "High risk detected. Check the person and verify device signal immediately."
      : riskScore >= 40
      ? "Moderate risk. Review recent SOS/fall events and battery level."
      : "System is stable. No immediate action is required.";

  const timeline = events.slice(0, 6).map((event) => ({
    title: event.type || "event",
    time: event.createdAt || event.timestamp || event.time || "No time",
    detail: `Battery ${event.battery ?? "N/A"}% · GSM ${event.gsm ?? "N/A"}%`,
  }));

  const batteryValue = live?.battery ?? stats.avgBattery;
  const batteryVoltage = live?.batteryVoltage ?? live?.voltage ?? "N/A";
  const powerStatus = live?.powerStatus || live?.power || "Unknown";

  const batteryState =
    live?.charging === true
      ? "Charging"
      : live?.charging === false
      ? "Not charging"
      : batteryValue >= 95
      ? "Fully charged"
      : batteryValue <= 20
      ? "Low battery"
      : "Battery status unknown";

  const networkType =
    live?.networkType ||
    live?.network ||
    live?.connection ||
    (live?.gsm ? "GSM" : "Wi-Fi / Internet");

  const wifiStatus = live?.wifiStatus || "unknown";
  const gsmStatus = live?.gsmStatus || "unknown";
  const acceleration = live?.acceleration ?? "N/A";
  const accelerationChange =
    live?.movementChange ?? live?.accelerationChange ?? live?.deltaAcceleration ?? "N/A";
  const impactAcceleration =
    live?.impactAcceleration ?? live?.maxImpactAcceleration ?? "N/A";
  const fallState = live?.fallState || live?.detectionState || "normal";
  const temperature = live?.temperature ?? "N/A";
  const firmware = live?.firmware || "v2.2.0";
  const ipAddress = live?.ipAddress || "N/A";
  const alarmActive = live?.alarmActive === true || live?.alarmActive === "true";
  const gyro = live?.gyro ?? live?.gyroscope ?? "N/A";
  const normalizedPower = String(powerStatus).toLowerCase();
  const powerLabel =
    normalizedPower === "no_battery"
      ? "No battery detected"
      : normalizedPower === "charging"
      ? "Charging"
      : normalizedPower === "battery"
      ? "Battery power"
      : normalizedPower === "usb"
      ? "USB power"
      : powerStatus;

  const normalizedNetwork = String(networkType).toLowerCase();
  const networkLabel =
    normalizedNetwork === "offline"
      ? "Offline"
      : normalizedNetwork === "gsm"
      ? "GSM"
      : normalizedNetwork === "wifi"
      ? "Wi-Fi"
      : normalizedNetwork.includes("wi")
      ? "Wi-Fi"
      : networkType;

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    showToast("Logged out");
  }

  function exportCSV() {
    const rows = [
      ["Time", "Device", "Type", "Status", "Fall State", "Acceleration", "Acceleration Change", "Impact Acceleration", "Gyro", "MPU Temperature", "Battery", "Voltage", "Charging", "Power", "Network", "WiFi", "GSM Status", "GSM Signal", "IP Address", "Firmware", "Alarm Active"],
      ...events.map((e) => [
        e.createdAt || e.timestamp || e.time || "",
        e.deviceId || "ESP32-FD-001",
        e.type || "event",
        e.status || "",
        e.fallState || e.detectionState || "",
        e.acceleration ?? "",
        e.movementChange ?? e.accelerationChange ?? e.deltaAcceleration ?? "",
        e.impactAcceleration ?? e.maxImpactAcceleration ?? "",
        e.gyro ?? e.gyroscope ?? "",
        e.temperature ?? "",
        e.battery ?? "",
        e.batteryVoltage ?? e.voltage ?? "",
        e.charging ?? "",
        e.powerStatus || e.power || "",
        e.networkType || e.network || "",
        e.wifiStatus || "",
        e.gsmStatus || "",
        e.gsm ?? "",
        e.ipAddress || "",
        e.firmware || "",
        e.alarmActive ?? "",
      ]),
    ];

    const csv = rows
      .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fallsafe-events.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  }

  async function sendTestEvent(type) {
    if (!token) return;

    try {
      const res = await fetch(`${API}/api/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: "ESP32-FD-001",
          type,
          status: type === "normal" ? "online" : "warning",
          acceleration: Number((9.7 + Math.random() * 0.4).toFixed(2)),
          movementChange: Number((Math.random() * 2.2).toFixed(2)),
          impactAcceleration: type === "fall" ? Number((23 + Math.random() * 6).toFixed(2)) : 0,
          fallState: type === "fall" ? "confirmed_fall" : type === "sos" ? "manual_sos" : "normal",
          gyro: Number((Math.random() * 0.1).toFixed(2)),
          temperature: Number((24 + Math.random() * 8).toFixed(1)),
          battery: Math.floor(Math.random() * 100),
          batteryVoltage: Number((3.0 + Math.random() * 1.2).toFixed(2)),
          charging: Math.random() > 0.5,
          powerStatus: Math.random() > 0.15 ? "charging" : "no_battery",
          networkType: Math.random() > 0.5 ? "wifi" : "offline",
          wifiStatus: Math.random() > 0.5 ? "connected" : "disconnected",
          gsmStatus: "offline",
          gsm: 0,
          ipAddress: "192.168.1.24",
          firmware: "v2.2.0",
          alarmActive: type !== "normal",
        }),
      });

      if (res.ok) {
        showToast(`${type.toUpperCase()} test event sent`);
        loadDashboard();
      } else {
        showToast("Backend rejected test event");
      }
    } catch {
      showToast("Could not send test event");
    }
  }

  if (!token) {
    return (
      <div className="authShell">
        <div className="authModal">
          <div className="authInfo">
            <div className="authLogo">FS</div>
            <h2>Safety monitoring made simple</h2>
            <div className="authAccent"></div>
            <p>
              FallSafe helps users track incidents, device health, connectivity, and emergency alerts in real time.
            </p>

            <div className="authFeatureList">
              <span>✓ Live device status</span>
              <span>✓ Battery and network health</span>
              <span>✓ Incident history and export</span>
            </div>
          </div>

          <div className="authCard">
            <div className="authBrand">FallSafe Cloud</div>
            <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="authSubtitle">
              Monitor safety alerts, device status, battery health, and connectivity from one secure dashboard.
            </p>

            <div className="divider">secure account access</div>

            <div className="authForm">
              {mode === "register" && (
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}

              <input
                type="email"
                placeholder="Email address"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder={mode === "register" ? "Password (minimum 6 characters)" : "Password"}
                value={password}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") authSubmit();
                }}
              />

              <label className="keepSigned">
                <input type="checkbox" defaultChecked />
                Keep me signed in until I sign out
              </label>

              <button onClick={authSubmit} disabled={loading}>
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </div>

            <button
              className="switchAuth"
              onClick={() => {
                setMessage("");
                setPassword("");
                setMode(mode === "login" ? "register" : "login");
              }}
            >
              {mode === "login" ? "Not a member yet? Sign Up." : "Already have an account? Sign In."}
            </button>

            {message && <div className="authError">{message}</div>}
            <div className="authMeta">Secure REST API: {API}</div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    ["dashboard", "⌂"],
    ["location", "🗺"],
    ["device", "📡"],
    ["setup", "🛜"],
    ["analytics", "📊"],
    ["features", "✨"],
    ["settings", "⚙"],
  ];

  function openEspSetup() {
    window.open("http://192.168.4.1", "_blank", "noopener,noreferrer");
    showToast("Opening FallDevice setup page");
  }

  async function copySetupText() {
    const text =
      "ESP32 WiFi Setup\n" +
      "1. Open phone WiFi settings\n" +
      "2. Connect to FallDevice-Setup\n" +
      "3. Password: 12345678\n" +
      "4. Open http://192.168.4.1\n" +
      "5. Choose your WiFi network and save\n" +
      "6. ESP32 connects to internet and starts sending data";

    try {
      await navigator.clipboard.writeText(text);
      showToast("Setup instructions copied");
    } catch {
      showToast("Copy failed");
    }
  }

  return (
    <div className="shell">
      {toast && <div className="toast">{toast}</div>}

      {showCommand && (
        <div className="commandOverlay" onClick={() => setShowCommand(false)}>
          <div className="commandBox" onClick={(event) => event.stopPropagation()}>
            <div className="commandTitle">Command Center</div>
            <button onClick={() => { setActiveTab("dashboard"); setShowCommand(false); }}>Open Dashboard</button>
            <button onClick={() => { setActiveTab("device"); setShowCommand(false); }}>Open Device Statistics</button>
            <button onClick={() => { setActiveTab("setup"); setShowCommand(false); }}>Open WiFi Setup</button>
            <button onClick={() => { setActiveTab("analytics"); setShowCommand(false); }}>Open Analytics</button>
            <button onClick={() => { setActiveTab("features"); setShowCommand(false); }}>Open Product Features</button>
            <button onClick={() => { setTheme(theme === "dark" ? "light" : "dark"); setShowCommand(false); }}>Toggle Theme</button>
            <button onClick={() => { exportCSV(); setShowCommand(false); }}>Export CSV</button>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <div className="brandMark">FS</div>
        <nav>
          {navItems.map(([tab, icon]) => (
            <button
              key={tab}
              className={`nav ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
              title={tab}
            >
              {icon}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main pageFade">
        <div className="topbar">
          <div>
            <p className="eyebrow">ESP32 Fall Detection System</p>
            <h1>FallSafe Dashboard</h1>
          </div>

          <div className="toolbar">
            <span className="userBadge">{email}</span>
            <select value={timeRange} onChange={(event) => setTimeRange(event.target.value)} title="Time range">
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="all">All time</option>
            </select>
            <button
              className="refresh"
              onClick={() => setShowCommand(true)}
              title="Command center Ctrl+K"
            >
              ⌘
            </button>
            <button
              className="refresh"
              onClick={() => setCompactMode(!compactMode)}
              title="Toggle compact mode"
            >
              {compactMode ? "▦" : "▤"}
            </button>
            <button
              className="refresh"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle dark mode"
            >
              {theme === "dark" ? "☀" : "🌙"}
            </button>
            <button className="refresh" onClick={loadDashboard} title="Refresh">
              ↻
            </button>
            <button className="refresh" onClick={logout} title="Logout">
              ⎋
            </button>
          </div>
        </div>

        <div className="apiBanner live">🔒 REST API connected: {API}</div>

        {activeTab === "dashboard" && (
          <>
            <section className="hero">
              <div>
                <span className="pill good pulse">System Online</span>
                <h2>Live fall monitoring and incident tracking</h2>
                <p>
                  FallSafe receives data from the ESP32 device through the REST API,
                  stores records in the database, and displays live device details.
                </p>

                <div className="heroActions">
                  <button onClick={loadDashboard}>Refresh Data</button>
                  <button className="warn" onClick={exportCSV}>
                    Export CSV
                  </button>
                  <button className="danger" onClick={() => sendTestEvent("sos")}>
                    Emergency Mode
                  </button>
                </div>
              </div>

              <div className="deviceCard hoverLift">
                <span className="pill good">Active Device</span>
                <h3>{live?.deviceId || "ESP32-FD-001"}</h3>
                <p>{live?.status || live?.state || "Waiting for data"}</p>

                <div className="miniStats">
                  <span>
                    Battery
                    <b>{batteryValue}%</b>
                    <small>{batteryState}</small>
                  </span>
                  <span>
                    Voltage
                    <b>{batteryVoltage}</b>
                    <small>{powerLabel}</small>
                  </span>
                  <span>
                    Network
                    <b>{networkLabel}</b>
                    <small>WiFi: {wifiStatus}</small>
                  </span>
                  <span>
                    Temperature
                    <b>{temperature}°C</b>
                    <small>MPU6050 sensor</small>
                  </span>
                  <span>
                    Alarm
                    <b>{alarmActive ? "Active" : "Inactive"}</b>
                    <small>Buzzer state</small>
                  </span>
                </div>
              </div>
            </section>

            <MetricGrid stats={stats} />

            <section className="quickGrid">
              <div className={`quickCard ${powerLabel === "No battery detected" ? "gradientDanger" : "gradientOne"} hoverLift`}>
                <span>Battery Intelligence</span>
                <strong>{batteryState}</strong>
                <p>{batteryVoltage}V · {powerLabel}</p>
              </div>
              <div className={`quickCard ${networkLabel === "Offline" ? "gradientDanger" : "gradientTwo"} hoverLift`}>
                <span>Connectivity</span>
                <strong>{networkLabel}</strong>
                <p>WiFi: {wifiStatus} · GSM: {gsmStatus}</p>
              </div>
              <div className="quickCard gradientThree hoverLift">
                <span>Motion Sensor</span>
                <strong>{acceleration}</strong>
                <p>Gyro: {gyro} · Change: {accelerationChange}</p>
              </div>
            </section>

            <section className="contentGrid">
              <IncidentLogs
                events={filteredEvents}
                totalEvents={events.length}
                eventFilter={eventFilter}
                setEventFilter={setEventFilter}
                searchText={searchText}
                setSearchText={setSearchText}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
              />
              <PriorityPanel
                stats={stats}
                status={live}
                acceleration={acceleration}
                gyro={gyro}
                temperature={temperature}
                accelerationChange={accelerationChange}
                impactAcceleration={impactAcceleration}
                fallState={fallState}
                powerLabel={powerLabel}
                networkLabel={networkLabel}
                firmware={firmware}
                ipAddress={ipAddress}
                alarmActive={alarmActive}
              />
            </section>
          </>
        )}


        {activeTab === "location" && (
          <>
            <section className="panel locationHero">
              <div className="panelHead">
                <h3>Live Location</h3>
                <span>{hasLocation ? "Location available" : "Waiting for location"}</span>
              </div>

              {hasLocation ? (
                <>
                  <div className="mapFrame">
                    <iframe title="FallSafe Location Map" src={mapUrl} loading="lazy"></iframe>
                  </div>

                  <div className="heroActions">
                    <a className="buttonLink" href={externalMapUrl} target="_blank" rel="noreferrer">
                      Open in Google Maps
                    </a>
                    <button className="warn" onClick={loadDashboard}>Refresh Location</button>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <strong>No location yet</strong>
                  <span>The ESP32 sends latitude and longitude after WiFi location update.</span>
                </div>
              )}
            </section>

            <section className="metricGrid">
              <div className="metric hoverLift"><div><span>Latitude</span><strong>{latitude ?? "N/A"}</strong><p>WiFi/IP location</p></div><i>↕</i></div>
              <div className="metric hoverLift"><div><span>Longitude</span><strong>{longitude ?? "N/A"}</strong><p>WiFi/IP location</p></div><i>↔</i></div>
              <div className="metric hoverLift"><div><span>Emergency Phone</span><strong>{phone}</strong><p>Configured contact</p></div><i>☎</i></div>
              <div className="metric good hoverLift"><div><span>Device</span><strong>{deviceIdLive}</strong><p>Tracking source</p></div><i>✓</i></div>
            </section>
          </>
        )}

        {activeTab === "device" && (
          <>
            <section className="panel">
              <div className="panelHead">
                <h3>Device Statistics</h3>
                <span>ESP32 performance overview</span>
              </div>

              <div className="miniStats deviceStats">
                <span>Health Score <b>{stats.healthScore}%</b></span>
                <span>Average Battery <b>{stats.avgBattery}%</b></span>
                <span>Battery State <b>{batteryState}</b></span>
                <span>Voltage <b>{batteryVoltage}</b></span>
                <span>Power Source <b>{powerLabel}</b></span>
                <span>Network Type <b>{networkLabel}</b></span>
                <span>WiFi Status <b>{wifiStatus}</b></span>
                <span>GSM Status <b>{gsmStatus}</b></span>
                <span>Signal <b>{live?.gsm ?? stats.avgGsm}%</b></span>
                <span>Acceleration <b>{acceleration}</b></span>
                <span>AX <b>{ax}</b></span>
                <span>AY <b>{ay}</b></span>
                <span>AZ <b>{az}</b></span>
                <span>Emergency Phone <b>{phone}</b></span>
                <span>Latitude <b>{latitude ?? "N/A"}</b></span>
                <span>Longitude <b>{longitude ?? "N/A"}</b></span>
                <span>Acceleration Change <b>{accelerationChange}</b></span>
                <span>Impact Acceleration <b>{impactAcceleration}</b></span>
                <span>Gyroscope <b>{gyro}</b></span>
                <span>MPU Temperature <b>{temperature}°C</b></span>
                <span>Fall State <b>{fallState}</b></span>
                <span>Alarm Active <b>{alarmActive ? "Yes" : "No"}</b></span>
                <span>IP Address <b>{ipAddress}</b></span>
                <span>Firmware <b>{firmware}</b></span>
                <span>Latest Incident <b>{stats.latestType}</b></span>
                <span>Last Update <b>{stats.lastUpdate}</b></span>
              </div>
            </section>

            <section className="panel">
              <div className="panelHead">
                <h3>Device Actions</h3>
                <span>Device simulation tools</span>
              </div>

              <div className="heroActions">
                <button onClick={() => sendTestEvent("normal")}>Send Normal Test</button>
                <button className="warn" onClick={() => sendTestEvent("sos")}>
                  Send SOS Test
                </button>
                <button className="danger" onClick={() => sendTestEvent("fall")}>
                  Send Fall Test
                </button>
              </div>
            </section>
          </>
        )}

        {activeTab === "setup" && (
          <>
            <section className="panel setupHero">
              <div>
                <p className="eyebrow">Device provisioning</p>
                <h3>Setup Device WiFi</h3>
                <p className="soft">
                  The dashboard guides the user to connect to the ESP32 setup hotspot.
                  The actual WiFi credentials are entered into the ESP32 local setup portal.
                </p>

                <div className="heroActions">
                  <button onClick={openEspSetup}>Open ESP32 Setup Page</button>
                  <button className="warn" onClick={copySetupText}>Copy Instructions</button>
                </div>
              </div>
            </section>

            <section className="setupFlow">
              <div className="setupStep hoverLift">
                <b>1</b>
                <h4>Open WiFi settings</h4>
                <p>Use your phone or laptop and open available WiFi networks.</p>
              </div>

              <div className="setupStep hoverLift">
                <b>2</b>
                <h4>Connect to ESP32 hotspot</h4>
                <p>Choose <strong>FallDevice-Setup</strong>.</p>
              </div>

              <div className="setupStep hoverLift">
                <b>3</b>
                <h4>Enter password</h4>
                <p>Password: <strong>12345678</strong></p>
              </div>

              <div className="setupStep hoverLift">
                <b>4</b>
                <h4>Open setup portal</h4>
                <p>Open <strong>http://192.168.4.1</strong> in your browser.</p>
              </div>

              <div className="setupStep hoverLift">
                <b>5</b>
                <h4>Save WiFi credentials</h4>
                <p>Select your router WiFi, enter password, and save.</p>
              </div>

              <div className="setupStep hoverLift">
                <b>6</b>
                <h4>Cloud connection</h4>
                <p>ESP32 connects to internet and starts sending data to FallSafe.</p>
              </div>
            </section>

            <section className="panel">
              <div className="panelHead">
                <h3>How Device Setup Works</h3>
                <span>User setup explanation</span>
              </div>

              <blockquote className="productQuote">
                “The web dashboard guides the user to connect to the ESP32 provisioning hotspot.
                The actual WiFi credentials are entered into the ESP32 local configuration portal,
                after which the device stores the credentials and begins cloud communication.”
              </blockquote>

              <div className="deviceRow">Hotspot SSID <span>FallDevice-Setup</span></div>
              <div className="deviceRow">Default Password <span>12345678</span></div>
              <div className="deviceRow">Local Setup Portal <span>http://192.168.4.1</span></div>
              <div className="deviceRow">Cloud API <span>{API}</span></div>
            </section>
          </>
        )}

        {activeTab === "analytics" && (
          <>
            <MetricGrid stats={stats} />

            <section className="chartGrid">
              <div className="panel chart">
                <h3>Incident Distribution</h3>
                <Bar label="Falls" value={stats.fallRate} danger />
                <Bar label="SOS" value={stats.sosRate} warn />
                <Bar
                  label="Normal"
                  value={stats.total ? Math.round((stats.normal / stats.total) * 100) : 0}
                />
              </div>

              <div className="panel chart">
                <h3>Device Health</h3>
                <Ring value={stats.healthScore} />
                <p className="soft">Calculated from average battery and GSM signal.</p>
              </div>
            </section>
          </>
        )}

        {activeTab === "features" && (
          <>
            <section className="panel featureHero">
              <p className="eyebrow">Product capabilities</p>
              <h3>Everything users need for reliable monitoring</h3>
              <p className="soft">
                FallSafe combines device telemetry, emergency alerts, battery health, and connectivity status
                in one clean, easy-to-use dashboard.
              </p>
            </section>

            <section className="featureGrid">
              <div className="featureCard hoverLift">
                <b>01</b>
                <h4>Real-time monitoring</h4>
                <p>Automatically refreshes device data, incident logs, and alert status every few seconds.</p>
              </div>
              <div className="featureCard hoverLift">
                <b>02</b>
                <h4>Smart risk status</h4>
                <p>Combines fall rate, SOS activity, battery health, and signal strength into a simple risk score.</p>
              </div>
              <div className="featureCard hoverLift">
                <b>03</b>
                <h4>Battery intelligence</h4>
                <p>Shows charging, not charging, full battery, low battery, voltage, and power source states.</p>
              </div>
              <div className="featureCard hoverLift">
                <b>04</b>
                <h4>Connectivity awareness</h4>
                <p>Displays whether the device is using GSM, Wi-Fi/Internet, or is currently offline.</p>
              </div>
              <div className="featureCard hoverLift">
                <b>05</b>
                <h4>Incident history</h4>
                <p>Search, filter, sort, and export records for review or documentation.</p>
              </div>
              <div className="featureCard hoverLift">
                <b>06</b>
                <h4>Mobile friendly</h4>
                <p>Optimized layout for phones, tablets, and desktop screens.</p>
              </div>
            </section>
          </>
        )}

        {activeTab === "settings" && (
          <section className="panel">
            <h3>System Settings</h3>
            <p className="soft">Configure dashboard preferences, device setup, and monitoring behavior.</p>
            <div className="deviceRow">API Endpoint <span>{API}</span></div>
            <div className="deviceRow">Refresh Interval <span>5 seconds</span></div>
            <div className="deviceRow">Authentication <span>JWT enabled</span></div>
            <div className="deviceRow">Database Storage <span>Enabled</span></div>
            <div className="deviceRow">Theme Mode <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span></div>
            <div className="deviceRow">Compact Mode <span>{compactMode ? "Enabled" : "Disabled"}</span></div>
            <div className="deviceRow">Selected Time Range <span>{timeRange}</span></div>
            <div className="deviceRow">Command Shortcut <span>Ctrl + K</span></div>
            <div className="deviceRow">Network Detection <span>{networkLabel}</span></div>
            <div className="deviceRow">Battery State <span>{batteryState}</span></div>
            <div className="deviceRow">Power Source <span>{powerLabel}</span></div>
            <div className="deviceRow">Gyroscope <span>{gyro}</span></div>
            <div className="deviceRow">Acceleration Change <span>{accelerationChange}</span></div>
            <div className="deviceRow">Impact Acceleration <span>{impactAcceleration}</span></div>
            <div className="deviceRow">Fall State <span>{fallState}</span></div>
            <div className="deviceRow">MPU Temperature <span>{temperature}°C</span></div>
            <div className="deviceRow">IP Address <span>{ipAddress}</span></div>
            <div className="deviceRow">Firmware <span>{firmware}</span></div>
            <div className="deviceRow">Alarm Active <span>{alarmActive ? "Yes" : "No"}</span></div>
          </section>
        )}
      </main>
    </div>
  );
}

function MetricGrid({ stats }) {
  return (
    <section className="metricGrid">
      <div className="metric hoverLift">
        <div><span>Total Records</span><strong>{stats.total}</strong><p>Stored incidents</p></div>
        <i>📁</i>
      </div>
      <div className="metric danger hoverLift">
        <div><span>Falls</span><strong>{stats.falls}</strong><p>Detected fall events</p></div>
        <i>⚠</i>
      </div>
      <div className="metric warn hoverLift">
        <div><span>SOS</span><strong>{stats.sos}</strong><p>Emergency alerts</p></div>
        <i>🚨</i>
      </div>
      <div className="metric good hoverLift">
        <div><span>Health</span><strong>{stats.healthScore}%</strong><p>Device health score</p></div>
        <i>✓</i>
      </div>
    </section>
  );
}

function IncidentLogs({
  events,
  totalEvents,
  eventFilter,
  setEventFilter,
  searchText,
  setSearchText,
  sortOrder,
  setSortOrder,
}) {
  return (
    <div className="panel">
      <div className="panelHead">
        <h3>Incident Logs</h3>
        <span>{events.length} shown / {totalEvents} total</span>
      </div>

      <div className="filtersBar">
        <input
          placeholder="Search logs..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />

        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
          <option value="all">All events</option>
          <option value="normal">Normal</option>
          <option value="fall">Falls</option>
          <option value="sos">SOS</option>
        </select>

        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {events.length === 0 ? (
        <div className="empty">
          <strong>No matching records</strong>
          <span>Try another filter or wait for ESP32 data.</span>
        </div>
      ) : (
        events.map((event, index) => (
          <div className={`log ${event.type || ""} hoverLift`} key={event.id || index}>
            <div className="logIcon">
              {event.type === "fall" ? "⚠" : event.type === "sos" ? "🚨" : "✓"}
            </div>
            <div>
              <strong>{event.type || "event"}</strong>
              <p>
                Device: {event.deviceId || "ESP32-FD-001"} · Battery: {event.battery ?? "N/A"}% ·
                Status: {event.status || "N/A"} · Acc: {event.acceleration ?? "N/A"} ·
                Change: {event.movementChange ?? event.accelerationChange ?? event.deltaAcceleration ?? "N/A"} ·
                Gyro: {event.gyro ?? event.gyroscope ?? "N/A"} · Loc: {event.latitude ?? "N/A"}, {event.longitude ?? "N/A"}
              </p>
            </div>
            <time>{event.createdAt || event.timestamp || event.time || "No time"}</time>
          </div>
        ))
      )}
    </div>
  );
}

function PriorityPanel({
  stats,
  status,
  acceleration,
  gyro,
  temperature,
  accelerationChange,
  impactAcceleration,
  fallState,
  powerLabel,
  networkLabel,
  firmware,
  ipAddress,
  alarmActive,
}) {
  return (
    <div className="panel">
      <h3>Priority Alert</h3>
      <div className={`priority ${stats.falls > 0 ? "fall" : stats.sos > 0 ? "sos" : ""}`}>
        <h4>{stats.falls > 0 ? "Fall Detected" : stats.sos > 0 ? "SOS Active" : "All Clear"}</h4>
        <p>The system is connected and waiting for live data from your ESP32.</p>
      </div>

      <h3 style={{ marginTop: 22 }}>Device Info</h3>
      <div className="deviceRow">ESP32-FD-001 <span>{status?.status || "Online"}</span></div>
      <div className="deviceRow">Acceleration <span>{acceleration}</span></div>
      <div className="deviceRow">Acceleration Change <span>{accelerationChange}</span></div>
      <div className="deviceRow">Impact Acceleration <span>{impactAcceleration}</span></div>
      <div className="deviceRow">Fall State <span>{fallState}</span></div>
      <div className="deviceRow">Gyroscope <span>{gyro}</span></div>
      <div className="deviceRow">Power <span>{powerLabel}</span></div>
      <div className="deviceRow">Network <span>{networkLabel}</span></div>
      <div className="deviceRow">Temperature <span>{temperature}°C</span></div>
      <div className="deviceRow">Firmware <span>{firmware}</span></div>
      <div className="deviceRow">IP Address <span>{ipAddress}</span></div>
      <div className="deviceRow">Alarm <span>{alarmActive ? "Active" : "Inactive"}</span></div>
    </div>
  );
}

function Bar({ label, value, danger, warn }) {
  return (
    <div className="barRow">
      <div><b>{label}</b><span>{value}%</span></div>
      <div className="barTrack">
        <div className={`barFill ${danger ? "danger" : warn ? "warn" : ""}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Ring({ value }) {
  return (
    <div className="ring" style={{ "--value": `${value}%` }}>
      <strong>{value}%</strong>
      <span>Health</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
