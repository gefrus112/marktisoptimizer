@echo off
title Roptimer Hub V3
cd /d "%~dp0"
if exist "Roptimer.exe" (
  start "" "Roptimer.exe"
) else (
  echo Roptimer.exe was not found in this folder. Download Roptimer-Windows-x64.zip.
  pause
)
