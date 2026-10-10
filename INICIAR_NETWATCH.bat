@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python server.py
  ) else (
    echo NETWATCH 404 necesita Python 3 instalado.
    echo https://www.python.org/downloads/windows/
    pause
  )
)
