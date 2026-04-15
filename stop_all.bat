@echo off
setlocal EnableExtensions

echo Stopping services on ports: 8888 8080 8081 8082 8083 3000
for %%P in (8888 8080 8081 8082 8083 3000) do (
  for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo Stopping PID %%I on port %%P
    taskkill /PID %%I /T /F >nul 2>nul
  )
)

echo Waiting ports to be released...
for %%P in (8888 8080 8081 8082 8083 3000) do (
  call :wait_port_free %%P 20
)

echo Done. Ports released.
exit /b 0

:wait_port_free
set "_port=%~1"
set "_timeout=%~2"
set /a "_i=0"
:wait_loop
set "_busy="
for /f "tokens=1,2,3,4,5" %%A in ('netstat -ano -p tcp ^| findstr /R /C:":%_port% " ') do (
  if /I "%%D"=="LISTENING" set "_busy=1"
)
if not defined _busy (
  echo   - %_port% free
  goto :eof
)
if %_i% GEQ %_timeout% (
  echo   - %_port% still busy (timeout)
  goto :eof
)
set /a "_i+=1"
timeout /t 1 >nul
goto :wait_loop
