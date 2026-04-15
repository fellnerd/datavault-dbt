#!/bin/bash
# =============================================================================
# ADF Web Activity Setup — GitHub repository_dispatch Trigger
# =============================================================================
# Konfiguriert die ADF Web Activity um nach dem Parquet-Load automatisch
# den dbt Produktions-Deploy (deploy-prod.yml) zu triggern.
#
# VORAUSSETZUNGEN:
#   - ACA Setup abgeschlossen (setup_aca_ewb.sh)
#   - github-pat-dbt-dispatch Secret in Key Vault vorhanden
#   - ADF Managed Identity hat Key Vault Get-Berechtigung
# =============================================================================

set -e

SUBSCRIPTION="68defcb4-5f61-4456-90f5-ff6bb0305183"
RESOURCE_GROUP="arg-analytics-ewb-01"
ADF_NAME="analytics-datafactory001"
KV_NAME="analytics-keyvault001"
PIPELINE_NAME="structured-tables Daily"
GITHUB_REPO_OWNER="fellnerd"           # TODO: Auf EWB Git-Org anpassen
GITHUB_REPO_NAME="datavault-dbt"       # TODO: Auf EWB Git-Repo anpassen

echo "=== ADF Web Activity Setup ==="
az account set --subscription "$SUBSCRIPTION"

# =============================================================================
# SCHRITT 1: ADF Managed Identity Key Vault Berechtigung
# =============================================================================
echo "--- ADF MI → Key Vault Access ---"

ADF_MI=$(az datafactory show \
  --name "$ADF_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "identity.principalId" -o tsv)

az keyvault set-policy \
  --name "$KV_NAME" \
  --object-id "$ADF_MI" \
  --secret-permissions get list

echo "Key Vault Policy gesetzt für ADF MI: $ADF_MI"

# =============================================================================
# SCHRITT 2: ADF Linked Service für Key Vault (via Portal oder ARM)
# =============================================================================
# Hinweis: Linked Service kann nicht direkt per CLI erstellt werden.
# Bitte im ADF Studio manuell anlegen:
#
# ADF Studio → Manage → Linked Services → New
#   Typ:  Azure Key Vault
#   Name: LS_KeyVault_analytics
#   URL:  https://analytics-keyvault001.vault.azure.net/
#   Auth: System-Assigned Managed Identity
#   → Test Connection → Publish
#
echo ""
echo "⚠️  Manuelle Aktion erforderlich:"
echo "    ADF Studio → Linked Services → Key Vault Linked Service erstellen"
echo "    (siehe Kommentar im Script)"
echo ""
read -p "Drücke ENTER sobald Linked Service erstellt und gepublished ist..."

# =============================================================================
# SCHRITT 3: deploy-prod.yml für repository_dispatch vorbereiten
# =============================================================================
# Die GitHub Actions Workflow-Datei muss repository_dispatch als Trigger haben.
# Prüfen ob bereits konfiguriert:
echo "--- GitHub Workflow Trigger prüfen ---"
WORKFLOW_FILE="$(dirname "$0")/../.github/workflows/deploy-prod.yml"
if grep -q "repository_dispatch" "$WORKFLOW_FILE"; then
  echo "✅ repository_dispatch bereits in deploy-prod.yml konfiguriert"
else
  echo "⚠️  repository_dispatch fehlt in deploy-prod.yml — muss noch hinzugefügt werden"
fi

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Nächster Schritt: ADF Pipeline '$PIPELINE_NAME' editieren:"
echo "  → Web Activity hinzufügen (NACH dem letzten Copy-Schritt)"
echo "  → URL: https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches"
echo "  → Method: POST"
echo "  → Body: {\"event_type\": \"deploy-prod\"}"
echo "  → Auth: Bearer Token aus Key Vault (LS_KeyVault_analytics / github-pat-dbt-dispatch)"
echo "  → Header: Accept: application/vnd.github.v3+json"
