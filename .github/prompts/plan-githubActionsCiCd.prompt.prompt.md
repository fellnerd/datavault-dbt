# GitHub Actions CI/CD Implementation Plan

## Ziel
Implementierung einer vollständigen CI/CD-Pipeline für das dbt Data Vault 2.1 Projekt mit intelligenten Path Filters, Self-hosted Runner und Prod-Approval-Workflow.

---

## ⚠️ Lessons Learned & Wichtige Hinweise

> **Diese Sektion dokumentiert kritische Erkenntnisse aus der Erstimplementierung am 27.12.2025**

### 🔴 Kritisch: Profile-Name muss mit dbt_project.yml übereinstimmen
```yaml
# In dbt_project.yml steht:
profile: 'datavault'

# Daher muss profiles.yml in den Workflows so beginnen:
datavault:          # ❌ NICHT: datavault_werkportal:
  target: dev
  outputs:
    dev:
      ...
```

### 🔴 Kritisch: DBT_PROFILES_DIR korrekt verwenden
```yaml
# In Workflows ist gesetzt:
env:
  DBT_PROFILES_DIR: ${{ github.workspace }}

# Daher profiles.yml ins Workspace schreiben, NICHT nach ~/.dbt/
- name: Create profiles.yml
  run: |
    mkdir -p $DBT_PROFILES_DIR                    # ✅ Korrekt
    cat > $DBT_PROFILES_DIR/profiles.yml << 'EOF' # ✅ Korrekt
    # NICHT: mkdir -p ~/.dbt                      # ❌ Falsch
```

### 🟡 GitHub Pages VOR Docs-Workflow aktivieren
Der Docs-Workflow schlägt fehl, wenn GitHub Pages nicht vorher aktiviert wurde:
```bash
# Via API aktivieren:
gh api repos/<owner>/<repo>/pages -X POST --input - <<EOF
{
  "build_type": "workflow"
}
EOF
```
Alternativ: Repository → Settings → Pages → Source: **GitHub Actions**

### 🟡 Runner Version prüfen
Die Runner-Version im Plan (2.311.0) war veraltet. Aktuelle Version verwenden:
```bash
# Aktuelle Version prüfen:
curl -s https://api.github.com/repos/actions/runner/releases/latest | grep tag_name
# Verwendete Version: 2.321.0
```

### 🟢 GitHub CLI (gh) erforderlich
Für automatisierte Secret-/Environment-Erstellung wird `gh` benötigt:
```bash
# Installation auf Ubuntu:
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install gh -y
gh auth login --web
```

### 🟢 workflow_dispatch für manuelles Testen
Alle Workflows sollten `workflow_dispatch:` haben für manuelles Triggern:
```yaml
on:
  workflow_dispatch:  # Ermöglicht manuelles Ausführen
  push:
    branches: [main]
    paths:
      - 'models/**'
```

---

## Phase 1: Azure Service Principal erstellen

### 1.1 Service Principal anlegen
```bash
az ad sp create-for-rbac \
  --name "sp-github-datavault-dbt" \
  --role "Contributor" \
  --scopes "/subscriptions/<SUBSCRIPTION-ID>/resourceGroups/synapse-playground" \
  --json-auth
```

**Output speichern:**
- `clientId` → GitHub Secret `AZURE_CLIENT_ID`
- `clientSecret` → GitHub Secret `AZURE_CLIENT_SECRET`
- `tenantId` → GitHub Secret `AZURE_TENANT_ID`

### 1.2 SQL Server Berechtigung erteilen
```bash
# Object ID des Service Principal ermitteln
az ad sp show --id <CLIENT-ID> --query id -o tsv

# AD Admin für SQL Server setzen
az sql server ad-admin create \
  --resource-group synapse-playground \
  --server sql-datavault-weu-001 \
  --display-name "sp-github-datavault-dbt" \
  --object-id <OBJECT-ID>
```

---

## Phase 2: GitHub Repository konfigurieren

### 2.1 Secrets erstellen
Repository → Settings → Secrets and variables → Actions → New repository secret

| Secret Name | Wert |
|-------------|------|
| `AZURE_CLIENT_ID` | clientId aus Phase 1.1 |
| `AZURE_CLIENT_SECRET` | clientSecret aus Phase 1.1 |
| `AZURE_TENANT_ID` | tenantId aus Phase 1.1 |

### 2.2 Environments erstellen
Repository → Settings → Environments

**Environment: `development`**
- Keine speziellen Regeln

**Environment: `production`**
- Required reviewers: Projektverantwortliche hinzufügen
- Wait timer: Optional (z.B. 5 Minuten)

### 2.3 GitHub Pages aktivieren
Repository → Settings → Pages → Source: GitHub Actions

