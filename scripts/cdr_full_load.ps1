#Requires -Version 5.1
<#
.SYNOPSIS
    CDR Full Load — EWB datavault-dev
    Source: ewb/cdr/udrs/merged/ (9.4M rows)

.DESCRIPTION
    1. stage_external_sources  — External Table auf merged/ umstellen
    2. psa_rsn_mobile_cdr_main — PSA Full-Refresh
    3. Vault Full-Refresh      — alle 14 CDR/Vertrag-Modelle

.USAGE
    .\scripts\cdr_full_load.ps1
    .\scripts\cdr_full_load.ps1 -Target ewb        # Produktion
    .\scripts\cdr_full_load.ps1 -StepFrom 3        # ab Schritt 3 fortsetzen
#>

param(
    [string]$Target    = "ewb-dev",
    [int]   $StepFrom  = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Paths ──────────────────────────────────────────────────────────────────
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$LogDir     = Join-Path $ProjectDir "logs"
$LogFile    = Join-Path $LogDir ("cdr_full_load_{0}_{1}.log" -f $Target, (Get-Date -Format "yyyyMMdd_HHmmss"))

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# ── Helpers ────────────────────────────────────────────────────────────────
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

function Invoke-Dbt {
    param([string]$Args, [string]$StepName)
    Write-Log "START: $StepName"
    Write-Log "CMD:   dbt $Args"

    $start = Get-Date
    $proc  = Start-Process -FilePath "dbt" `
                           -ArgumentList $Args `
                           -WorkingDirectory $ProjectDir `
                           -NoNewWindow -PassThru -Wait `
                           -RedirectStandardOutput "$env:TEMP\dbt_stdout.txt" `
                           -RedirectStandardError  "$env:TEMP\dbt_stderr.txt"

    $elapsed = [int](New-TimeSpan -Start $start -End (Get-Date)).TotalSeconds

    # Append stdout/stderr to log
    if (Test-Path "$env:TEMP\dbt_stdout.txt") {
        Get-Content "$env:TEMP\dbt_stdout.txt" | ForEach-Object { Add-Content -Path $LogFile -Value "  | $_" }
    }
    if (Test-Path "$env:TEMP\dbt_stderr.txt") {
        $errContent = Get-Content "$env:TEMP\dbt_stderr.txt" -Raw
        if ($errContent.Trim()) {
            Add-Content -Path $LogFile -Value "  [STDERR] $errContent"
        }
    }

    if ($proc.ExitCode -ne 0) {
        Write-Log "FAILED: $StepName (exit $($proc.ExitCode), ${elapsed}s)" "ERROR"
        Write-Log "Log: $LogFile" "ERROR"
        exit $proc.ExitCode
    }

    Write-Log "OK: $StepName (${elapsed}s)"
    return $elapsed
}

# ── Activate venv ──────────────────────────────────────────────────────────
$venvActivate = Join-Path $ProjectDir ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
} else {
    Write-Log "venv nicht gefunden: $venvActivate — dbt muss im PATH sein" "WARN"
}

# ── Banner ─────────────────────────────────────────────────────────────────
Write-Log "=========================================="
Write-Log "CDR Full Load — Target: $Target"
Write-Log "Log:    $LogFile"
Write-Log "StepFrom: $StepFrom"
Write-Log "=========================================="

$totalStart = Get-Date

# ── Step 1: External Table umstellen ───────────────────────────────────────
if ($StepFrom -le 1) {
    Invoke-Dbt `
        "run-operation stage_external_sources --vars `"ext_full_refresh: true`" --target $Target" `
        "Step 1/3 — stage_external_sources (merged/)"
} else {
    Write-Log "Step 1 übersprungen (StepFrom=$StepFrom)"
}

# ── Step 2: PSA Full-Refresh ───────────────────────────────────────────────
if ($StepFrom -le 2) {
    Invoke-Dbt `
        "run --select psa_rsn_mobile_cdr_main --full-refresh --target $Target" `
        "Step 2/3 — PSA Full-Refresh (psa_rsn_mobile_cdr_main)"
} else {
    Write-Log "Step 2 übersprungen (StepFrom=$StepFrom)"
}

# ── Step 3: Vault Full-Refresh ─────────────────────────────────────────────
if ($StepFrom -le 3) {
    $vaultModels = @(
        "hub_vertrag", "hub_kunde",
        "link_vertrag_kunde",
        "sat_kunde__compax", "sat_vertrag_optionen_ma__compax",
        "sat_vertrag_eff__compax", "sat_kunde_current_v", "sat_vertrag_eff_current_v",
        "hub_sim", "hub_msisdn",
        "link_vertrag_sim", "link_vertrag_msisdn",
        "link_cdr_event_tl", "sat_cdr_event__compax"
    ) -join " "

    Invoke-Dbt `
        "run --select $vaultModels --full-refresh --target $Target" `
        "Step 3/3 — Vault Full-Refresh (14 Modelle)"
}

# ── Done ───────────────────────────────────────────────────────────────────
$totalElapsed = [int](New-TimeSpan -Start $totalStart -End (Get-Date)).TotalSeconds
$totalMin     = [math]::Round($totalElapsed / 60, 1)

Write-Log "=========================================="
Write-Log "FERTIG — Gesamtdauer: ${totalMin} Minuten"
Write-Log "Log: $LogFile"
Write-Log "=========================================="
