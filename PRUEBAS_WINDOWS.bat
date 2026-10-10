@echo off
setlocal
cd /d "%~dp0"
echo [NETWATCH 404] Pruebas de servidor...
py -3 test_server.py || goto fail
echo [NETWATCH 404] Validacion de capturas...
py -3 test_capture.py || goto fail
echo [NETWATCH 404] Monitor...
py -3 test_monitor.py || goto fail
py -3 test_monitor_storage.py || goto fail
where node >nul 2>&1
if errorlevel 1 (
  echo [INFO] Node.js no encontrado; pruebas JavaScript opcionales omitidas.
) else (
  node --check analytics.js || goto fail
  node test_logic.js || goto fail
  node test_router.js || goto fail
  node test_map.js || goto fail
)
echo.
echo [OK] Pruebas automatizadas terminadas. Pendiente QA visual y PowerShell reales.
pause
exit /b 0
:fail
echo.
echo [ERROR] Una prueba ha fallado. No publiques como stable.
pause
exit /b 1