---

## Phase 3: Self-hosted Runner registrieren

### 3.1 Runner auf VM 10.0.0.25 installieren
```bash
# Auf der VM ausführen
mkdir -p ~/actions-runner && cd ~/actions-runner

# Aktuelle Version ermitteln und herunterladen (Stand: Dez 2024 → v2.321.0)
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep -oP '"tag_name": "v\K[^"]+')
curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
tar xzf ./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
```

### 3.2 Runner konfigurieren
```bash
# Token von GitHub holen (gültig 1 Stunde!):
# Via CLI:
gh api repos/<owner>/<repo>/actions/runners/registration-token -X POST --jq '.token'

# Oder manuell: Repository → Settings → Actions → Runners → New self-hosted runner

# Runner registrieren (--unattended für nicht-interaktive Installation):
./config.sh --url https://github.com/fellnerd/datavault-dbt \
  --token <TOKEN> \
  --name "dbt-runner-vm" \
  --labels "self-hosted,linux,dbt" \
  --unattended
```

### 3.3 Runner als Service starten
```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status  # Prüfen ob läuft
```

### 3.4 Runner Status prüfen
```bash
# Via CLI:
gh api repos/<owner>/<repo>/actions/runners --jq '.runners[] | {name, status, busy, labels: [.labels[].name]}'

# Erwartete Ausgabe:
# {
#   "name": "dbt-runner-vm",
#   "status": "online",
#   "busy": false,
#   "labels": ["self-hosted", "Linux", "X64", "dbt"]
# }
```

### 3.5 Runner Labels (automatisch + manuell)
Automatisch gesetzte Labels:
- `self-hosted`
- `Linux`
- `X64`

Manuell hinzugefügt:
- `dbt`

---

## Phase 4: Workflow-Dateien erstellen

### 4.1 CI Workflow (PR Validation)
**Datei:** `.github/workflows/ci.yml`

**Trigger:**
- Pull Requests nach `main` oder `dev`
- Path Filter: Nur bei Model-/Macro-/Test-Änderungen

**Jobs:**
1. `dbt deps` - Dependencies installieren
2. `dbt compile` - SQL kompilieren (Syntaxcheck)
3. `dbt test` - Tests ausführen

### 4.2 Deploy Dev Workflow
**Datei:** `.github/workflows/deploy-dev.yml`

**Trigger:**
- Push auf `main` Branch
- Path Filter: Nur bei relevanten Änderungen

**Jobs:**
1. `dbt deps`
2. `dbt run --target dev`
3. `dbt test --target dev`

### 4.3 Deploy Prod Workflow
**Datei:** `.github/workflows/deploy-prod.yml`

**Trigger:**
- Manuell (workflow_dispatch)
- Tag Push (`v*`)

**Jobs:**
1. Approval-Gate (production Environment)
2. `dbt run --target werkportal`
3. `dbt test --target werkportal`

### 4.4 Docs Workflow
**Datei:** `.github/workflows/docs.yml`

**Trigger:**
- Push auf `main` (nach erfolgreichem Deploy)
- Manuell

**Jobs:**
1. `dbt docs generate`
2. Upload zu GitHub Pages

---

## Path Filter Konfiguration

### Trigger dbt-relevante Workflows:
```yaml
paths:
  - 'models/**'
  - 'macros/**'
  - 'seeds/**'
  - 'snapshots/**'
  - 'tests/**'
  - 'dbt_project.yml'
  - 'packages.yml'
  - 'profiles.yml'
```

### KEIN Trigger bei:
```yaml
paths-ignore:
  - 'docs/**'
  - 'README.md'
  - 'LESSONS_LEARNED.md'
  - 'DEVELOPER.md'
  - '.github/instructions/**'
  - '.github/prompts/**'
  - '*.md'
```

---

## Checkliste

### Vor der Implementierung
- [x] Azure CLI eingeloggt (`az login`)
- [x] Subscription ID ermittelt: `518a5277-e3f1-408f-aefc-e11931898d67`
- [x] GitHub Repository Zugriff (Admin)
- [x] GitHub CLI installiert und authentifiziert (`gh auth login`)

### Phase 1: Azure
- [x] Service Principal erstellt: `sp-github-datavault-dbt`
- [x] clientId, clientSecret, tenantId gespeichert
- [x] SQL Server AD Admin konfiguriert

### Phase 2: GitHub
- [x] Secret AZURE_CLIENT_ID erstellt
- [x] Secret AZURE_CLIENT_SECRET erstellt
- [x] Secret AZURE_TENANT_ID erstellt
- [x] Environment `development` erstellt
- [x] Environment `production` mit Approval erstellt
- [x] GitHub Pages aktiviert: https://fellnerd.github.io/datavault-dbt/

