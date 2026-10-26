param(
  [string] $Configuration = "Release",
  [string] $Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root
$solution = Join-Path $root "Roptimer.sln"
$artifacts = Join-Path $root "artifacts"
$publish = Join-Path $artifacts "publish"
$package = Join-Path $artifacts "Roptimer-Windows-x64.zip"
$sourceZip = Join-Path $artifacts "Roptimer-DotNet-Source.zip"

Remove-Item -Recurse -Force $artifacts -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $publish | Out-Null

Write-Host "== Restoring ==" -ForegroundColor Cyan
dotnet restore $solution
Write-Host "== Building ==" -ForegroundColor Cyan
dotnet build $solution -c $Configuration --no-restore
Write-Host "== Self-test ==" -ForegroundColor Cyan
dotnet run --project (Join-Path $root "src/Roptimer.Cli/Roptimer.Cli.csproj") -c $Configuration -- self-test
Write-Host "== Publishing WPF app ==" -ForegroundColor Cyan
dotnet publish (Join-Path $root "src/Roptimer.App/Roptimer.App.csproj") -c $Configuration -r $Runtime --self-contained false --no-restore -o $publish
Write-Host "== Publishing Boost CLI ==" -ForegroundColor Cyan
dotnet publish (Join-Path $root "src/Roptimer.Cli/Roptimer.Cli.csproj") -c $Configuration -r $Runtime --self-contained false --no-restore -o $publish

Copy-Item (Join-Path $repo "feature-status.json") (Join-Path $publish "feature-status.json")
Copy-Item (Join-Path $root "RoptimerBoost.bat") (Join-Path $publish "RoptimerBoost.bat")
Copy-Item (Join-Path $root "Run Roptimer.bat") (Join-Path $publish "Run Roptimer.bat")
Copy-Item (Join-Path $root "Install-DotNet8-DesktopRuntime.bat") (Join-Path $publish "Install-DotNet8-DesktopRuntime.bat")
Copy-Item (Join-Path $root "Roptimer Boost Commands.txt") (Join-Path $publish "Roptimer Boost Commands.txt")
Copy-Item (Join-Path $root "LICENSE") (Join-Path $publish "LICENSE.txt")
Copy-Item (Join-Path $root "THIRD_PARTY_NOTICES.md") (Join-Path $publish "THIRD_PARTY_NOTICES.md")
Copy-Item (Join-Path $root "README.md") (Join-Path $publish "README.md")
Copy-Item (Join-Path $repo "web/assets/icons/roptimzier-shield.png") (Join-Path $publish "RoptimerShield.png")

Compress-Archive -Path (Join-Path $publish "*") -DestinationPath $package -Force

$sourceFiles = @(
  "dotnet/Roptimer.sln",
  "dotnet/Directory.Build.props",
  "dotnet/build-windows.ps1",
  "dotnet/build-windows.bat",
  "dotnet/RoptimerBoost.bat",
  "dotnet/Run Roptimer.bat",
  "dotnet/Install-DotNet8-DesktopRuntime.bat",
  "dotnet/Roptimer Boost Commands.txt",
  "dotnet/LICENSE",
  "dotnet/THIRD_PARTY_NOTICES.md",
  "dotnet/README.md",
  "dotnet/src",
  "feature-status.json",
  ".github/workflows/build-windows.yml",
  "web/assets/lumina-hero.png",
  "web/assets/icons/roptimzier-shield.png",
  "web/assets/icons/roptimzier-shield.ico"
)
$stage = Join-Path $artifacts "source-stage"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($relative in $sourceFiles) {
  $source = Join-Path $repo $relative
  if (Test-Path $source) {
    $destination = Join-Path $stage $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -Recurse -Force $source $destination
  }
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $sourceZip -Force

$hashes = Get-ChildItem $artifacts -Filter "*.zip" | ForEach-Object {
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
}
$hashes | Set-Content -Encoding UTF8 (Join-Path $artifacts "SHA256SUMS.txt")
Write-Host "== Done ==" -ForegroundColor Cyan
Get-ChildItem $artifacts | Select-Object Name, Length | Format-Table -AutoSize
