#!/bin/bash
set -e

# Update and Install Dependencies
echo "Step 1: Updating System..."
sudo apt-get update
sudo apt-get install -y nodejs npm unzip mysql-server

# Install PM2 (Process Manager)
echo "Step 2: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# Setup Directory
echo "Step 3: Setting up Project Directory..."
mkdir -p /var/www/scrape
# Move zip if it was uploaded to /root/ or current dir
if [ -f "project_deploy.zip" ]; then
    mv project_deploy.zip /var/www/scrape/
fi

cd /var/www/scrape

# Unzip
echo "Step 4: Unzipping Files..."
if [ -f "project_deploy.zip" ]; then
    unzip -o project_deploy.zip
    rm project_deploy.zip
else
    echo "Warning: project_deploy.zip not found in /var/www/scrape/"
fi

# Server Setup
echo "Step 5: Installing Server Dependencies..."
cd server
npm install --production

# Create .env file (Ensuring correct credentials)
echo "Creating .env configuration..."
cat > .env <<EOF
PORT=5000
JWT_SECRET=secretkey
EMAIL_USER=admin@powerbenz.com
EMAIL_PASS=tsehwvmowxblbbld
DATABASE_URL=mysql://root:MantraGDR%401008@127.0.0.1:3306/scrap_system
EOF

# Database Setup (Basic Check)
echo "Step 6: MySQL Setup..."
sudo service mysql start

# PM2 Start
echo "Step 7: Starting Server with PM2..."
pm2 delete scrape_system || true
pm2 start index.js --name scrape_system
pm2 save
pm2 startup

echo "Deployment Complete! API running on port 5000."
