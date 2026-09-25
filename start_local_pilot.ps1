$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$frontendIndex = Join-Path $projectRoot "frontend\dist\index.html"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Не найдено виртуальное окружение .venv. Выполните установку по README."
}

if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
    throw "Порт 8000 уже занят. Закройте запущенный сервер или используйте его."
}

if (-not (Test-Path -LiteralPath $frontendIndex)) {
    Write-Host "Frontend build отсутствует — собираю..." -ForegroundColor Yellow
    $env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
    & npm.cmd --prefix (Join-Path $projectRoot "frontend") run build
    if ($LASTEXITCODE -ne 0) { throw "Не удалось собрать frontend." }
}

$network = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
    Select-Object -First 1
$lanIp = if ($network) { $network.IPv4Address.IPAddress } else {
    (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
        Select-Object -First 1).IPAddress
}

if (-not $lanIp) { $lanIp = "<IP-НОУТБУКА>" }

Push-Location (Join-Path $projectRoot "backend")
try {
    & $python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Alembic migration завершилась с ошибкой." }

    Write-Host ""
    Write-Host "QueueFlow MAI запущен для локального пилота" -ForegroundColor Green
    Write-Host "Ноутбук: http://127.0.0.1:8000"
    Write-Host "Телефоны в той же Wi-Fi сети: http://${lanIp}:8000" -ForegroundColor Cyan
    Write-Host "Health: http://${lanIp}:8000/api/health"
    Write-Host "Не закрывайте это окно до конца пилота. Для остановки нажмите Ctrl+C."
    Write-Host ""

    & $python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
} finally {
    Pop-Location
}
