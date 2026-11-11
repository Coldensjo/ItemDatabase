@echo off
rem Builds the item data from the game files and publishes the website.
cd /d "%~dp0tools"
bun update.mjs
pause
