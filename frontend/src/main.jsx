import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Battery,
  Bell,
  CalendarDays,
  CheckCircle2,
  Database,
  Home,
  LogOut,
  LockKeyhole,
  MapPin,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Signal,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const demoEvents = [
  { id: "demo-1", deviceId: "ESP32-FD-001", type: "normal", battery: 91, gsm: 88, location: "Room 204", timestamp: new Date(Date.now() - 1000 * 60 * 7).toISOString() },
  { id: "demo-2", deviceId: "ESP32-FD-001", type: "sos", battery: 89, gsm: 84, location: "Hallway", timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString() },
  { id: "demo-3", deviceId: "ESP32-FD-002", type: "fall", battery: 76, gsm: 71, location: "Kitchen", timestamp: new Date(Date.now() - 1000 * 60 * 160).toISOString() },
  { id: "demo-4", deviceId: "ESP32-FD-002", type: "normal", battery: 79, gsm: 75, location: "Kitchen", timestamp: new Date(Date.now() - 1000 * 60 * 280).toISOString() },
];

const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "No data");
const time = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--");
const eventTitle = (type) => (type === "fall" ? "Fall detected" : type === "sos" ? "SOS pressed" : "Normal update");
const eventIcon = (type) => (type === "fall" ? <AlertTriangle size={18} /> : type === "sos" ? <PhoneCall size={18} /> : <CheckCircle2 size={18} />);

function buildSummary(events) {
  return {
    total: events.length,
    fall: events.filter((e) => e.type === "fall").length,
    sos: events.filter((e) => e.type === "sos").length,
    normal: events.filter((e) => e.type === "normal").length,
    devices: new Set(events.map((e) => e.deviceId)).size,
  };
}

function buildAnalytics(events) {
  const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const byDay = {};
  sorted.forEach((e) => {
    const date = e.timestamp.slice(0, 10);
    byDay[date] ||= { date, total: 0, fall: 0, sos: 0, normal: 0 };
    byDay[date].total += 1;
    byDay[date][e.type] += 1;
  });
  return {
    batteryHistory: sorted.filter((e) => e.battery !== null).map((e) => ({ time: e.timestamp, value: e.battery })),
    gsmHistory: sorted.filter((e) => e.gsm !== null).map((e) => ({ time: e.timestamp, value: e.gsm })),
    eventCounts: buildSummary(events),
    dailyEvents: Object.values(byDay),
  };
}

