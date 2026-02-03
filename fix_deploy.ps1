$VPS_IP = "145.223.22.204"
$VPS_USER = "root"
$PASSWORD = "MantraGDR@1008"

Write-Host "--- A G I   D E P L O Y   V 2 ---" -ForegroundColor Cyan
Write-Host "Fixing Deployment Path Issues..." -ForegroundColor Cyan

# 1. Package
Write-Host "Step 1: Packaging..." -ForegroundColor Yellow
if (Test-Path "temp_deploy") { Remove-Item "temp_deploy" -Recurse -Force }
New-Item -ItemType Directory -Force -Path "temp_deploy" | Out-Null
Copy-Item -Path "server" -Destination "temp_deploy" -Recurse
if (Test-Path "temp_deploy\server\node_modules") { Remove-Item "temp_deploy\server\node_modules" -Recurse -Force }
Copy-Item -Path "web" -Destination "temp_deploy" -Recurse
if (Test-Path "temp_deploy\web\node_modules") { Remove-Item "temp_deploy\web\node_modules" -Recurse -Force }
Compress-Archive -Path "temp_deploy\*" -DestinationPath "project_deploy.zip" -Force
Remove-Item "temp_deploy" -Recurse -Force

# 2. Upload to /tmp/ (Safe location)
Write-Host "Step 2: Uploading to /tmp/ on VPS..." -ForegroundColor Yellow
Write-Host "PASSWORD IS: $PASSWORD" -ForegroundColor Magenta
Write-Host "Please Enter Password TWICE..." -ForegroundColor White

# Upload Zip to /tmp
scp project_deploy.zip ${VPS_USER}@${VPS_IP}:/tmp/project_deploy.zip

# Upload Script to /tmp
scp vps_fix.sh ${VPS_USER}@${VPS_IP}:/tmp/vps_fix.sh

# 3. Execute
Write-Host "Step 3: Executing Update..." -ForegroundColor Yellow
Write-Host "PASSWORD IS: $PASSWORD" -ForegroundColor Magenta
Write-Host "Please Enter Password..." -ForegroundColor White

ssh ${VPS_USER}@${VPS_IP} "sed -i 's/\r$//' /tmp/vps_fix.sh && chmod +x /tmp/vps_fix.sh && /tmp/vps_fix.sh"

Write-Host "--- DONE! Check http://${VPS_IP}:5000 ---" -ForegroundColor Green
