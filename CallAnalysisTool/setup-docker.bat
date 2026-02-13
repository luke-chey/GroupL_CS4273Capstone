@echo off
REM Call Analysis Tool - Docker Setup Script for Windows
REM Usage: setup-docker.bat [action]
REM Actions: build, start, stop, logs, clean, status

setlocal enabledelayedexpansion

REM Set colors and paths
set "WORKSPACE_ROOT=%~dp0"
set "PROJECT_NAME=callanalysistool"

REM Check action parameter
set "ACTION=%1"
if "!ACTION!"=="" set "ACTION=help"

REM ============================================================================
REM Functions
REM ============================================================================

:check_prerequisites
echo.
echo ============================================================
echo Checking Prerequisites
echo ============================================================
echo.

REM Check Docker
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    exit /b 1
)
echo [OK] Docker is installed

REM Check Docker daemon
docker version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon is not running
    echo Please start Docker Desktop
    exit /b 1
)
echo [OK] Docker daemon is running

REM Check Docker Compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose is not installed
    exit /b 1
)
echo [OK] Docker Compose is installed
echo.
exit /b 0

:build_images
echo.
echo ============================================================
echo Building Docker Images
echo ============================================================
echo [WARNING] This may take 30-60 minutes
echo.
echo Building backend image...
cd /d "%WORKSPACE_ROOT%"
docker-compose build backend
if errorlevel 1 (
    echo [ERROR] Backend build failed
    exit /b 1
)
echo [OK] Backend image built successfully
echo.

echo Building frontend image...
docker-compose build frontend
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    exit /b 1
)
echo [OK] Frontend image built successfully
echo.
echo All images built successfully!
echo.
exit /b 0

:start_services
echo.
echo ============================================================
echo Starting Services
echo ============================================================
echo.
cd /d "%WORKSPACE_ROOT%"
docker-compose up -d
if errorlevel 1 (
    echo [ERROR] Failed to start containers
    exit /b 1
)
echo [OK] Containers are starting...
echo.
echo Waiting for services to be ready (this may take 1-2 minutes)...
timeout /t 10 /nobreak
echo.
echo Checking backend health...
setlocal enabledelayedexpansion
for /l %%i in (1,1,30) do (
    curl -s http://localhost:5001/api/health >nul 2>&1
    if errorlevel 0 (
        echo [OK] Backend is healthy
        goto :backend_ready
    )
    timeout /t 10 /nobreak
)
echo [ERROR] Backend health check timed out after 5 minutes
echo Check logs with: docker-compose logs backend
exit /b 1

:backend_ready
echo.
echo All services started successfully!
echo.
echo Frontend:    http://localhost:3000
echo Backend API: http://localhost:5001
echo Ollama:      http://localhost:11434
echo.
exit /b 0

:stop_services
echo.
echo ============================================================
echo Stopping Services
echo ============================================================
echo.
cd /d "%WORKSPACE_ROOT%"
docker-compose down
if errorlevel 1 (
    echo [ERROR] Failed to stop containers
    exit /b 1
)
echo [OK] Services stopped
echo.
exit /b 0

:show_status
echo.
echo ============================================================
echo Docker Compose Status
echo ============================================================
echo.
cd /d "%WORKSPACE_ROOT%"
docker-compose ps
echo.
exit /b 0

:show_logs
echo.
echo ============================================================
echo Service Logs
echo ============================================================
echo [INFO] Showing logs (Ctrl+C to exit)
echo [INFO] Use 'docker-compose logs backend' or 'docker-compose logs frontend' for specific services
echo.
cd /d "%WORKSPACE_ROOT%"
docker-compose logs -f
exit /b 0

:clean_everything
echo.
echo ============================================================
echo Cleaning Up
echo ============================================================
echo.
echo [WARNING] This will:
echo   - Stop all containers
echo   - Remove all containers
echo   - Remove all volumes (DATA WILL BE LOST)
echo.
set /p confirm="Are you sure? Type 'yes' to confirm: "
if /i not "!confirm!"=="yes" (
    echo [INFO] Cleanup cancelled
    exit /b 0
)
cd /d "%WORKSPACE_ROOT%"
docker-compose down -v
echo [OK] All containers and volumes removed
echo.
exit /b 0

:show_usage
echo.
echo Call Analysis Tool - Docker Setup Script
echo.
echo Usage: setup-docker.bat [action]
echo.
echo Actions:
echo   build  - Build Docker images (30-60 min, download ML models)
echo   start  - Start all services
echo   stop   - Stop all services
echo   status - Show container status
echo   logs   - Show live service logs
echo   clean  - Stop and remove all containers/volumes
echo   help   - Show this help message
echo.
echo Examples:
echo   REM Initial setup
echo   setup-docker.bat build
echo   setup-docker.bat start
echo.
echo   REM Monitor services
echo   setup-docker.bat status
echo   setup-docker.bat logs
echo.
echo   REM Shutdown
echo   setup-docker.bat stop
echo.
echo Notes:
echo   * First build will take 30-60 minutes
echo   * Requires ~20GB disk space
echo   * Requires Docker and Docker Compose installed
echo   * Run from the project root directory
echo.
echo Troubleshooting:
echo   * Build timeout: Check Docker Desktop resources
echo   * Port conflicts: Stop other services using ports 3000, 5001, 11434
echo   * Container fails: Check logs with: docker-compose logs [service]
echo.
exit /b 0

REM ============================================================================
REM Main Script
REM ============================================================================

:main
if /i "!ACTION!"=="build" (
    call :check_prerequisites
    if errorlevel 1 exit /b 1
    call :build_images
    exit /b !errorlevel!
)

if /i "!ACTION!"=="start" (
    call :check_prerequisites
    if errorlevel 1 exit /b 1
    call :start_services
    exit /b !errorlevel!
)

if /i "!ACTION!"=="stop" (
    call :stop_services
    exit /b !errorlevel!
)

if /i "!ACTION!"=="status" (
    call :show_status
    exit /b !errorlevel!
)

if /i "!ACTION!"=="logs" (
    call :show_logs
    exit /b !errorlevel!
)

if /i "!ACTION!"=="clean" (
    call :clean_everything
    exit /b !errorlevel!
)

if /i "!ACTION!"=="help" (
    call :show_usage
    exit /b 0
)

echo [ERROR] Unknown action: !ACTION!
echo.
call :show_usage
exit /b 1
