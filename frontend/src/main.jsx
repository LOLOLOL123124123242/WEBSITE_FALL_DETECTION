import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL;

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const text = await response.text();

      try {
        const data = JSON.parse(text);

        if (response.ok) {
          setMessage("✅ Login successful");
        } else {
          setMessage(data.message || "❌ Login failed");
        }
      } catch {
        setMessage("❌ Backend error (not JSON response)");
        console.error("Response was:", text);
      }
    } catch (err) {
      setMessage("❌ Cannot connect to backend");
    }
  };

  return (
    <div className="container">
      <h1>FallSafe Login</h1>

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

      <button onClick={handleLogin}>Log in</button>

      <p>{message}</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);