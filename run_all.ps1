$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Join-Path $root "backend"
$frontRoot = Join-Path $root "front"
$logRoot = Join-Path $root "runlogs"
$tmpRoot = Join-Path $root "tmp"

$services = @(
  "config-server",
  "user-service",
  "learning-content-service",
  "test-service",
  "api-gateway"
)

function Resolve-Maven {
  $cmd = Get-Command mvn.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "D:\develop\apache-maven-3.9.9-bin\apache-maven-3.9.9\bin\mvn.cmd"
  if (Test-Path $fallback) { return $fallback }
  throw "Cannot find Maven (mvn.cmd). Please install Maven or add it to PATH."
}

function Resolve-Npm {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "D:\nodejs\npm.cmd"
  if (Test-Path $fallback) { return $fallback }
  throw "Cannot find npm (npm.cmd). Please install Node.js or add npm to PATH."
}

function Resolve-JavaHome {
  $javaCmd = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($javaCmd) {
    return Split-Path (Split-Path $javaCmd.Source -Parent) -Parent
  }
  if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    return $env:JAVA_HOME
  }
  $jdkRoot = "D:\java"
  if (Test-Path $jdkRoot) {
    $jdk = Get-ChildItem $jdkRoot -Directory | Where-Object { $_.Name -like "jdk*" } | Select-Object -First 1
    if ($jdk) { return $jdk.FullName }
  }
  throw "Cannot find JDK. Set JAVA_HOME or place a JDK under D:\\java."
}

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null

$mvn = Resolve-Maven
$npm = Resolve-Npm
$javaHome = Resolve-JavaHome

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$env:TEMP = $tmpRoot
$env:TMP = $tmpRoot
$env:MAVEN_OPTS = "-Djava.io.tmpdir=$tmpRoot"

Write-Host "JAVA_HOME = $javaHome"
Write-Host "Maven    = $mvn"
Write-Host "npm      = $npm"
Write-Host ""

foreach ($svc in $services) {
  $svcDir = Join-Path $backendRoot $svc
  if (-not (Test-Path $svcDir)) {
    Write-Warning "Service directory not found: $svcDir"
    continue
  }

  $outLog = Join-Path $logRoot "$svc.log"
  $errLog = Join-Path $logRoot "$svc.err.log"

  Write-Host "Starting service: $svc"
  Start-Process -FilePath $mvn `
    -ArgumentList "spring-boot:run" `
    -WorkingDirectory $svcDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null
}

if (Test-Path $frontRoot) {
  $frontOut = Join-Path $logRoot "front.log"
  $frontErr = Join-Path $logRoot "front.err.log"
  Write-Host "Starting frontend: front"
  Start-Process -FilePath $npm `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $frontRoot `
    -RedirectStandardOutput $frontOut `
    -RedirectStandardError $frontErr `
    -WindowStyle Hidden | Out-Null
} else {
  Write-Warning "Frontend directory not found: $frontRoot"
}

Write-Host ""
Write-Host "All start commands have been submitted in background."
Write-Host "Logs directory: $logRoot"
Write-Host "View logs with: Get-Content $logRoot\\test-service.log -Tail 80"
