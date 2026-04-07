@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONT=%ROOT%front"
set "LOGROOT=%ROOT%runlogs"
set "TMPROOT=%ROOT%tmp"

if not exist "%LOGROOT%" mkdir "%LOGROOT%"
if not exist "%TMPROOT%" mkdir "%TMPROOT%"

set "MVN="
where mvn.cmd >nul 2>nul && set "MVN=mvn.cmd"
if not defined MVN if exist "D:\develop\apache-maven-3.9.9-bin\apache-maven-3.9.9\bin\mvn.cmd" set "MVN=D:\develop\apache-maven-3.9.9-bin\apache-maven-3.9.9\bin\mvn.cmd"
if not defined MVN (
  echo [ERROR] Cannot find Maven. Please install Maven or set PATH.
  exit /b 1
)

set "NPM="
where npm.cmd >nul 2>nul && set "NPM=npm.cmd"
if not defined NPM if exist "D:\nodejs\npm.cmd" set "NPM=D:\nodejs\npm.cmd"
if not defined NPM (
  echo [ERROR] Cannot find npm. Please install Node.js or set PATH.
  exit /b 1
)

if not defined JAVA_HOME (
  for /f "delims=" %%D in ('dir /b /ad "D:\java\jdk*" 2^>nul') do (
    if not defined JAVA_HOME set "JAVA_HOME=D:\java\%%D"
  )
)
if defined JAVA_HOME (
  set "PATH=%JAVA_HOME%\bin;%PATH%"
)
set "TEMP=%TMPROOT%"
set "TMP=%TMPROOT%"
set "MAVEN_OPTS=-Djava.io.tmpdir=%TMPROOT%"

echo JAVA_HOME = %JAVA_HOME%
echo Maven    = %MVN%
echo npm      = %NPM%
echo.

call :start_service config-server
call :start_service user-service
call :start_service learning-content-service
call :start_service test-service
call :start_service api-gateway
call :start_front

echo.
echo All start commands have been submitted in background.
echo Logs directory: %LOGROOT%
echo View logs with: powershell -Command "Get-Content '%LOGROOT%\test-service.log' -Tail 80"
exit /b 0

:start_service
set "SVC=%~1"
set "SVCDIR=%BACKEND%\%SVC%"
if not exist "%SVCDIR%" (
  echo [WARN] Service directory not found: %SVCDIR%
  goto :eof
)
set "OUTLOG=%LOGROOT%\%SVC%.log"
set "ERRLOG=%LOGROOT%\%SVC%.err.log"
echo Starting service: %SVC%
start "%SVC%" /min cmd /c "cd /d "%SVCDIR%" && call "%MVN%" spring-boot:run 1>>"%OUTLOG%" 2>>"%ERRLOG%""
goto :eof

:start_front
if not exist "%FRONT%" (
  echo [WARN] Frontend directory not found: %FRONT%
  goto :eof
)
echo Starting frontend: front
start "front" /min cmd /c "cd /d "%FRONT%" && call "%NPM%" run dev 1>>"%LOGROOT%\front.log" 2>>"%LOGROOT%\front.err.log""
goto :eof
