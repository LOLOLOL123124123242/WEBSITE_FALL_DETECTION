# FallSafe Enhanced Version

## What was added

- Login/register screen before accessing the dashboard
- JWT authentication for protected web API routes
- PostgreSQL database support using `DATABASE_URL`
- Automatic database table creation for users and events
- Default admin account from environment variables
- Events stored in database instead of frontend/local-only data

## Default local login

Email: `admin@fallsafe.local`
Password: `admin12345`

Change these using `ADMIN_EMAIL` and `ADMIN_PASSWORD` on Render.

## Backend deployment variables on Render

Set these environment variables:

```env
DATABASE_URL=your_render_postgres_url
JWT_SECRET=your_long_random_secret
ADMIN_EMAIL=your_email@example.com
ADMIN_PASSWORD=your_secure_password
DEVICE_API_KEY=optional_secret_for_esp32
```

If `DEVICE_API_KEY` is set, ESP32 should include this header:

```http
x-device-key: your_secret_key
```

## API auth

Frontend login:

```http
POST /api/auth/login
```

Protected dashboard data:

```http
GET /api/events
GET /api/status
GET /api/summary
GET /api/analytics
GET /api/devices
```

ESP32 event upload:

```http
POST /api/events
Content-Type: application/json
```

Example body:

```json
{
  "deviceId": "ESP32-FD-001",
  "type": "fall",
  "battery": 88,
  "gsm": 70,
  "location": "Room 204"
}
```
