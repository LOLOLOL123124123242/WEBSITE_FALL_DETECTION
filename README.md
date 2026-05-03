# FallSafe Web Project

Professional frontend + backend for ESP32 fall/SOS monitoring.

## Run backend

```bash
cd backend
npm install
npm start
```

Backend URL:

```text
http://localhost:5000
```

## Run frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the shown Vite URL, usually:

```text
http://localhost:5173
```

## ESP32 endpoint

Send real ESP32 data to:

```text
POST http://YOUR_PC_IP:5000/api/events
```

JSON example:

```json
{
  "deviceId": "ESP32-FD-001",
  "type": "sos",
  "battery": 82,
  "gsm": 76
}
```

Allowed type values:

```text
normal
sos
fall
```

## Notes

No fake records are included. The dashboard is empty until ESP32 or your test request sends data.
Data is saved in `backend/data/events.json`.