function latestStatus(events, deviceId) {
  const filtered = deviceId === "all" ? events : events.filter((e) => e.deviceId === deviceId);
  const latest = [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  if (!latest) return { online: false, deviceId: deviceId === "all" ? "All devices" : deviceId, battery: null, gsm: null, lastUpdate: null };
  return { ...latest, lastUpdate: latest.timestamp, online: Date.now() - new Date(latest.timestamp).getTime() < 5 * 60 * 1000 };
}

function App() {
  const [page, setPage] = useState("overview");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({});
  const [summary, setSummary] = useState(buildSummary([]));
  const [analytics, setAnalytics] = useState(buildAnalytics([]));
  const [devices, setDevices] = useState([]);
  const [device, setDevice] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiState, setApiState] = useState("connecting");
  const [token, setToken] = useState(() => localStorage.getItem("fallsafe_token") || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fallsafe_user") || "null"); } catch { return null; }
  });

  function saveSession(data) {
    localStorage.setItem("fallsafe_token", data.token);
    localStorage.setItem("fallsafe_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("fallsafe_token");
    localStorage.removeItem("fallsafe_user");
    setToken("");
    setUser(null);
    setEvents([]);
    setApiState("connecting");
  }

  async function authenticate(mode, payload) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Authentication failed");
    saveSession(data);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    if (response.status === 401) { logout(); throw new Error("Login expired"); }
    if (!response.ok) throw new Error(`API error ${response.status}`);
    return response.json();
  }

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const q = device === "all" ? "" : `?deviceId=${encodeURIComponent(device)}`;
      const [eventData, statusData, summaryData, analyticsData, deviceData] = await Promise.all([
        api(`/api/events${q}`),
        api(`/api/status${q}`),
        api(`/api/summary${q}`),
        api(`/api/analytics${q}`),
        api("/api/devices"),
      ]);
      setEvents(Array.isArray(eventData) ? eventData : []);
      setStatus(statusData || {});
      setSummary(summaryData || buildSummary([]));
      setAnalytics(analyticsData || buildAnalytics([]));
      setDevices(Array.isArray(deviceData) ? deviceData : []);
      setApiState("live");
    } catch (error) {
      const fallback = device === "all" ? demoEvents : demoEvents.filter((e) => e.deviceId === device);
      setEvents(fallback);
      setStatus(latestStatus(demoEvents, device));
      setSummary(buildSummary(fallback));
      setAnalytics(buildAnalytics(fallback));
      setDevices([...new Set(demoEvents.map((e) => e.deviceId))].map((deviceId) => latestStatus(demoEvents, deviceId)));
      setApiState("demo");
    } finally {
      setLoading(false);
    }
  }

  async function createTestEvent(typeName) {
    const body = {
      deviceId: device === "all" ? "ESP32-FD-001" : device,
      type: typeName,
      battery: Math.floor(70 + Math.random() * 25),
      gsm: Math.floor(65 + Math.random() * 30),
      location: "Demo location",
      message: "Created from FallSafe dashboard",
    };
    try {
      await api("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
    } catch {
      setEvents((prev) => [{ ...body, id: `local-${Date.now()}`, timestamp: new Date().toISOString() }, ...prev]);
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [device, token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      const text = `${eventTitle(event.type)} ${event.deviceId} ${event.location || ""}`.toLowerCase();
      return (!q || text.includes(q)) && (type === "all" || event.type === type) && (!day || event.timestamp.slice(0, 10) === day);
    });
  }, [events, query, type, day]);

  const nav = [
    ["overview", Home],
    ["activity", Activity],
    ["logs", Database],
    ["analytics", BarChart3],
    ["calendar", CalendarDays],
    ["alerts", Bell],
    ["settings", Settings],
  ];

  if (!token) return <AuthPage onAuth={authenticate} api={API} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brandMark"><ShieldCheck size={28} /></div>
        <nav>{nav.map(([key, Icon]) => <button key={key} className={page === key ? "nav active" : "nav"} onClick={() => setPage(key)} title={key}><Icon size={22} /></button>)}</nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">FallSafe monitoring platform</p>
            <h1>{page[0].toUpperCase() + page.slice(1)}</h1>
          </div>
          <div className="toolbar">
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="all">All devices</option>
              {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.deviceId}</option>)}
            </select>
            <div className="search"><Search size={17} /><input placeholder="Search events" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <span className="userBadge">{user?.name || user?.email || "User"}</span>
            <button className="refresh" onClick={load} title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={19} /></button>
            <button className="refresh" onClick={logout} title="Log out"><LogOut size={19} /></button>
          </div>
        </header>

        <ApiBanner state={apiState} api={API} />

        {page === "overview" && <Overview status={status} summary={summary} events={filtered} createTestEvent={createTestEvent} />}
        {page === "activity" && <ActivityPage summary={summary} events={filtered} />}
        {page === "logs" && <LogsPage events={filtered} type={type} setType={setType} day={day} setDay={setDay} />}
        {page === "analytics" && <Analytics analytics={analytics} />}
        {page === "calendar" && <CalendarPage events={events} setDay={setDay} setPage={setPage} />}
        {page === "alerts" && <Alerts />}
        {page === "settings" && <SettingsPage devices={devices} api={API} />}
      </main>
    </div>
  );
}


