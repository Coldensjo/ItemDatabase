@echo off
rem Removes the watcher from startup and stops it.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ItemDatabaseSync.vbs" 2>nul
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='bun.exe'\" | Where-Object { $_.CommandLine -like '*update.mjs --watch*' } | ForEach-Object { Stop-Process -Id $_.ProcessId }"
echo Removed from startup and stopped.
pause
