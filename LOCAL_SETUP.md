# Local Setup Instructions

## 1. Prerequisites
- Node.js (v18+)
- MySQL Server

## 2. Database Setup
1. **Reset Database** (Optional but recommended):
   ```bash
   mysql -u root -pMantraGDR1008 -e "DROP DATABASE IF EXISTS scrap_system; CREATE DATABASE scrap_system;"
   ```
2. **Import Backup**:
   ```bash
   cmd /c "mysql -u root -pMantraGDR1008 scrap_system < scrape_system\latest_backup.sql"
   ```
   *Note: Using `MantraGDR1008` as configured locally.*

## 3. Configuration
- Check `server/.env`.
- Ensure `DATABASE_URL=mysql://root:MantraGDR1008@127.0.0.1:3306/scrap_system`

## 4. Run Application
**Server:**
```bash
cd server
npm install
npm start
```
(Runs on port 5001)

**Web Client:**
```bash
cd web
npm install
npm run dev
```
