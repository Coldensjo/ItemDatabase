@echo off
rem Copies the Item Harvest addon into the game. Restart the game or /reload afterwards.
cd /d "%~dp0tools"
bun addon.mjs
pause