function AuthPage({ onAuth, api }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("Administrator");
  const [email, setEmail] = useState("admin@fallsafe.local");
  const [password, setPassword] = useState("admin12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onAuth(mode, mode === "register" ? { name, email, password } : { email, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authShell">
      <section className="authCard">
        <div className="authBrand"><ShieldCheck size={34} /><span>FallSafe</span></div>
        <h1>Secure monitoring access</h1>
        <p>Login first to view live device status, stored records, incident logs, and analytics.</p>
        <form onSubmit={submit} className="authForm">
          {mode === "register" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" minLength={6} required />
          {error && <div className="authError">{error}</div>}
          <button disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
        </form>
        <button className="switchAuth" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
        </button>
        <div className="authMeta"><LockKeyhole size={16} /> REST API: {api}</div>
      </section>
      <section className="authInfo">
        <span className="pill good">JWT protected dashboard</span>
        <h2>Records are stored in PostgreSQL database</h2>
        <p>The ESP32 sends event data to the REST API, and authenticated users can view saved events, status, analytics, and logs from the web application.</p>
      </section>
    </div>
  );
}

function ApiBanner({ state, api }) {
  if (state === "live") return <div className="apiBanner live"><Wifi size={17} /> Connected to backend: {api}</div>;
  if (state === "demo") return <div className="apiBanner demo"><WifiOff size={17} /> Backend is not reachable. Showing demo data until the API starts.</div>;
  return <div className="apiBanner"><RefreshCw size={17} /> Connecting to backend...</div>;
}

function Metric({ label, value, hint, icon, tone = "default" }) {
  return <section className={`metric ${tone}`}><div><span>{label}</span><strong>{value}</strong><p>{hint}</p></div><i>{icon}</i></section>;
}

function Overview({ status, summary, events, createTestEvent }) {
  const latest = events[0];
  return <>
    <section className="hero">
      <div>
        <span className={status.online ? "pill good" : "pill bad"}>{status.online ? "Device online" : "Device offline"}</span>
        <h2>Real-time fall detection command center</h2>
        <p>Monitor ESP32 wearable devices, check battery and GSM signal, review incidents, and trigger alert tests from one responsive dashboard.</p>
        <div className="heroActions">
          <button onClick={() => createTestEvent("normal")}><Plus size={17} /> Add normal test</button>
          <button className="danger" onClick={() => createTestEvent("fall")}><AlertTriangle size={17} /> Simulate fall</button>
          <button className="warn" onClick={() => createTestEvent("sos")}><PhoneCall size={17} /> Simulate SOS</button>
        </div>
      </div>
      <div className="deviceCard">
        <Smartphone size={34} />
        <h3>{status.deviceId || "ESP32-FD-001"}</h3>
        <p>Last update: {fmt(status.lastUpdate)}</p>
        <div className="miniStats"><span>Battery <b>{status.battery ?? "—"}%</b></span><span>GSM <b>{status.gsm ?? "—"}%</b></span></div>
      </div>
    </section>

    <div className="metricGrid">
      <Metric label="Total events" value={summary.total} hint="Saved records" icon={<Database />} />
      <Metric label="Falls" value={summary.fall} hint="Critical incidents" icon={<AlertTriangle />} tone="danger" />
      <Metric label="SOS" value={summary.sos} hint="Manual emergency calls" icon={<PhoneCall />} tone="warn" />
      <Metric label="Devices" value={summary.devices} hint="Registered units" icon={<Smartphone />} tone="good" />
    </div>

    <div className="contentGrid">
      <Logs title="Latest incidents" events={events.slice(0, 6)} />
      <section className="panel timelinePanel"><h3>Current priority</h3>{latest ? <div className={`priority ${latest.type}`}>{eventIcon(latest.type)}<h4>{eventTitle(latest.type)}</h4><p>{latest.deviceId} • {latest.location || "No location"}</p><small>{fmt(latest.timestamp)}</small></div> : <Empty text="No events yet" />}</section>
    </div>
  </>;
}

function ActivityPage({ summary, events }) {
  return <>
    <div className="metricGrid">
      <Metric label="Normal" value={summary.normal} hint="Health updates" icon={<Activity />} tone="good" />
      <Metric label="SOS" value={summary.sos} hint="Button presses" icon={<PhoneCall />} tone="warn" />
      <Metric label="Falls" value={summary.fall} hint="Detected falls" icon={<AlertTriangle />} tone="danger" />
      <Metric label="All events" value={summary.total} hint="Across filters" icon={<Database />} />
    </div>
    <Logs title="Activity stream" events={events} />
  </>;
}

function LogsPage({ events, type, setType, day, setDay }) {
  return <>
    <section className="filters panel">
      <select value={type} onChange={(e) => setType(e.target.value)}><option value="all">All event types</option><option value="fall">Fall</option><option value="sos">SOS</option><option value="normal">Normal</option></select>
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <button onClick={() => { setType("all"); setDay(""); }}>Clear filters</button>
    </section>
    <Logs title="Event logs" events={events} />
  </>;
}

function Logs({ title, events }) {
  return <section className="panel logs"><div className="panelHead"><h3>{title}</h3><span>{events.length} record(s)</span></div>{events.length ? events.map((event) => <article key={event.id} className={`log ${event.type}`}><div className="logIcon">{eventIcon(event.type)}</div><div><strong>{eventTitle(event.type)}</strong><p>{event.deviceId} • Battery {event.battery ?? "—"}% • GSM {event.gsm ?? "—"}% {event.location ? `• ${event.location}` : ""}</p></div><time>{fmt(event.timestamp)}</time></article>) : <Empty text="No matching records" />}</section>;
}

function Analytics({ analytics }) {
  const battery = (analytics.batteryHistory || []).map((x) => ({ ...x, label: time(x.time) })).slice(-12);
  const gsm = (analytics.gsmHistory || []).map((x) => ({ ...x, label: time(x.time) })).slice(-12);
  const counts = [{ name: "Normal", value: analytics.eventCounts?.normal || 0 }, { name: "SOS", value: analytics.eventCounts?.sos || 0 }, { name: "Fall", value: analytics.eventCounts?.fall || 0 }];
  return <div className="chartGrid">
    <Chart title="Battery history"><ResponsiveContainer width="100%" height={260}><LineChart data={battery}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="value" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></Chart>
    <Chart title="GSM signal"><ResponsiveContainer width="100%" height={260}><LineChart data={gsm}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="value" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></Chart>
    <Chart title="Event distribution"><ResponsiveContainer width="100%" height={260}><PieChart><Tooltip /><Pie data={counts} dataKey="value" nameKey="name" outerRadius={95} label>{counts.map((_, i) => <Cell key={i} />)}</Pie></PieChart></ResponsiveContainer></Chart>
    <Chart title="Daily events"><ResponsiveContainer width="100%" height={260}><BarChart data={analytics.dailyEvents || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></Chart>
  </div>;
}

function Chart({ title, children }) { return <section className="panel chart"><h3>{title}</h3>{children}</section>; }

function CalendarPage({ events, setDay, setPage }) {
  const grouped = useMemo(() => events.reduce((acc, event) => { const d = event.timestamp.slice(0, 10); acc[d] ||= []; acc[d].push(event); return acc; }, {}), [events]);
  const days = Object.keys(grouped).sort().reverse();
  return <section className="panel calendar"><h3>Incident calendar</h3>{days.length ? <div className="dateList">{days.map((date) => <button key={date} onClick={() => { setDay(date); setPage("logs"); }}><CalendarDays size={20} /><strong>{date}</strong><span>{grouped[date].length} event(s)</span></button>)}</div> : <Empty text="No calendar events yet" />}</section>;
}

function Alerts() {
  return <section className="panel alertSetup"><h3>Alert integrations</h3><p>Configure these backend environment variables to enable Telegram and email alerts for SOS/fall events.</p><code>TELEGRAM_BOT_TOKEN=your_bot_token</code><code>TELEGRAM_CHAT_ID=your_chat_id</code><code>EMAIL_WEBHOOK_URL=https://formspree.io/f/your_id</code><code>ALERT_EMAIL=receiver@example.com</code></section>;
}

function SettingsPage({ devices, api }) {
  return <div className="contentGrid"><section className="panel"><h3>Backend</h3><p className="soft">API URL</p><code>{api}</code><p className="soft">Set a different URL in <b>.env</b> using <b>VITE_API_URL</b>.</p></section><section className="panel"><h3>Devices</h3>{devices.length ? devices.map((d) => <div className="deviceRow" key={d.deviceId}><Smartphone size={18} /><b>{d.deviceId}</b><span>{d.online ? "online" : "offline"}</span></div>) : <Empty text="No devices discovered" />}</section></div>;
}

function Empty({ text }) { return <div className="empty"><Database size={22} /> {text}</div>; }

createRoot(document.getElementById("root")).render(<App />);
