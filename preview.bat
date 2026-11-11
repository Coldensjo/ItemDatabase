@echo off
rem Builds the item data without publishing and opens the site locally. Close the window to stop.
cd /d "%~dp0tools"
bun update.mjs --no-push
start "" http://localhost:8377
bun serve.mjs
