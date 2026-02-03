@echo off
start /min cmd /k "cd server && npm start"
start /min cmd /k "cd web && npm run dev"
