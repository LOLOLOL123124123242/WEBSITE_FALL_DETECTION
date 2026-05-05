import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "https://website-fall-detection.onrender.com";

function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@fallsafe.local");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
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
      setMessage("✅ Login successful");
      window.location.reload();
    } catch (err) {
      setMessage("❌ Server connection error");
    }
  }

  return (
    <div className="container">
      <h1>FallSafe {mode === "login" ? "Login" : "Register"}</h1>

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

      <button onClick={submit}>
        {mode === "login" ? "Log in" : "Create account"}
      </button>

      <button
        onClick={() => {
          setMessage("");
          setMode(mode === "login" ? "register" : "login");
        }}
      >
        {mode === "login"
          ? "Need an account? Register"
          : "Already have an account? Log in"}
      </button>

      <p>{message}</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);