import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "https://website-fall-detection.onrender.com";

function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@fallsafe.local");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [events, setEvents] = useState([]);

  async function authSubmit() {
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
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
      setMessage("❌ Server error");
    }
  }

  async function loadEvents() {
    try {
      const res = await fetch(`${API}/api/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setEvents(await res.json());
    } catch {}
  }

  useEffect(() => {
    if (token) loadEvents();
  }, [token]);

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
              Sign in to monitor ESP32 fall detection, view logs, and analytics.
            </p>
          </div>

          <div className="authCard">
            <div className="authBrand">FallSafe</div>

            <h1>{mode === "login" ? "Sign In" : "Register"}</h1>

            <div className="authForm">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button onClick={authSubmit}>
                {mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </div>

            <button
              className="switchAuth"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login"
                ? "Need an account? Register"
                : "Already have an account? Log in"}
            </button>

            {message && <div className="authError">{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>FallSafe Dashboard</h1>
      <button onClick={logout}>Logout</button>

      <h2>Events</h2>
      {events.length === 0 ? (
        <p>No data</p>
      ) : (
        events.map((e, i) => (
          <div key={i}>
            {e.type} - {e.deviceId}
          </div>
        ))
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);