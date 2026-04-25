@echo off
echo ============================================
echo   CodeVault IPFS Private Network Setup
echo ============================================
echo.

REM Check if ipfs is available
where ipfs >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] IPFS (Kubo) is not installed or not in PATH.
    echo Download from: https://docs.ipfs.tech/install/command-line/#windows
    echo After installing, add the Kubo directory to your PATH.
    exit /b 1
)

echo [INFO] IPFS version:
ipfs --version
echo.

REM ============ Initialize Node 1 ============
echo [STEP 1/4] Initializing Node 1...
if exist "node1\config" (
    echo   Node 1 already initialized. Skipping.
) else (
    if not exist "node1" mkdir node1
    set IPFS_PATH=%~dp0node1
    ipfs init
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to initialize Node 1
        exit /b 1
    )
    echo   Node 1 initialized successfully.
)
echo.

REM ============ Configure Node 1 Ports ============
echo [STEP 2/4] Configuring Node 1 ports...
set IPFS_PATH=%~dp0node1
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080
ipfs config --json Addresses.Swarm "[\"/ip4/0.0.0.0/tcp/4001\", \"/ip4/0.0.0.0/udp/4001/quic-v1\"]"
REM Disable mDNS so nodes only discover each other via explicit connect
ipfs config --json Discovery.MDNS.Enabled false
REM Remove default bootstrap nodes (private network)
ipfs bootstrap rm --all
echo   Node 1 configured (API:5001, Gateway:8080, Swarm:4001)
echo.

REM ============ Initialize Node 2 ============
echo [STEP 3/4] Initializing Node 2...
if exist "node2\config" (
    echo   Node 2 already initialized. Skipping.
) else (
    if not exist "node2" mkdir node2
    set IPFS_PATH=%~dp0node2
    ipfs init
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to initialize Node 2
        exit /b 1
    )
    echo   Node 2 initialized successfully.
)
echo.

REM ============ Configure Node 2 Ports (different from Node 1) ============
echo [STEP 4/4] Configuring Node 2 ports...
set IPFS_PATH=%~dp0node2
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5002
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8081
ipfs config --json Addresses.Swarm "[\"/ip4/0.0.0.0/tcp/4002\", \"/ip4/0.0.0.0/udp/4002/quic-v1\"]"
ipfs config --json Discovery.MDNS.Enabled false
ipfs bootstrap rm --all
echo   Node 2 configured (API:5002, Gateway:8081, Swarm:4002)
echo.

REM ============ Copy Swarm Key to Both Nodes ============
echo [INFO] Copying swarm.key to both nodes...
copy /Y "%~dp0swarm.key" "%~dp0node1\swarm.key" >nul
copy /Y "%~dp0swarm.key" "%~dp0node2\swarm.key" >nul
echo   swarm.key copied to node1/ and node2/
echo.

echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Start Node 1:  set IPFS_PATH=%~dp0node1 ^&^& ipfs daemon
echo   2. Start Node 2:  set IPFS_PATH=%~dp0node2 ^&^& ipfs daemon
echo   3. Get Node 1 ID: set IPFS_PATH=%~dp0node1 ^&^& ipfs id -f="<id>"
echo   4. Connect Node 2 to Node 1:
echo      set IPFS_PATH=%~dp0node2 ^&^& ipfs swarm connect /ip4/127.0.0.1/tcp/4001/p2p/^<NODE1_ID^>
echo.
pause
