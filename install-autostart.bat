@echo off
rem Starts the watcher hidden at every Windows login (and now). It rebuilds and publishes the site
rem when the game is patched or the game cache changes. The log is state\update.log.
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ItemDatabaseSync.vbs"
> "%VBS%" echo Set shell = CreateObject("WScript.Shell")
>> "%VBS%" echo shell.CurrentDirectory = "%~dp0tools"
>> "%VBS%" echo shell.Run "bun update.mjs --watch", 0, False
wscript "%VBS%"
echo Installed. The log is state\update.log
pause
