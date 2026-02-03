@echo off
echo --- Pushing to GitHub ---
echo.
echo IMPORTANT: You are pushing as user 'mantracode1008'.
echo If a window pops up, please sign in as 'mantracode1008'.
echo.
echo If it fails with "Permission denied", you may need to clear your Windows Credentials for GitHub.
echo.
git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo Push Failed. 
    echo Try running: "cmdkey /delete:git:https://github.com" in a terminal if the wrong account is being used.
    echo Then try this script again.
)
pause
