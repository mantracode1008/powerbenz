#!/bin/bash
# VPS Repair and Restart Script (Version 3 - Domain & Update Focus)
set -e

echo "--- STARTING VPS UPDATE FOR POWERBENZ.COM ---"

# 1. Paths
TARGET_DIR="/var/www/scrape"
ZIP_SOURCE="/tmp/project_deploy.zip"

# 2. Setup
mkdir -p "$TARGET_DIR"

# 3. Locate & Move Zip
if [ -f "$ZIP_SOURCE" ]; then
    echo "[FOUND] Update package found at $ZIP_SOURCE"
    mv "$ZIP_SOURCE" "$TARGET_DIR/project_deploy.zip"
else
    # Fallback checks
    if [ -f "/root/project_deploy.zip" ]; then
         echo "[FOUND] Found in /root, moving..."
         mv "/root/project_deploy.zip" "$TARGET_DIR/project_deploy.zip"
    else
         echo "[ERROR] No update package found in /tmp or /root."
         exit 1
    fi
fi

# 4. Extract
cd "$TARGET_DIR"
echo "[EXTRACT] Unzipping new code..."
unzip -o project_deploy.zip > /dev/null
rm project_deploy.zip

# 5. Dependencies
echo "[DEPS] Updating dependencies..."
cd server
npm install --omit=dev

# 6. PM2 Restart (Ensures application code is reloaded)
echo "[PM2] Restarting ScrapSys..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# We use 'reload' for zero-downtime if possible, or restart
# But delete/start is safest for config changes
pm2 delete scrape_system 2>/dev/null || true
pm2 start index.js --name scrape_system
pm2 save

# 7. Nginx Check (Verify Domain Proxy)
echo "[NGINX] Checking Web Server Status..."
if systemctl is-active --quiet nginx; then
    echo "Files Updated. Nginx is RUNNING."
    # Optional: Reload Nginx just in case
    systemctl reload nginx
else
    echo "WARNING: Nginx is NOT running. Domain powerbenz.com might not be reachable."
    echo "Attempting to start Nginx..."
    systemctl start nginx || echo "Failed to start Nginx. Check logs."
fi

echo "--- DEPLOYMENT COMPLETE ---"
echo "Project updated at /var/www/scrape"
