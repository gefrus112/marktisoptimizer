@echo off
title Roptimzier V3
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 Roptimzier.py
) else (
  python Roptimzier.py
)
if %errorlevel% neq 0 pause
