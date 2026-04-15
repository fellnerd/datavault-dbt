#!/bin/bash
# =============================================================================
# Linux VM Runner Setup — EWB GitLab dbt-Runner
# =============================================================================
# Richtet eine Linux VM als GitLab Runner für dbt-Deployments ein.
#
# Voraussetzungen:
#   - Ubuntu 22.04 LTS (oder 20.04)
#   - Outbound HTTPS zu: git.intra.ewbuchs.ch, sql-analytics-ewb-001.database.windows.net
#   - Sudo-Rechte auf der VM
#
# Ausführen:
#   chmod +x setup_gitlab_runner_vm.sh && sudo ./setup_gitlab_runner_vm.sh
# =============================================================================

set -e

GITLAB_URL="https://git.intra.ewbuchs.ch"
RUNNER_NAME="ewb-dbt-runner-vm"
RUNNER_TAGS="ewb-dbt,linux,dbt"

echo "=== EWB GitLab Runner VM Setup ==="
echo ""

# =============================================================================
# SCHRITT 1: System-Abhängigkeiten
# =============================================================================
echo "--- Schritt 1: System-Pakete ---"
apt-get update -qq
apt-get install -y curl gnupg2 apt-transport-https ca-certificates \
  python3.11 python3.11-venv python3-pip git unixodbc-dev

# =============================================================================
# SCHRITT 2: ODBC Driver 18 für SQL Server
# =============================================================================
echo "--- Schritt 2: ODBC Driver 18 ---"
if ! dpkg -l | grep -q msodbcsql18; then
  curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
  curl -fsSL https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list \
    | tee /etc/apt/sources.list.d/mssql-release.list
  apt-get update -qq
  ACCEPT_EULA=Y apt-get install -y msodbcsql18 mssql-tools18
  echo "ODBC Driver 18 installiert"
else
  echo "ODBC Driver 18 bereits vorhanden"
fi

# =============================================================================
# SCHRITT 3: dbt-sqlserver installieren (system-wide für Runner)
# =============================================================================
echo "--- Schritt 3: dbt-sqlserver ---"
pip3 install --quiet "dbt-sqlserver>=1.8,<2.0"
dbt --version

# =============================================================================
# SCHRITT 4: GitLab Runner installieren
# =============================================================================
echo "--- Schritt 4: GitLab Runner ---"
if ! which gitlab-runner > /dev/null 2>&1; then
  curl -fsSL https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | bash
  apt-get install -y gitlab-runner
  echo "GitLab Runner installiert"
else
  echo "GitLab Runner bereits vorhanden: $(gitlab-runner --version | head -1)"
fi

# =============================================================================
# SCHRITT 5: Runner registrieren
# =============================================================================
echo ""
echo "--- Schritt 5: Runner registrieren ---"
echo ""
echo "Für die Registrierung wird ein Runner-Token benötigt."
echo "Diesen findest du in EWB GitLab unter:"
echo "  Repo → Settings → CI/CD → Runners → New project runner"
echo "  Tags: ewb-dbt"
echo ""
echo "OPTION A — Interaktiv registrieren:"
echo "  gitlab-runner register"
echo ""
echo "OPTION B — Mit Token direkt (empfohlen):"
echo "  gitlab-runner register \\"
echo "    --non-interactive \\"
echo "    --url '${GITLAB_URL}' \\"
echo "    --token '<RUNNER-TOKEN-AUS-GITLAB>' \\"
echo "    --executor shell \\"
echo "    --description '${RUNNER_NAME}' \\"
echo "    --tag-list '${RUNNER_TAGS}'"
echo ""
echo "Nach der Registrierung:"
echo "  gitlab-runner start"
echo "  gitlab-runner status"
echo ""

# =============================================================================
# SCHRITT 6: CI/CD Variables in GitLab setzen
# =============================================================================
echo "--- Schritt 6: GitLab CI/CD Variables ---"
echo ""
echo "Folgende Variables in EWB GitLab hinterlegen:"
echo "  Repo → Settings → CI/CD → Variables → Add variable"
echo ""
echo "  Key:   DBT_EWB_SQL_USER"
echo "  Value: <SQL-Benutzername>"
echo "  Flags: Protected ✅, Masked ✅"
echo ""
echo "  Key:   DBT_EWB_SQL_PASSWORD"
echo "  Value: <SQL-Passwort>"
echo "  Flags: Protected ✅, Masked ✅"
echo ""

# =============================================================================
# SCHRITT 7: ADF Pipeline Trigger Token (für ADF → dbt Automatisierung)
# =============================================================================
echo "--- Schritt 7: ADF Pipeline Trigger Token ---"
echo ""
echo "Für die ADF-Automatisierung einen GitLab Pipeline Trigger Token erstellen:"
echo "  Repo → Settings → CI/CD → Pipeline trigger tokens → Add new token"
echo "  Description: 'ADF dbt-prod-trigger'"
echo ""
echo "ADF Web Activity konfigurieren:"
echo "  URL:    ${GITLAB_URL}/api/v4/projects/<PROJECT_ID>/trigger/pipeline"
echo "  Method: POST"
echo "  Body:   { \"token\": \"<TRIGGER-TOKEN>\", \"ref\": \"main\" }"
echo ""
echo "=== Setup abgeschlossen ==="
echo "GitLab Runner ist bereit für: ${GITLAB_URL}"
