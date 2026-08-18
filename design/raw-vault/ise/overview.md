# ISE / EDM — Raw Vault Übersicht

**Schema:** `vault_ise` · **Mart:** `mart_ise` · **Tag:** `ise`
**Quellsystem:** i-SE (Innosolv), Energiedaten-Management (EDM)
**Diagramme:** [`er-diagram.mmd`](er-diagram.mmd) · [`../../mart/er-mart-ise.mmd`](../../mart/er-mart-ise.mmd)
**Fachlicher Hintergrund:** [`docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md`](../../../docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md) §12

---

## Ausgangslage

Angebunden ist die kuratierte i-SE-**Zeitreihegruppe 150 „ewb_Power BI"** mit **41 Zeitreihen**.
Geliefert wird sie als werktäglicher CSV-Export vom i-SE-Server (`ewb_PowerBI_LG_<yyyyMMddHHmmss>.csv`),
den ADF (`CopyPipeline_Lastgaenge`) nach Parquet in `stage-fs/ewb/ise/{lastgaenge,stammdaten}/` kopiert.

Die Werte sind **¼-Stunden-Lastgänge** (Zeitschritt 15 min). Das Monatsaggregat desselben Datenbestands
liegt im Innosolv-OLAP-Cube — der Mart reproduziert es stellengenau und dient damit als Regressionstest.

---

## Objekte

### Hubs

| Objekt | Business Key | Quelle | Zeilen |
|---|---|---|---|
| `hub_zeitreihe` | `id_zeitreihe` (Techanl.ZEITREIHE.ID_Zeitreihe) | `ise_zeitreihe_main` | 41 |
| `hub_zeitreihegruppe` | `id_zeitreihegruppe` (150 = ewb_Power BI) | `ise_zeitreihe_main` | 1 |

### Links

| Objekt | Verbindet | Kardinalität | Zeilen |
|---|---|---|---|
| `link_zeitreihe_gruppe` | `hub_zeitreihe` ↔ `hub_zeitreihegruppe` | M:N | 41 |

### Satellites

| Objekt | Parent | Typ | Zeilen |
|---|---|---|---|
| `sat_zeitreihe__ise` | `hub_zeitreihe` | SCD2 | 41 |
| `sat_zeitreihe_gruppe__ise` | `link_zeitreihe_gruppe` | SCD2 | 41 |
| `sat_lastgang_tl__ise` | `hub_zeitreihe` | **Transaction, append-only** | 169'248 |

Zugriffs-Views: `sat_zeitreihe__ise_current_v`, `sat_zeitreihe_gruppe__ise_current_v`,
`sat_lastgang_tl__ise_current_v`.

---

## Modellierungsentscheide

**Warum der Gruppen-Satellit am Link hängt.** Reihenfolge und Gültigkeit sind Eigenschaften der
*Zuordnung*, nicht der Zeitreihe. Am Hub könnte eine Serie nicht gleichzeitig in mehreren Gruppen
mit unterschiedlicher Sortierung liegen — und jedes Umsortieren in i-SE würde eine neue Version der
Zeitreihe selbst erzeugen.

**Warum Transaction Satellite statt Multi-Active.** Ein Lastgangwert ist ein Fakt, kein Zustand.
Der erste Entwurf nutzte `automate_dv.ma_sat` und verdoppelte sich bei jedem Lauf, weil der
Mengenvergleich je Hash Key auf die Sätze mit dem höchsten Load Date reduziert.
Details: [`docs/LESSONS_LEARNED.md`](../../../docs/LESSONS_LEARNED.md).

**Warum kein Link für die Lastgänge.** Ein Messwert gehört zu genau einer Zeitreihe; ein Link mit
einem Hub-FK wäre entartet. Der Zeitstempel ist Dependent-Child-Key am Satelliten.
(Anders als `link_cdr_event_tl` im Telecom-Vault — ein CDR verbindet wirklich Vertrag + SIM + Event.)

**Zeitkonvention.** Die Quelle liefert Intervall-**Enden**: der Wert `01.08. 00:00` misst
`31.07. 23:45–00:00` und gehört zum Juli. Der Raw Vault speichert das Ende unverändert; aufgelöst
wird es im Mart (`intervall_start`), damit Konsumenten die Konvention nicht kennen müssen.

---

## Bekannte Einschränkungen / offene Punkte

| # | Punkt | Status |
|---|---|---|
| 1 | **Dedup-Regeln sind Interim.** Lastgänge: „jüngster Export gewinnt"; Stammdaten: `DISTINCT` über die Fachspalten. Ein echtes Delta-Load-Konzept fehlt. | ⬜ TASKS.md |
| 2 | **Wertrevisionen im Vault noch nicht ausgelöst.** Der Pfad „zweite Version bei geändertem Hashdiff" ist gebaut, aber noch nicht eingetreten — das Staging löst Revisionen vor dem Vault auf. | ⬜ beobachten |
| 3 | **Flaschenhals ist das Parquet-Lesen** (12'986 ms für die Staging-Kette), nicht der Anti-Join (16 ms). Weitere Optimierung heisst PSA. | ⬜ TASKS.md |
| 4 | **Orchestrierung fehlt.** `CopyPipeline_Lastgaenge` hat keinen ADF-Trigger und ist nicht in `Master_ewb_load`. | ⬜ TASKS.md |
| 5 | **Historientiefe.** Aktuell Juli + halber August 2026. Laut `Techanl.ZEITREIHEINFO` reichen die Werte bis 2019/2024/2025 zurück (~3.2 Mio ¼-h-Werte) — Backfill-Export bei EWB anfragen. | ⬜ offen |
| 6 | **Exportlücke 15.08.** Stammdaten-Snapshot vorhanden, Lastgang-Datei fehlt (10 vs. 9 Dateien). | ⬜ mit EWB klären |
| 7 | Nur auf Target `ewb-dev` deployed; Prod (`ewb`) noch nicht. | ⬜ offen |

---

## Ladewege

| Zweck | Kommando / Job |
|---|---|
| Ganze Domäne (Staging → Vault → Mart) | `dbt run --select tag:ise --target ewb-dev` |
| Nur i-SE nachziehen (GitLab CI, manuell) | `deploy:dev:ise-load` |
| Neuaufbau nach Backfill / Logikänderung | `deploy:dev:ise-full-refresh` |
| Tests | `dbt test --select tag:ise --target ewb-dev` (68 Vault + 21 Mart) |
