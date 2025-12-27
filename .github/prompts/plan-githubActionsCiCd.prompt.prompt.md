# GitHub Actions CI/CD Implementation Plan

## Ziel
Implementierung einer vollständigen CI/CD-Pipeline für das dbt Data Vault 2.1 Projekt mit intelligenten Path Filters, Self-hosted Runner und Prod-Approval-Workflow.

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
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
```

### 3.2 Runner konfigurieren
```bash
# Token von GitHub holen: Repository → Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/fellnerd/datavault-dbt --token <TOKEN>
```

### 3.3 Runner als Service starten
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

### 3.4 Runner Labels setzen
- `self-hosted`
- `linux`
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
- [ ] Azure CLI eingeloggt (`az login`)
- [ ] Subscription ID ermittelt
- [ ] GitHub Repository Zugriff (Admin)

### Phase 1: Azure
- [ ] Service Principal erstellt
- [ ] clientId, clientSecret, tenantId gespeichert
- [ ] SQL Server AD Admin konfiguriert

### Phase 2: GitHub
- [ ] Secret AZURE_CLIENT_ID erstellt
- [ ] Secret AZURE_CLIENT_SECRET erstellt
- [ ] Secret AZURE_TENANT_ID erstellt
- [ ] Environment `development` erstellt
- [ ] Environment `production` mit Approval erstellt
- [ ] GitHub Pages aktiviert

### Phase 3: Runner
- [ ] Runner auf VM installiert
- [ ] Runner konfiguriert und registriert
- [ ] Runner als Service gestartet
- [ ] Runner in GitHub sichtbar

### Phase 4: Workflows
- [ ] `.github/workflows/ci.yml` erstellt
- [ ] `.github/workflows/deploy-dev.yml` erstellt
- [ ] `.github/workflows/deploy-prod.yml` erstellt
- [ ] `.github/workflows/docs.yml` erstellt

### Validierung
- [ ] PR erstellen → CI läuft
- [ ] PR mergen → Deploy Dev läuft
- [ ] Tag pushen → Deploy Prod mit Approval
- [ ] dbt docs auf GitHub Pages erreichbar

---

## Referenzen

- **Repository:** https://github.com/fellnerd/datavault-dbt
- **SQL Server:** sql-datavault-weu-001.database.windows.net
- **VM (Runner):** 10.0.0.25
- **dbt Targets:** `dev`, `werkportal`, `ewb`
