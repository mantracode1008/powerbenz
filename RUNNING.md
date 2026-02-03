# Running Application

## Access Points
- **Web Interface**: [http://localhost:5173](http://localhost:5173) (or check terminal for port)
- **API Server**: [http://localhost:5000](http://localhost:5000)

## Status
- **Database**: Connected (MySQL `scrap_system`)
- **Server**: Running (PID: Check `npm start` terminal)
- **Client**: Running (PID: Check `npm run dev` terminal)

## Troubleshooting
If you see database errors on startup:
1. Try resetting the db (see `LOCAL_SETUP.md`).
2. The server creates an admin user `admin@admin.com` / `admin123` if missing.
