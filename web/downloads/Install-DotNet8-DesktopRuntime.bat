@echo off
title Install .NET 8 Desktop Runtime
echo This installs the .NET 8 Desktop Runtime required by the framework-dependent build.
where winget >nul 2>nul
if %errorlevel%==0 (
  winget install --id Microsoft.DotNet.DesktopRuntime.8 -e --accept-source-agreements --accept-package-agreements
) else (
  echo winget was not found. Download .NET 8 Desktop Runtime from https://dotnet.microsoft.com/download/dotnet/8.0
  start "" "https://dotnet.microsoft.com/download/dotnet/8.0"
)
pause
