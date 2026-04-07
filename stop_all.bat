@echo off
setlocal EnableExtensions

echo Stopping services on ports: 8888 8080 8081 8082 8083 3000
for %%P in (8888 8080 8081 8082 8083 3000) do (
  for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo Stopping PID %%I on port %%P
    taskkill /PID %%I /F >nul 2>nul
  )
)

echo Done.
exit /b 0
