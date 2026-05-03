import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, Battery, CalendarDays, Database, Home, RefreshCw, Search,
  Settings, ShieldAlert, Signal, User, Wifi, PhoneCall, AlertTriangle
} from "lucide-react";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function fmt(date) {
  if (!date) return "No data";
  try {
    return new Date(date).toLocaleString("sv-SE").replace("T", " ");
  } catch {
    return String(date);
  }
}

function titleFor(type) {
  if (type === "fall") return "Fall detected";
  if (type === "sos") return "SOS button pressed";
  return "Normal data update";
}

function App() {
  const [page, setPage] = useState("overview");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({});
  const [summary, setSummary] = useState({ total: 0, fall: 0, sos: 0, normal: 0 });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [e, s, sum] = await Promise.all([
        fetch(`${API}/api/events`).then(r => r.json()),
        fetch(`${API}/api/status`).then(r => r.json()),
        fetch(`${API}/api/summary`).then(r => r.json())
      ]);
      setEvents(Array.isArray(e) ? e : []);
      setStatus(s || {});
      setSummary(sum || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return events.filter(e =>
      !q ||
      titleFor(e.type).toLowerCase().includes(q) ||
      String(e.deviceId || "").toLowerCase().includes(q) ||
      String(e.timestamp || "").toLowerCase().includes(q)
    );
  }, [events, query]);

  return (
    <div className="app">
      <aside className="sidebar">
        {[
          ["overview", Home],
          ["activity", Activity],
          ["logs", Database],
          ["calendar", CalendarDays],
          ["settings", Settings]
        ].map(([key, Icon]) => (
          <button key={key} className={page === key ? "nav active" : "nav"} onClick={() => setPage(key)}>
            <Icon size={23} />
          </button>
        ))}
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="logo">fallsafe</div>
            <div className="sub">{status.deviceId || "ESP32-FD-001"} • Last update: {fmt(status.lastUpdate)}</div>
          </div>
          <div className="topActions">
            <div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search logs"/></div>
            <button className="iconBtn" onClick={load}><RefreshCw size={20} className={loading ? "spin" : ""}/></button>
            <button className="profile" onClick={() => setPage("profile")}><User size={22}/></button>
          </div>
        </header>

        {page === "overview" && <Overview status={status} summary={summary} events={filtered} />}
        {page === "activity" && <ActivityPage summary={summary} events={filtered} />}
        {page === "logs" && <Logs events={filtered} />}
        {page === "calendar" && <CalendarPage events={events} />}
        {page === "settings" && <SettingsPage />}
        {page === "profile" && <ProfilePage />}
      </main>
    </div>
  );
}

function Card({ title, value, subtitle, icon, highlight }) {
  return <section className={highlight ? "card highlight" : "card"}>
    <div>
      <p className="muted">{title}</p>
      <h2>{value}</h2>
      <p className="muted">{subtitle}</p>
    </div>
    <div className="roundIcon">{icon}</div>
  </section>;
}

function Overview({ status, summary, events }) {
  return <>
    <div className="heading">
      <h1>Overview</h1>
      <p>{status.deviceId || "ESP32-FD-001"} • Last update: {fmt(status.lastUpdate)}</p>
    </div>

    <div className="grid3">
      <Card title="Device" value={status.online ? "Online" : "Offline"} subtitle="Connection status" icon={<Wifi/>}/>
      <Card title="Battery" value={status.battery == null ? "—" : `${status.battery}%`} subtitle="Battery level" icon={<Battery/>} highlight/>
      <Card title="GSM" value={status.gsm == null ? "—" : `${status.gsm}%`} subtitle="Signal strength" icon={<Signal/>}/>
    </div>

    <div className="twoCols">
      <section className="panel">
        <h3>Emergency Test</h3>
        <p className="muted">Use real ESP32 requests. Demo buttons are not included.</p>
        <div className="emptyNote">Waiting for hardware events...</div>
      </section>
      <section className="stats highlight">
        <h2>{summary.total}</h2><p>Stored events</p>
        <div className="statsRow">
          <div><h3>{summary.fall}</h3><p>Fall events</p></div>
          <div><h3>{summary.sos}</h3><p>SOS events</p></div>
        </div>
      </section>
    </div>

    <Logs title="Recent Logs" events={events.slice(0, 5)} />
  </>;
}

function ActivityPage({ summary, events }) {
  return <>
    <div className="heading"><h1>Activity</h1></div>
    <div className="grid3">
      <Card title="Falls" value={summary.fall} subtitle="Detected events" icon={<AlertTriangle/>}/>
      <Card title="SOS" value={summary.sos} subtitle="Button presses" icon={<PhoneCall/>} highlight/>
      <Card title="Normal" value={summary.normal} subtitle="Regular updates" icon={<Activity/>}/>
    </div>
    <Logs title="Stored Logs" events={events}/>
  </>;
}

function Logs({ events, title = "Stored Logs" }) {
  return <section className="panel logs">
    <h3>{title}</h3>
    {events.length === 0 ? <div className="emptyNote">No records yet. Dashboard will update when ESP32 sends data.</div> :
      events.map(e => <div className={`log ${e.type}`} key={e.id}>
        <div>
          <strong>{titleFor(e.type)}</strong>
          <p>{e.deviceId} • Battery {e.battery ?? "—"}% • GSM {e.gsm ?? "—"}%</p>
        </div>
        <span>{fmt(e.timestamp)}</span>
      </div>)
    }
  </section>;
}

function CalendarPage({ events }) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const byDay = {};
  events.forEach(e => {
    const d = new Date(e.timestamp).getDate();
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(e);
  });
  return <>
    <div className="heading"><h1>Calendar</h1><p>Days with fall, SOS, battery or status events</p></div>
    <div className="calendarLabels">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><span key={d}>{d}</span>)}</div>
    <div className="calendarGrid">
      {days.map(d => <div key={d} className={byDay[d] ? "day hasEvent" : "day"}>
        <b>{d}</b>
        {byDay[d] && <><small>{byDay[d].length} event(s)</small><em>{titleFor(byDay[d][0].type)}</em></>}
      </div>)}
    </div>
  </>;
}

function SettingsPage() {
  return <><div className="heading"><h1>Settings</h1></div>
    <section className="panel">
      <h3>System Configuration</h3>
      <label>Backend API:</label>
      <code>{API}</code>
      <label>Device ID:</label>
      <code>ESP32-FD-001</code>
    </section>
  </>;
}

function ProfilePage() {
  return <><div className="heading"><h1>Profile</h1></div>
    <section className="panel">
      <h3>Demo User</h3>
      <p className="muted">FallSafe monitoring account</p>
      <div className="formRow"><input placeholder="Email"/><input placeholder="Password"/></div>
      <button className="login">Login Demo</button>
    </section>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
