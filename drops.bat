@echo off
rem Reads which creatures and chests drop each item from the VMaNGOS database (it must be running)
rem into tools\data\drops.json. Commit that file, then run update.bat to publish.
cd /d "%~dp0tools"
bun drops.mjs
pause
