$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'backend'
$front = Join-Path $root 'front'
$logRoot = Join-Path $root 'runlogs'
$tmpRoot = Join-Path $root 'tmp'

New-Item -ItemType Directory -Force -Path $logRoot, $tmpRoot | Out-Null

function Resolve-CmdPath {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [string]$FallbackPath
    )
    $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if ($FallbackPath -and (Test-Path $FallbackPath)) { return $FallbackPath }
    return $null
}

function Test-Listening {
    param([int]$Port)
    $lines = netstat -ano -p tcp | Select-String ":$Port "
    foreach ($line in $lines) {
        $parts = ($line.ToString() -split '\s+') | Where-Object { $_ -ne '' }
        if ($parts.Length -ge 5 -and $parts[3] -eq 'LISTENING') { return $true }
    }
    return $false
}

$mvn = Resolve-CmdPath -CommandName 'mvn.cmd' -FallbackPath 'D:\develop\apache-maven-3.9.9-bin\apache-maven-3.9.9\bin\mvn.cmd'
if (-not $mvn) {
    Write-Host '[ERROR] Cannot find Maven (mvn.cmd).' -ForegroundColor Red
    exit 1
}

$npm = Resolve-CmdPath -CommandName 'npm.cmd' -FallbackPath 'D:\nodejs\npm.cmd'
if (-not $npm) {
    Write-Host '[ERROR] Cannot find npm (npm.cmd).' -ForegroundColor Red
    exit 1
}

if (-not $env:JAVA_HOME) {
    $jdk = Get-ChildItem 'D:\java' -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'jdk*' } |
        Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}

if ($env:JAVA_HOME) {
    $env:PATH = "$($env:JAVA_HOME)\bin;$($env:PATH)"
}

$env:TEMP = $tmpRoot
$env:TMP = $tmpRoot
$env:MAVEN_OPTS = "-Djava.io.tmpdir=$tmpRoot"

Write-Host "JAVA_HOME = $($env:JAVA_HOME)"
Write-Host "Maven    = $mvn"
Write-Host "npm      = $npm"
Write-Host ''

function Start-BackendService {
    param([Parameter(Mandatory = $true)][string]$Name)
    $svcDir = Join-Path $backend $Name
    if (-not (Test-Path $svcDir)) {
        Write-Host "[WARN] Service directory not found: $svcDir" -ForegroundColor Yellow
        return
    }
    $outLog = Join-Path $logRoot "$Name.log"
    $errLog = Join-Path $logRoot "$Name.err.log"
    Write-Host "Starting service: $Name"
    Start-Process -FilePath $mvn `
        -ArgumentList 'spring-boot:run' `
        -WorkingDirectory $svcDir `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden | Out-Null
}

foreach ($svc in @('config-server', 'user-service', 'learning-content-service', 'test-service', 'api-gateway')) {
    Start-BackendService -Name $svc
}

Write-Host 'Starting frontend: front'
Start-Process -FilePath $npm `
    -ArgumentList 'run', 'dev', '--', '--host=0.0.0.0', '--port=3000' `
    -WorkingDirectory $front `
    -RedirectStandardOutput (Join-Path $logRoot 'front.log') `
    -RedirectStandardError (Join-Path $logRoot 'front.err.log') `
    -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 35

Write-Host ''
Write-Host 'Port status:'
$ports = @(8888, 8080, 8081, 8082, 8083, 3000)
foreach ($p in $ports) {
    $ok = Test-Listening -Port $p
    Write-Host (" - {0}: {1}" -f $p, ($(if ($ok) { 'LISTENING' } else { 'DOWN' })))
}

if (-not (Test-Listening -Port 3000)) {
    Write-Host ''
    Write-Host '[WARN] Frontend not listening on 3000. Check runlogs\front.err.log (common issue: vite/esbuild spawn EPERM).' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Logs directory: $logRoot"
