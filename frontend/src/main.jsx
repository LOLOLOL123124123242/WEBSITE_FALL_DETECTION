import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const API =
  import.meta.env.VITE_API_URL || "https://website-fall-detection.onrender.com";

function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@fallsafe.local");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);

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
      console.log("Dashboard loading error");
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
    const falls = events.filter((e) => e.type === "fall").length;
    const sos = events.filter((e) => e.type === "sos").length;
    const normal = total - falls - sos;

    return {
      total: analytics?.totalEvents ?? total,
      falls: analytics?.falls ?? falls,
      sos: analytics?.sos ?? sos,
      normal,
    };
  }, [events, analytics]);

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  if (!token) {
    return (
      <div className="authShell">
        <div className="authModal">
          <div className="authInfo">
            <h2>Welcome Back to FallSafe</h2>
            <p>
              Sign in to continue to your ESP32 fall detection dashboard, live
              status, incident records, and analytics.
            </p>
          </div>

          <div className="authCard">
            <div className="authBrand">FallSafe Secure Access</div>

            <h1>{mode === "login" ? "Sign In" : "Create Account"}</h1>

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

              <button onClick={authSubmit} disabled={loading}>
                {loading
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </button>
            </div>

            <button
              className="switchAuth"
              onClick={() => {
                setMessage("");
                setMode(mode === "login" ? "register" : "login");
              }}
            >
              {mode === "login"
                ? "Not a member yet? Sign Up."
                : "Already have an account? Sign In."}
            </button>

            {message && <div className="authError">{message}</div>}

            <div className="authMeta">REST API: {API}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brandMark">FS</div>
        <nav>
          <button className="nav active">⌂</button>
          <button className="nav">📡</button>
          <button className="nav">📊</button>
          <button className="nav">⚙</button>
        </nav>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">ESP32 Fall Detection System</p>
            <h1>FallSafe Dashboard</h1>
          </div>

          <div className="toolbar">
            <span className="userBadge">{email}</span>
            <button className="refresh" onClick={loadDashboard}>↻</button>
            <button className="refresh" onClick={logout}>⎋</button>
          </div>
        </div>

        <div className="apiBanner live">
          🔒 REST API connected: {API}
        </div>

        <section className="hero">
          <div>
            <span className="pill good">System Online</span>
            <h2>Live fall monitoring and incident tracking</h2>
            <p>
              FallSafe receives data from the ESP32 device through the REST API,
              stores records in the database, and displays live status here.
            </p>

            <div className="heroActions">
              <button onClick={loadDashboard}>Refresh Data</button>
              <button className="warn">Export CSV</button>
              <button className="danger">Emergency Mode</button>
            </div>
          </div>

          <div className="deviceCard">
            <span className="pill good">Active Device</span>
            <h3>{status?.deviceId || "ESP32-FD-001"}</h3>
            <p>{status?.status || status?.state || "Waiting for data"}</p>

            <div className="miniStats">
              <span>
                Battery
                <b>{status?.battery ?? "N/A"}%</b>
              </span>
              <span>
                GSM
                <b>{status?.gsm ?? "N/A"}%</b>
              </span>
            </div>
          </div>
        </section>

        <section className="metricGrid">
          <div className="metric">
            <div>
              <span>Total Records</span>
              <strong>{stats.total}</strong>
              <p>Stored incidents</p>
            </div>
            <i>📁</i>
          </div>

          <div className="metric danger">
            <div>
              <span>Falls</span>
              <strong>{stats.falls}</strong>
              <p>Detected fall events</p>
            </div>
            <i>⚠</i>
          </div>

          <div className="metric warn">
            <div>
              <span>SOS</span>
              <strong>{stats.sos}</strong>
              <p>Emergency alerts</p>
            </div>
            <i>🚨</i>
          </div>

          <div className="metric good">
            <div>
              <span>Normal</span>
              <strong>{stats.normal}</strong>
              <p>Normal records</p>
            </div>
            <i>✓</i>
          </div>
        </section>

        <section className="contentGrid">
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
                <div className={`log ${event.type || ""}`} key={event.id || index}>
                  <div className="logIcon">
                    {event.type === "fall"
                      ? "⚠"
                      : event.type === "sos"
                      ? "🚨"
                      : "✓"}
                  </div>

                  <div>
                    <strong>{event.type || "event"}</strong>
                    <p>
                      Device: {event.deviceId || "ESP32-FD-001"} · Battery:{" "}
                      {event.battery ?? "N/A"}% · GSM: {event.gsm ?? "N/A"}%
                    </p>
                  </div>

                  <time>
                    {event.createdAt ||
                      event.timestamp ||
                      event.time ||
                      "No time"}
                  </time>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h3>Priority Alert</h3>
            <div
              className={`priority ${
                stats.falls > 0 ? "fall" : stats.sos > 0 ? "sos" : ""
              }`}
            >
              <h4>
                {stats.falls > 0
                  ? "Fall Detected"
                  : stats.sos > 0
                  ? "SOS Active"
                  : "All Clear"}
              </h4>
              <p>
                The system is connected and waiting for live data from your ESP32.
              </p>
            </div>

            <h3 style={{ marginTop: 22 }}>Device Info</h3>
            <div className="deviceRow">
              ESP32-FD-001 <span>{status?.status || "Online"}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);