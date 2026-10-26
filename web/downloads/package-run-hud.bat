@echo off
title Roptimer HUD
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 roptimer_hud.py --settings hud-settings.json
) else (
  python roptimer_hud.py --settings hud-settings.json
)
if %errorlevel% neq 0 pause
