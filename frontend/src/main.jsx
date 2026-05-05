import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const API =
  import.meta.env.VITE_API_URL || "https://website-fall-detection.onrender.com";

function App() {
  const [mode, setMode] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [email, setEmail] = useState("admin@fallsafe.local");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
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

  async function authSubmit() {
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || `${mode} failed`);
        return;
      }

      if (mode === "register") {
        setMessage("✅ Account created. Now log in.");
        setMode("login");
        return;
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
      showToast("Login successful");
    } catch {
      setMessage("❌ Server connection error");
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

      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
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
  const gyro = live?.gyro ?? live?.gyroscope ?? "N/A";

  const normalizedPower = String(powerStatus).toLowerCase();
  const powerLabel =
    normalizedPower === "no_battery"
      ? "No battery detected"
      : normalizedPower === "charging"
      ? "Charging"
      : normalizedPower === "battery"
      ? "Battery power"
      : powerStatus;

  const normalizedNetwork = String(networkType).toLowerCase();
  const networkLabel =
    normalizedNetwork === "offline"
      ? "Offline"
      : normalizedNetwork === "gsm"
      ? "GSM"
      : normalizedNetwork.includes("wi")
      ? "Wi-Fi / Internet"
      : networkType;

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    showToast("Logged out");
  }

  function exportCSV() {
    const rows = [
      ["Time", "Device", "Type", "Acceleration", "Battery", "Voltage", "Charging", "Power", "Network", "WiFi", "GSM", "Signal", "Gyro"],
      ...events.map((e) => [
        e.createdAt || e.timestamp || e.time || "",
        e.deviceId || "ESP32-FD-001",
        e.type || "event",
        e.acceleration ?? "",
        e.battery ?? "",
        e.batteryVoltage ?? e.voltage ?? "",
        e.charging ?? "",
        e.powerStatus || e.power || "",
        e.networkType || e.network || "",
        e.wifiStatus || "",
        e.gsmStatus || "",
        e.gsm ?? "",
        e.gyro ?? e.gyroscope ?? "",
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
          acceleration: Number((9.7 + Math.random() * 0.4).toFixed(2)),
          gyro: Number((Math.random() * 0.1).toFixed(2)),
          battery: Math.floor(Math.random() * 100),
          batteryVoltage: Number((3.0 + Math.random() * 1.2).toFixed(2)),
          charging: Math.random() > 0.5,
          powerStatus: Math.random() > 0.15 ? "charging" : "no_battery",
          networkType: Math.random() > 0.5 ? "GSM" : "offline",
          wifiStatus: Math.random() > 0.5 ? "connected" : "disconnected",
          gsmStatus: Math.random() > 0.5 ? "good" : "weak",
          gsm: Math.floor(10 + Math.random() * 90),
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
            <h2>Welcome Back to FallSafe</h2>
            <div className="authAccent"></div>
            <p>
              Sign in to continue to your ESP32 fall detection dashboard, live status,
              incident records, and analytics.
            </p>
          </div>

          <div className="authCard">
            <div className="authBrand">FallSafe Secure Access</div>
            <h1>{mode === "login" ? "Sign In" : "Create Account"}</h1>

            <div className="divider">secure account access</div>

            <div className="authForm">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <label className="keepSigned">
                <input type="checkbox" />
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
                setMode(mode === "login" ? "register" : "login");
              }}
            >
              {mode === "login" ? "Not a member yet? Sign Up." : "Already have an account? Sign In."}
            </button>

            {message && <div className="authError">{message}</div>}
            <div className="authMeta">REST API: {API}</div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    ["dashboard", "⌂"],
    ["device", "📡"],
    ["analytics", "📊"],
    ["settings", "⚙"],
  ];

  return (
    <div className="shell">
      {toast && <div className="toast">{toast}</div>}

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
                    GSM
                    <b>{live?.gsm ?? stats.avgGsm}%</b>
                    <small>{gsmStatus}</small>
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
                <p>Acceleration value from ESP32 payload</p>
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
              <PriorityPanel stats={stats} status={live} acceleration={acceleration} gyro={gyro} powerLabel={powerLabel} networkLabel={networkLabel} />
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
                <span>Gyroscope <b>{gyro}</b></span>
                <span>Latest Incident <b>{stats.latestType}</b></span>
                <span>Last Update <b>{stats.lastUpdate}</b></span>
              </div>
            </section>

            <section className="panel">
              <div className="panelHead">
                <h3>Device Actions</h3>
                <span>Test thesis demonstration functions</span>
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

        {activeTab === "settings" && (
          <section className="panel">
            <h3>System Settings</h3>
            <p className="soft">These controls are visual thesis/demo panels.</p>
            <div className="deviceRow">API Endpoint <span>{API}</span></div>
            <div className="deviceRow">Refresh Interval <span>5 seconds</span></div>
            <div className="deviceRow">Authentication <span>JWT enabled</span></div>
            <div className="deviceRow">Database Storage <span>Enabled</span></div>
            <div className="deviceRow">Theme Mode <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span></div>
            <div className="deviceRow">Network Detection <span>{networkLabel}</span></div>
            <div className="deviceRow">Battery State <span>{batteryState}</span></div>
            <div className="deviceRow">Power Source <span>{powerLabel}</span></div>
            <div className="deviceRow">Gyroscope <span>{gyro}</span></div>
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
                Network: {event.networkType || event.network || "N/A"} · GSM: {event.gsm ?? "N/A"}% ·
                Gyro: {event.gyro ?? event.gyroscope ?? "N/A"}
              </p>
            </div>
            <time>{event.createdAt || event.timestamp || event.time || "No time"}</time>
          </div>
        ))
      )}
    </div>
  );
}

function PriorityPanel({ stats, status, acceleration, gyro, powerLabel, networkLabel }) {
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
      <div className="deviceRow">Gyroscope <span>{gyro}</span></div>
      <div className="deviceRow">Power <span>{powerLabel}</span></div>
      <div className="deviceRow">Network <span>{networkLabel}</span></div>
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
