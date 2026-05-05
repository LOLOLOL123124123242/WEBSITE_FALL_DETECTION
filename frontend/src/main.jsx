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

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 2600);
  }

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

  const stats = useMemo(() => {
    const total = events.length;
    const falls = events.filter((e) => String(e.type).toLowerCase() === "fall").length;
    const sos = events.filter((e) => String(e.type).toLowerCase() === "sos").length;
    const normal = Math.max(total - falls - sos, 0);

    const avgBattery =
      total > 0
        ? Math.round(events.reduce((sum, e) => sum + Number(e.battery || 0), 0) / total)
        : status?.battery ?? 88;

    const avgGsm =
      total > 0
        ? Math.round(events.reduce((sum, e) => sum + Number(e.gsm || 0), 0) / total)
        : status?.gsm ?? 70;

    const fallRate = total > 0 ? Math.round((falls / total) * 100) : 0;
    const sosRate = total > 0 ? Math.round((sos / total) * 100) : 0;
    const healthScore = Math.round((avgBattery + avgGsm) / 2);
    const latest = events[0];

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
      latestType: latest?.type || "No incident",
      lastUpdate: latest?.createdAt || latest?.timestamp || latest?.time || "No update yet",
    };
  }, [events, analytics, status]);

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    showToast("Logged out");
  }

  function exportCSV() {
    const rows = [
      ["Time", "Device", "Type", "Battery", "GSM"],
      ...events.map((e) => [
        e.createdAt || e.timestamp || e.time || "",
        e.deviceId || "ESP32-FD-001",
        e.type || "event",
        e.battery ?? "",
        e.gsm ?? "",
      ]),
    ];

    const csv = rows
      .map((row) => row.map((v) => `\"${String(v).replaceAll('\"', '\"\"')}\"`).join(","))
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
          battery: Math.floor(70 + Math.random() * 25),
          gsm: Math.floor(55 + Math.random() * 40),
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

            <div className="socialStack">
              <button type="button">Continue with Google</button>
              <button type="button">Continue with Apple</button>
            </div>

            <div className="divider">or</div>

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
                  stores records in the database, and displays live status here.
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
                <h3>{status?.deviceId || "ESP32-FD-001"}</h3>
                <p>{status?.status || status?.state || "Waiting for data"}</p>

                <div className="miniStats">
                  <span>
                    Battery
                    <b>{status?.battery ?? stats.avgBattery}%</b>
                  </span>
                  <span>
                    GSM
                    <b>{status?.gsm ?? stats.avgGsm}%</b>
                  </span>
                </div>
              </div>
            </section>

            <MetricGrid stats={stats} />

            <section className="contentGrid">
              <IncidentLogs events={events} />
              <PriorityPanel stats={stats} status={status} />
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
                <span>
                  Health Score <b>{stats.healthScore}%</b>
                </span>
                <span>
                  Average Battery <b>{stats.avgBattery}%</b>
                </span>
                <span>
                  Average GSM <b>{stats.avgGsm}%</b>
                </span>
                <span>
                  Connection <b>{status ? "Online" : "Waiting"}</b>
                </span>
                <span>
                  Latest Incident <b>{stats.latestType}</b>
                </span>
                <span>
                  Last Update <b>{stats.lastUpdate}</b>
                </span>
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
            <div className="deviceRow">
              API Endpoint <span>{API}</span>
            </div>
            <div className="deviceRow">
              Refresh Interval <span>5 seconds</span>
            </div>
            <div className="deviceRow">
              Authentication <span>JWT enabled</span>
            </div>
            <div className="deviceRow">
              Database Storage <span>Enabled</span>
            </div>
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
        <div>
          <span>Total Records</span>
          <strong>{stats.total}</strong>
          <p>Stored incidents</p>
        </div>
        <i>📁</i>
      </div>

      <div className="metric danger hoverLift">
        <div>
          <span>Falls</span>
          <strong>{stats.falls}</strong>
          <p>Detected fall events</p>
        </div>
        <i>⚠</i>
      </div>

      <div className="metric warn hoverLift">
        <div>
          <span>SOS</span>
          <strong>{stats.sos}</strong>
          <p>Emergency alerts</p>
        </div>
        <i>🚨</i>
      </div>

      <div className="metric good hoverLift">
        <div>
          <span>Health</span>
          <strong>{stats.healthScore}%</strong>
          <p>Device health score</p>
        </div>
        <i>✓</i>
      </div>
    </section>
  );
}

function IncidentLogs({ events }) {
  return (
    <div className="panel">
      <div className="panelHead">
        <h3>Incident Logs</h3>
        <span>{events.length} records</span>
      </div>

      {events.length === 0 ? (
        <div className="empty">
          <strong>No records yet</strong>
          <span>When ESP32 sends data, it will appear here.</span>
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
                Device: {event.deviceId || "ESP32-FD-001"} · Battery:{" "}
                {event.battery ?? "N/A"}% · GSM: {event.gsm ?? "N/A"}%
              </p>
            </div>

            <time>{event.createdAt || event.timestamp || event.time || "No time"}</time>
          </div>
        ))
      )}
    </div>
  );
}

function PriorityPanel({ stats, status }) {
  return (
    <div className="panel">
      <h3>Priority Alert</h3>
      <div className={`priority ${stats.falls > 0 ? "fall" : stats.sos > 0 ? "sos" : ""}`}>
        <h4>{stats.falls > 0 ? "Fall Detected" : stats.sos > 0 ? "SOS Active" : "All Clear"}</h4>
        <p>The system is connected and waiting for live data from your ESP32.</p>
      </div>

      <h3 style={{ marginTop: 22 }}>Device Info</h3>
      <div className="deviceRow">
        ESP32-FD-001 <span>{status?.status || "Online"}</span>
      </div>
    </div>
  );
}

function Bar({ label, value, danger, warn }) {
  return (
    <div className="barRow">
      <div>
        <b>{label}</b>
        <span>{value}%</span>
      </div>
      <div className="barTrack">
        <div
          className={`barFill ${danger ? "danger" : warn ? "warn" : ""}`}
          style={{ width: `${value}%` }}
        />
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
