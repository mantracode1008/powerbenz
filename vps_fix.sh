#!/bin/bash
# VPS Repair and Restart Script (Version 2 - Explicit Pathing)
set -e

echo "--- STARTING VPS DEPLOYMENT ---"

# 1. Define Paths
TARGET_DIR="/var/www/scrape"
ZIP_SOURCE="/tmp/project_deploy.zip"

# 2. Setup Directory
echo "[SETUP] Creating target directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# 3. Locate Zip
if [ -f "$ZIP_SOURCE" ]; then
    echo "[FOUND] Zip file found at $ZIP_SOURCE"
    echo "[MOVE] Moving to $TARGET_DIR..."
    mv "$ZIP_SOURCE" "$TARGET_DIR/project_deploy.zip"
else
    echo "[ERROR] Zip file NOT found at $ZIP_SOURCE"
    echo "Listing /tmp content:"
    ls -la /tmp | grep project
    # Fallback check (sometimes scp puts it in user home?)
    if [ -f "/root/project_deploy.zip" ]; then
         echo "[FOUND] Found in /root, moving..."
         mv "/root/project_deploy.zip" "$TARGET_DIR/project_deploy.zip"
    fi
fi

# 4. Extract
cd "$TARGET_DIR"
if [ -f "project_deploy.zip" ]; then
    echo "[EXTRACT] Unzipping..."
    unzip -o project_deploy.zip > /dev/null
    rm project_deploy.zip
else
    echo "[CRITICAL] No project_deploy.zip found in target dir. Aborting update."
    exit 1
fi

# 5. Dependencies
echo "[DEPS] Installing Server Dependencies..."
cd server
if [ -f "package.json" ]; then
    npm install --omit=dev
else
    echo "[CRITICAL] No package.json found in server dir! Directory listing:"
    ls -la
    exit 1
fi

# 6. PM2 Restart
echo "[PM2] Restarting..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

pm2 delete scrape_system 2>/dev/null || true
pm2 start index.js --name scrape_system
pm2 save

echo "--- DEPLOYMENT SUCCESSFUL ---"
