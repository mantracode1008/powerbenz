$VPS_IP = "145.223.22.204"
$VPS_USER = "root"
$PASSWORD = "MantraGDR@1008"

Write-Host "--- A G I   D E P L O Y M E N T   S Y S T E M ---" -ForegroundColor Cyan
Write-Host "Auto-Building and Deploying to $VPS_IP..." -ForegroundColor Cyan

# 0. Build Web
Write-Host "Step 0: Building Frontend..." -ForegroundColor Yellow
Set-Location "web"
npm install
npm run build
Set-Location ".."

# 1. Package
Write-Host "Step 1: Packaging (Creating Clean Zip)..." -ForegroundColor Yellow
if (Test-Path "temp_deploy") { Remove-Item "temp_deploy" -Recurse -Force }
New-Item -ItemType Directory -Force -Path "temp_deploy" | Out-Null

Write-Host "   Copying Server..." -ForegroundColor Gray
Copy-Item -Path "server" -Destination "temp_deploy" -Recurse
if (Test-Path "temp_deploy\server\node_modules") { Remove-Item "temp_deploy\server\node_modules" -Recurse -Force }

Write-Host "   Copying Web..." -ForegroundColor Gray
Copy-Item -Path "web" -Destination "temp_deploy" -Recurse
if (Test-Path "temp_deploy\web\node_modules") { Remove-Item "temp_deploy\web\node_modules" -Recurse -Force }

Write-Host "   Zipping..." -ForegroundColor Gray
Compress-Archive -Path "temp_deploy\*" -DestinationPath "project_deploy.zip" -Force
Remove-Item "temp_deploy" -Recurse -Force

Write-Host "Package Created: project_deploy.zip" -ForegroundColor Green

# 2. Upload Files
Write-Host "Step 2: Uploading Deployment Package & Script..." -ForegroundColor Yellow
Write-Host "PASSWORD IS: $PASSWORD" -ForegroundColor Magenta
Write-Host "(Please Enter Password when prompted)" -ForegroundColor White

# Upload Zip
scp project_deploy.zip ${VPS_USER}@${VPS_IP}:/root/

# Upload Script
scp vps_setup.sh ${VPS_USER}@${VPS_IP}:/root/

# 3. SSH and Execute
Write-Host "Step 3: Connecting to VPS to Install..." -ForegroundColor Yellow
Write-Host "PASSWORD IS: $PASSWORD" -ForegroundColor Magenta
Write-Host "(Please Enter Password when prompted)" -ForegroundColor White

# Fix line endings just in case and run
ssh ${VPS_USER}@${VPS_IP} "sed -i 's/\r$//' vps_setup.sh && chmod +x vps_setup.sh && ./vps_setup.sh"

Write-Host "--- Deployment Finished! ---" -ForegroundColor Green
Write-Host "Verify at http://${VPS_IP}:5000" -ForegroundColor Green
