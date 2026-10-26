@echo off
title Roptimer Boost CLI
cd /d "%~dp0"
if exist "RoptimerBoost.exe" (
  "RoptimerBoost.exe" %*
) else (
  echo RoptimerBoost.exe was not found in this folder.
)
if %errorlevel% neq 0 pause
