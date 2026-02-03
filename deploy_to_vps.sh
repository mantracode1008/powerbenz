#!/bin/bash
set -e

# Target Directory
DIR="/var/www/scrape_system"

echo "--- Starting Deployment to $DIR ---"

# Step 1: Install System Dependencies (Ensure environment is ready)
# We assume root access.
# Prevent interactive prompts
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nodejs npm unzip mysql-server zip

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# Step 2: Clean up old installation
if [ -d "$DIR" ]; then
  echo "Found existing $DIR. Removing..."
  rm -rf "$DIR"
fi

# Step 3: Create directory and Unzip
echo "Creating directory..."
mkdir -p "$DIR"
cd "$DIR"

echo "Extracting /tmp/deploy.zip..."
unzip -o /tmp/deploy.zip -d .
rm /tmp/deploy.zip

# Step 4: Server Setup
echo "--- Setting up Server ---"
cd server
npm install --production

# Create .env file
# Note: DATABASE_URL uses URL encoding for the password (@ became %40)
# DB Name: scrap_system (verified on VPS)
echo "Creating .env..."
cat > .env <<EOF
PORT=5000
JWT_SECRET=secretkey
EMAIL_USER=admin@powerbenz.com
EMAIL_PASS=tsehwvmowxblbbld
DATABASE_URL=mysql://root:MantraGDR%401008@127.0.0.1:3306/scrap_system
EOF

# Step 5: Web Setup (Build)
echo "--- Setting up Web / Frontend ---"
cd ../web
npm install
# Build the React/Vite app
npm run build

# Step 6: Start Application
echo "--- Starting Application with PM2 ---"
cd ../server

# Delete existing process if it exists
pm2 delete scrape_system || true

# Start new process
pm2 start index.js --name scrape_system

# Freeze process list for automatic respawn
pm2 save

# Ensure PM2 starts on boot (might fail if already setup, ignoring error)
pm2 startup || true

echo "--- Deployment Complete ---"
echo "Project deployed to: $DIR"
echo "Database: scrap_system"
echo "Process: scrape_system"
