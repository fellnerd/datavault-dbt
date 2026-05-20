#!/bin/bash
# =============================================================================
# ACA dbt-Runner Setup — EWB Azure Tenant
# =============================================================================
# Repliziert exakt die PPMC/EWB ACA-Konfiguration in den EWB-Tenant.
#
# VORAUSSETZUNGEN (Luzia muss vorher erledigen):
#   1. Microsoft.App Provider registrieren:
#      az provider register -n Microsoft.App --wait --subscription 68defcb4-5f61-4456-90f5-ff6bb0305183
#   2. Microsoft.ContainerRegistry Provider registrieren:
#      az provider register -n Microsoft.ContainerRegistry --wait --subscription 68defcb4-5f61-4456-90f5-ff6bb0305183
#   3. Key Vault Access Policy für ppmc_df@ewbuchs.ch (OID: 94c26889-3531-48f6-b782-3022eb726a3a):
#      → analytics-keyvault001 → Access Policies → Add: Secrets: Get, List, Set
#   4. GitHub PAT erstellen (scope: repo) auf Service Account / fellnerd
#      → Wert bereitstellen für Schritt 5 unten
#
# AUSFÜHREN (nach Luzia-Freigabe):
#   chmod +x setup_aca_ewb.sh && ./setup_aca_ewb.sh
# =============================================================================

set -e

# --- Konfiguration ---
SUBSCRIPTION_EWB="68defcb4-5f61-4456-90f5-ff6bb0305183"
SUBSCRIPTION_PPMC="518a5277-e3f1-408f-aefc-e11931898d67"
RESOURCE_GROUP="arg-analytics-ewb-01"
LOCATION="switzerlandnorth"
ACR_NAME="acranalytics001ewb"
ACA_ENV="cae-ewb-cicd"
ACA_JOB="caj-dbt-runner"
MI_NAME="managedidentity001"           # Bereits vorhanden in arg-analytics-ewb-01
KV_NAME="analytics-keyvault001"
GITHUB_REPO="fellnerd/datavault-dbt"  # TODO: Auf EWB Git-Repo anpassen wenn bekannt
GITHUB_PAT=""                          # TODO: PAT-Wert hier eintragen (von Luzia)

echo "=== EWB ACA Setup ==="
az account set --subscription "$SUBSCRIPTION_EWB"
echo "Subscription: $(az account show --query name -o tsv)"

# =============================================================================
# SCHRITT 1: Container Registry erstellen
# =============================================================================
echo ""
echo "--- Schritt 1: ACR erstellen ---"
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku Basic \
  --location "$LOCATION"

ACR_SERVER="${ACR_NAME}.azurecr.io"
echo "ACR erstellt: $ACR_SERVER"

# =============================================================================
# SCHRITT 2: dbt-Runner Image von PPMC ACR kopieren
# =============================================================================
echo ""
echo "--- Schritt 2: Docker Image von PPMC nach EWB kopieren ---"

# In PPMC-Subscription einloggen und Image exportieren
az account set --subscription "$SUBSCRIPTION_PPMC"
az acr login --name acrewbcicd
docker pull acrewbcicd.azurecr.io/dbt-runner:latest

# In EWB-Subscription pushen
az account set --subscription "$SUBSCRIPTION_EWB"
az acr login --name "$ACR_NAME"
docker tag acrewbcicd.azurecr.io/dbt-runner:latest "${ACR_SERVER}/dbt-runner:latest"
docker push "${ACR_SERVER}/dbt-runner:latest"
echo "Image gepusht: ${ACR_SERVER}/dbt-runner:latest"

# =============================================================================
# SCHRITT 3: Managed Identity ACR Pull-Berechtigung
# =============================================================================
echo ""
echo "--- Schritt 3: Managed Identity → ACR Pull-Berechtigung ---"

MI_ID=$(az identity show \
  --name "$MI_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv)

MI_PRINCIPAL=$(az identity show \
  --name "$MI_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId -o tsv)

MI_CLIENT=$(az identity show \
  --name "$MI_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query clientId -o tsv)

ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)

az role assignment create \
  --assignee "$MI_PRINCIPAL" \
  --role AcrPull \
  --scope "$ACR_ID"

echo "ACR Pull-Rolle zugewiesen: $MI_NAME → $ACR_NAME"

# =============================================================================
# SCHRITT 4: Container Apps Environment erstellen
# =============================================================================
echo ""
echo "--- Schritt 4: Container Apps Environment erstellen ---"
az containerapp env create \
  --name "$ACA_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION"

echo "Container Apps Environment erstellt: $ACA_ENV"

# =============================================================================
# SCHRITT 5: GitHub PAT in Key Vault speichern
# =============================================================================
echo ""
echo "--- Schritt 5: GitHub PAT in Key Vault ---"
if [ -z "$GITHUB_PAT" ]; then
  echo "❌ GITHUB_PAT nicht gesetzt! Bitte Wert oben in diesem Script eintragen."
  exit 1
fi

az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "github-pat-dbt-dispatch" \
  --value "$GITHUB_PAT"

echo "Secret gespeichert: github-pat-dbt-dispatch"

# =============================================================================
# SCHRITT 6: Container App Job erstellen (1:1 wie PPMC)
# =============================================================================
echo ""
echo "--- Schritt 6: Container App Job erstellen ---"

ENV_ID=$(az containerapp env show \
  --name "$ACA_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv)

az containerapp job create \
  --name "$ACA_JOB" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --trigger-type "Event" \
  --replica-timeout 7200 \
  --replica-retry-limit 1 \
  --min-executions 0 \
  --max-executions 5 \
  --polling-interval 30 \
  --scale-rule-name "github-runner-rule" \
  --scale-rule-type "github-runner" \
  --scale-rule-metadata \
    "owner=fellnerd" \
    "repos=datavault-dbt" \
    "runnerScope=repo" \
    "labels=self-hosted,linux,dbt,aca" \
    "targetWorkflowQueueLength=1" \
  --scale-rule-auth "personalAccessToken=github-pat" \
  --secrets "github-pat=keyvaultref:https://${KV_NAME}.vault.azure.net/secrets/github-pat-dbt-dispatch,identityref:${MI_ID}" \
  --env-vars \
    "GITHUB_TOKEN=secretref:github-pat" \
    "GITHUB_REPO=${GITHUB_REPO}" \
  --cpu 2.0 \
  --memory "4Gi" \
  --image "${ACR_SERVER}/dbt-runner:latest" \
  --workload-profile-name "Consumption" \
  --registry-server "$ACR_SERVER" \
  --registry-identity "$MI_ID" \
  --mi-user-assigned "$MI_ID"

echo ""
echo "=== ✅ ACA Setup abgeschlossen ==="
echo "Job:         $ACA_JOB"
echo "Environment: $ACA_ENV"
echo "Image:       ${ACR_SERVER}/dbt-runner:latest"
echo "Runner:      self-hosted, linux, dbt, aca"
echo "Timeout:     7200s / Retry: 1"
echo ""
echo "Nächster Schritt: ADF Web Activity konfigurieren → setup_adf_trigger.sh"
