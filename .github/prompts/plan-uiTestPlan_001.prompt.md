## Plan: UI Test & Review für Next.js (Blueprint JS) - Active Phase

Wir führen einen tool-gestützten UI Review der `masterdata` App durch, erstellen `test-result.md` und standardisieren die Codebasis auf Blueprint JS Komponenten.

### 1. Active UI Review (Playwright Tools)
Status: **In Progress**
Tools: `mcp_playwright_*`

Target URLs:
- [ ] `http://localhost:3000/` (Dashboard)
- [ ] `http://localhost:3000/models` (Model Designer)
- [ ] `http://localhost:3000/entities` (Entity Builder)
- [ ] `http://localhost:3000/attributes` (Attribute Manager)
- [ ] `http://localhost:3000/data` (Data Grid)
- [ ] `http://localhost:3000/commits` (Commit Workflow)
- [ ] `http://localhost:3000/history` (Audit Log)

**Review Kriterien (gemäß `plan-masterDataServices.prompt.md`):**
1. **Mocks identifizieren**: Welche Buttons/Listen sind noch nicht mit API verbunden?
2. **Design Konsistenz**:
    - Korrekte Nutzung von Blueprint JS (`bp5-` Klassen, Komponenten).
    - Flat Design Check (keine Schatten wo unnötig, Data-Dense).
    - Konsistente Button-Referenzierung (Primary vs. Minimal).
3. **Layout**:
    - Einheitliches Spacing (Sass/CSS Variablen).
    - Sidebar vs. Content Struktur.

### 2. Result Artefakte
- `test-result.md`: Detaillierter Log der Findings mit TODOs.
- `screenshots/`: Visueller Beleg (wird lokal gespeichert).

### 3. Immediate Remediation Plan (High Priority)
1. **Localization Fix (German to English)**:
   - Target: `src/app/history/page.tsx` (Complete translation).
   - Target: `src/app/(auth)/login/page.tsx` (Complete translation).
2. **Navigation Fix**:
   - Target: `src/components/features/models/ModelCard.tsx` (Wire "Entities" button).
3. **Data Completeness**:
   - Target: `src/app/entities/page.tsx` (Fix Status/History columns).
   - Target: `src/app/attributes/page.tsx` (Fix Reference column).

### 4. Refactoring Steps (Post-Review)
1. **Mock Replacement**: Dummy-Daten (Dashboard Activity) durch API Calls ersetzen.
2. **Blueprint Standardization**: HTML Elements -> Blueprint Components Refactoring.
3. **Button Cleanup**: Einheitliche `Intent`-Nutzung.

### Further Considerations
1. Screenshots werden lokal gespeichert.
2. Fokus auf Blueprint v5 Klassen (`bp5-`).