### Phase 3: Runner
- [x] Runner auf VM installiert (~/actions-runner)
- [x] Runner konfiguriert und registriert: `dbt-runner-vm`
- [x] Runner als Service gestartet (systemd)
- [x] Runner in GitHub sichtbar und online

### Phase 4: Workflows
- [x] `.github/workflows/ci.yml` erstellt
- [x] `.github/workflows/deploy-dev.yml` erstellt (+ workflow_dispatch)
- [x] `.github/workflows/deploy-prod.yml` erstellt
- [x] `.github/workflows/docs.yml` erstellt

### Validierung
- [x] PR erstellen → CI läuft ✅
- [x] PR mergen → Deploy Dev läuft ✅
- [x] Manual trigger → Deploy Prod mit Approval ⚠️ (37/39 Tests)
- [x] dbt docs auf GitHub Pages erreichbar ✅

---

## Referenzen

- **Repository:** https://github.com/fellnerd/datavault-dbt
- **SQL Server:** sql-datavault-weu-001.database.windows.net
- **VM (Runner):** 10.0.0.25
- **dbt Targets:** `dev`, `werkportal`, `ewb`
- **dbt Docs:** https://fellnerd.github.io/datavault-dbt/
- **GitHub Actions:** https://github.com/fellnerd/datavault-dbt/actions

---

## Implementierungsergebnis (27.12.2025)

### Erstellte Ressourcen
| Ressource | Name/ID | Status |
|-----------|---------|--------|
| Service Principal | `sp-github-datavault-dbt` | ✅ Aktiv |
| GitHub Secret | `AZURE_CLIENT_ID` | ✅ Konfiguriert |
| GitHub Secret | `AZURE_CLIENT_SECRET` | ✅ Konfiguriert |
| GitHub Secret | `AZURE_TENANT_ID` | ✅ Konfiguriert |
| Environment | `development` | ✅ Erstellt |
| Environment | `production` | ✅ Mit Approval (fellnerd) |
| Self-hosted Runner | `dbt-runner-vm` | ✅ Online |
| GitHub Pages | fellnerd.github.io/datavault-dbt | ✅ Aktiv |

### Workflow-Test-Ergebnisse
| Workflow | Trigger | Ergebnis |
|----------|---------|----------|
| CI (ci.yml) | PR nach main/dev | ✅ 39/39 Tests bestanden |
| Deploy Dev | Push auf main / manual | ✅ Erfolgreich |
| Deploy Prod | Tag v* / manual + Approval | ⚠️ 37/39 Tests (ref_role fehlt in Prod-DB) |
| Docs | Push auf main / manual | ✅ GitHub Pages aktualisiert |

### Bekannte Einschränkungen
1. **Prod-DB Unterschiede:** `vault.ref_role` Seed existiert nur in Dev-DB
2. **Path Filters:** Workflow-Änderungen triggern keine dbt-Runs (beabsichtigt)
3. **Erstes Deployment:** Bei neuem Tenant muss `dbt run` vor `dbt test` laufen

---

## Reproduktion in neuem Repository

### Schnellstart (vorausgesetzt: Azure CLI, GitHub CLI installiert)
```bash
# 1. Azure Login
az login

# 2. Service Principal erstellen
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SP_OUTPUT=$(az ad sp create-for-rbac \
  --name "sp-github-<repo-name>" \
  --role "Contributor" \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/<rg-name>" \
  --json-auth)

# 3. Secrets extrahieren
CLIENT_ID=$(echo $SP_OUTPUT | jq -r '.clientId')
CLIENT_SECRET=$(echo $SP_OUTPUT | jq -r '.clientSecret')
TENANT_ID=$(echo $SP_OUTPUT | jq -r '.tenantId')

# 4. GitHub Secrets setzen
gh secret set AZURE_CLIENT_ID --body "$CLIENT_ID"
gh secret set AZURE_CLIENT_SECRET --body "$CLIENT_SECRET"
gh secret set AZURE_TENANT_ID --body "$TENANT_ID"

# 5. Environments erstellen
gh api repos/<owner>/<repo>/environments/development -X PUT
gh api repos/<owner>/<repo>/environments/production -X PUT \
  --input - <<< '{"reviewers":[{"type":"User","id":<user-id>}]}'

# 6. GitHub Pages aktivieren
gh api repos/<owner>/<repo>/pages -X POST --input - <<< '{"build_type":"workflow"}'

# 7. Workflow-Dateien kopieren und anpassen
cp .github/workflows/*.yml <neues-repo>/.github/workflows/
# → Profile-Name in allen workflows anpassen!
# → Subscription-ID in Azure Login Step anpassen!
```
