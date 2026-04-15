$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'backend'
$front = Join-Path $root 'front'
$logRoot = Join-Path $root 'runlogs'
$tmpRoot = Join-Path $root 'tmp'
$managedPorts = @(8888, 8080, 8081, 8082, 8083, 3000)

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

function Get-ListeningPids {
    param([int]$Port)
    $pids = New-Object System.Collections.Generic.HashSet[int]
    $lines = netstat -ano -p tcp | Select-String ":$Port "
    foreach ($line in $lines) {
        $parts = ($line.ToString() -split '\s+') | Where-Object { $_ -ne '' }
        if ($parts.Length -ge 5 -and $parts[3] -eq 'LISTENING') {
            $pidValue = 0
            if ([int]::TryParse($parts[4], [ref]$pidValue)) {
                $null = $pids.Add($pidValue)
            }
        }
    }
    return @($pids)
}

function Wait-PortFree {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds) {
        if (-not (Test-Listening -Port $Port)) { return $true }
        Start-Sleep -Milliseconds 600
    }
    return (-not (Test-Listening -Port $Port))
}

function Stop-ManagedPorts {
    param([int[]]$Ports)
    Write-Host 'Checking managed ports before startup...'
    foreach ($port in $Ports) {
        $pids = Get-ListeningPids -Port $port
        if (-not $pids.Count) {
            Write-Host "  - $port already free"
            continue
        }
        foreach ($pid in $pids) {
            Write-Host "  - stopping PID $pid on port $port"
            try {
                Start-Process -FilePath 'taskkill.exe' `
                    -ArgumentList '/PID', $pid, '/T', '/F' `
                    -NoNewWindow `
                    -Wait | Out-Null
            } catch {
                Write-Host "    taskkill failed for PID ${pid}: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
        if (Wait-PortFree -Port $port -TimeoutSeconds 20) {
            Write-Host "    -> port $port released"
        } else {
            Write-Host "    -> [WARN] port $port still busy after waiting" -ForegroundColor Yellow
        }
    }
}

function Reset-LogFile {
    param([string]$Path)
    if (Test-Path $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function Get-LogTail {
    param(
        [string]$Path,
        [int]$Tail = 12
    )
    if (-not (Test-Path $Path)) { return '' }
    try {
        return ((Get-Content -Path $Path -Encoding UTF8 -Tail $Tail -ErrorAction SilentlyContinue) -join [Environment]::NewLine)
    } catch {
        return ''
    }
}

function Wait-Listening {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 120,
        [string]$Name = '',
        $Process = $null,
        [string]$ErrLog = '',
        [string]$OutLog = ''
    )
    $nameLabel = if ($Name) { "$Name($Port)" } else { "$Port" }
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds) {
        if (Test-Listening -Port $Port) {
            Write-Host "  -> $nameLabel is LISTENING"
            return $true
        }
        if ($Process -and $Process.HasExited) {
            Write-Host "  -> [FAILED] $nameLabel exited before port became ready" -ForegroundColor Red
            $errTail = Get-LogTail -Path $ErrLog
            $outTail = Get-LogTail -Path $OutLog
            if ($errTail) {
                Write-Host '     stderr tail:' -ForegroundColor Yellow
                Write-Host $errTail
            } elseif ($outTail) {
                Write-Host '     stdout tail:' -ForegroundColor Yellow
                Write-Host $outTail
            }
            return $false
        }
        Start-Sleep -Milliseconds 800
    }
    Write-Host "  -> [TIMEOUT] $nameLabel not ready within ${TimeoutSeconds}s" -ForegroundColor Yellow
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
    Reset-LogFile -Path $outLog
    Reset-LogFile -Path $errLog
    Write-Host "Starting service: $Name"
    return Start-Process -FilePath $mvn `
        -ArgumentList 'spring-boot:run' `
        -WorkingDirectory $svcDir `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden `
        -PassThru
}

Stop-ManagedPorts -Ports $managedPorts
Write-Host ''
Write-Host 'Starting backend services in dependency order...'
$configProc = Start-BackendService -Name 'config-server'
if (-not (Wait-Listening -Port 8888 -TimeoutSeconds 150 -Name 'config-server' -Process $configProc -OutLog (Join-Path $logRoot 'config-server.log') -ErrLog (Join-Path $logRoot 'config-server.err.log'))) { exit 1 }

$userProc = Start-BackendService -Name 'user-service'
if (-not (Wait-Listening -Port 8081 -TimeoutSeconds 150 -Name 'user-service' -Process $userProc -OutLog (Join-Path $logRoot 'user-service.log') -ErrLog (Join-Path $logRoot 'user-service.err.log'))) { exit 1 }

$learningProc = Start-BackendService -Name 'learning-content-service'
if (-not (Wait-Listening -Port 8082 -TimeoutSeconds 150 -Name 'learning-content-service' -Process $learningProc -OutLog (Join-Path $logRoot 'learning-content-service.log') -ErrLog (Join-Path $logRoot 'learning-content-service.err.log'))) { exit 1 }

$testProc = Start-BackendService -Name 'test-service'
if (-not (Wait-Listening -Port 8083 -TimeoutSeconds 150 -Name 'test-service' -Process $testProc -OutLog (Join-Path $logRoot 'test-service.log') -ErrLog (Join-Path $logRoot 'test-service.err.log'))) { exit 1 }

$gatewayProc = Start-BackendService -Name 'api-gateway'
if (-not (Wait-Listening -Port 8080 -TimeoutSeconds 150 -Name 'api-gateway' -Process $gatewayProc -OutLog (Join-Path $logRoot 'api-gateway.log') -ErrLog (Join-Path $logRoot 'api-gateway.err.log'))) { exit 1 }

Write-Host 'Starting frontend: front'
$frontOutLog = Join-Path $logRoot 'front.log'
$frontErrLog = Join-Path $logRoot 'front.err.log'
Reset-LogFile -Path $frontOutLog
Reset-LogFile -Path $frontErrLog
$frontProc = Start-Process -FilePath $npm `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $front `
    -RedirectStandardOutput $frontOutLog `
    -RedirectStandardError $frontErrLog `
    -WindowStyle Hidden `
    -PassThru

if (-not (Wait-Listening -Port 3000 -TimeoutSeconds 90 -Name 'front' -Process $frontProc -OutLog $frontOutLog -ErrLog $frontErrLog)) { exit 1 }

Write-Host ''
Write-Host 'Port status:'
foreach ($p in $managedPorts) {
    $ok = Test-Listening -Port $p
    Write-Host (" - {0}: {1}" -f $p, ($(if ($ok) { 'LISTENING' } else { 'DOWN' })))
}

if (-not (Test-Listening -Port 3000)) {
    Write-Host ''
    Write-Host '[WARN] Frontend not listening on 3000. Check runlogs\front.err.log (common issue: vite/esbuild spawn EPERM).' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Logs directory: $logRoot"
