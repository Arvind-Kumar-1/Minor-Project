# ============================================
#   CodeVault IPFS Private Network Setup
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CodeVault IPFS Private Network Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if ipfs is available
$ipfsPath = Get-Command ipfs -ErrorAction SilentlyContinue
if (-not $ipfsPath) {
    Write-Host "[ERROR] IPFS (Kubo) is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Download from: https://docs.ipfs.tech/install/command-line/#windows"
    Write-Host "After installing, add the Kubo directory to your PATH."
    exit 1
}

Write-Host "[INFO] IPFS version:" -ForegroundColor Green
ipfs --version
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ============ Initialize Node 1 ============
Write-Host "[STEP 1/4] Initializing Node 1..." -ForegroundColor Yellow
$node1Path = Join-Path $scriptDir "node1"
if (Test-Path (Join-Path $node1Path "config")) {
    Write-Host "  Node 1 already initialized. Skipping." -ForegroundColor Gray
} else {
    if (-not (Test-Path $node1Path)) { New-Item -ItemType Directory -Path $node1Path | Out-Null }
    $env:IPFS_PATH = $node1Path
    ipfs init
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to initialize Node 1" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Node 1 initialized successfully." -ForegroundColor Green
}
Write-Host ""

# ============ Configure Node 1 Ports ============
Write-Host "[STEP 2/4] Configuring Node 1 ports..." -ForegroundColor Yellow
$env:IPFS_PATH = $node1Path
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080
ipfs config --json Addresses.Swarm '["/ip4/0.0.0.0/tcp/4001", "/ip4/0.0.0.0/udp/4001/quic-v1"]'
ipfs config --json Discovery.MDNS.Enabled false
ipfs bootstrap rm --all
Write-Host "  Node 1 configured (API:5001, Gateway:8080, Swarm:4001)" -ForegroundColor Green
Write-Host ""

# ============ Initialize Node 2 ============
Write-Host "[STEP 3/4] Initializing Node 2..." -ForegroundColor Yellow
$node2Path = Join-Path $scriptDir "node2"
if (Test-Path (Join-Path $node2Path "config")) {
    Write-Host "  Node 2 already initialized. Skipping." -ForegroundColor Gray
} else {
    if (-not (Test-Path $node2Path)) { New-Item -ItemType Directory -Path $node2Path | Out-Null }
    $env:IPFS_PATH = $node2Path
    ipfs init
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to initialize Node 2" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Node 2 initialized successfully." -ForegroundColor Green
}
Write-Host ""

# ============ Configure Node 2 Ports (different from Node 1) ============
Write-Host "[STEP 4/4] Configuring Node 2 ports..." -ForegroundColor Yellow
$env:IPFS_PATH = $node2Path
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5002
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8081
ipfs config --json Addresses.Swarm '["/ip4/0.0.0.0/tcp/4002", "/ip4/0.0.0.0/udp/4002/quic-v1"]'
ipfs config --json Discovery.MDNS.Enabled false
ipfs bootstrap rm --all
Write-Host "  Node 2 configured (API:5002, Gateway:8081, Swarm:4002)" -ForegroundColor Green
Write-Host ""

# ============ Copy Swarm Key to Both Nodes ============
Write-Host "[INFO] Copying swarm.key to both nodes..." -ForegroundColor Yellow
$swarmKeyPath = Join-Path $scriptDir "swarm.key"
Copy-Item -Path $swarmKeyPath -Destination (Join-Path $node1Path "swarm.key") -Force
Copy-Item -Path $swarmKeyPath -Destination (Join-Path $node2Path "swarm.key") -Force
Write-Host "  swarm.key copied to node1/ and node2/" -ForegroundColor Green
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start Node 1:" -ForegroundColor Gray
Write-Host "     `$env:IPFS_PATH = '$node1Path'; ipfs daemon" -ForegroundColor DarkGray
Write-Host "  2. Start Node 2 (new terminal):" -ForegroundColor Gray
Write-Host "     `$env:IPFS_PATH = '$node2Path'; ipfs daemon" -ForegroundColor DarkGray
Write-Host "  3. Get Node 1 ID:" -ForegroundColor Gray
Write-Host "     `$env:IPFS_PATH = '$node1Path'; ipfs id -f='<id>'" -ForegroundColor DarkGray
Write-Host "  4. Connect Node 2 to Node 1:" -ForegroundColor Gray
Write-Host "     `$env:IPFS_PATH = '$node2Path'; ipfs swarm connect /ip4/127.0.0.1/tcp/4001/p2p/<NODE1_ID>" -ForegroundColor DarkGray
Write-Host ""
