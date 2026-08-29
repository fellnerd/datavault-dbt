# i-SE / EDM — Prüfabfragen

**Erstellt:** 26. August 2026 · **Stand der Zahlen:** wie im jeweiligen Abschnitt vermerkt
**Zweck:** Alle Abfragen, mit denen die i-SE-Anbindung (Lastgänge, Zeitreihen-Stammdaten,
Absatzstatistik) gegen `datavault-dev` und den Innosolv-OLAP-Cube geprüft wurde — zum
eigenständigen Nachvollziehen und Wiederholen.

**Verwandte Dokumente:**
[`docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md`](issues/2026-07-06_edm-ise-olap-cube-anbindung.md) ·
[`docs/LESSONS_LEARNED.md`](LESSONS_LEARNED.md) ·
[`design/raw-vault/ise/overview.md`](../design/raw-vault/ise/overview.md)

---

## 0. Die drei Zugangswege

| Ziel | Werkzeug | Was erreichbar ist |
|---|---|---|
| **A** `datavault-dev` (Azure SQL) | `dbt show --inline` | External Tables, Staging, `vault_ise`, `mart_ise` |
| **B** OLAP-Cube `ISAG` | ADF-Pipeline `Cube_Explore_TEST` (MDX / SSAS-DMV) | Dimensionen, Measures, Cube-Werte |
| **C** `EWBPROD` / `EWBPROD_dwh` (on-prem) | ADF-Pipeline `SQL_Explore_TEST` | i-SE-Rohtabellen und der DataMart hinter dem Cube |

Alle drei sind **lesend**. B und C laufen über den bestehenden `ISE_Prod`-Linked-Service
und die Self-hosted Integration Runtime — kein Gateway, kein zusätzlicher Connector.

### A — Abfragen gegen `datavault-dev`

```bash
dbt show --inline "<SQL>" --target ewb-dev --limit 50
```

> ⚠ **Nie `TOP` direkt in der Inline-Query verwenden** — `dbt show` erzeugt intern ein
> `OFFSET`, das damit kollidiert. Stattdessen in eine innere Ableitung packen:
> `select * from (select top 20 ... order by ...) x`
>
> Ebenso: kein `ORDER BY` und kein `UNION` auf oberster Ebene — beides bricht am Wrapper.

Alternative für mehrteilige Skripte:

```bash
dbt run-operation run_sql --args '{"sql": "SELECT ..."}' --target ewb-dev
```

### B/C — Abfragen über ADF

Hilfsskript (legt eine Pipeline-Ausführung an, wartet, gibt das Lookup-Ergebnis als JSON aus):

```python
#!/usr/bin/env python3
# adf_run.py — Aufruf:  python3 adf_run.py cube "<MDX>"
#                       python3 adf_run.py sql  "<T-SQL>" [EWBPROD|EWBPROD_dwh]
import json, subprocess, sys, time
RG="arg-analytics-ewb-01"; DF="analytics-datafactory001"
SUB="68defcb4-5f61-4456-90f5-ff6bb0305183"; API="2018-06-01"
BASE=(f"https://management.azure.com/subscriptions/{SUB}/resourceGroups/{RG}"
      f"/providers/Microsoft.DataFactory/factories/{DF}")

def az(method, url, body=None):
    cmd=["az","rest","--method",method,"--url",url,"--resource","https://management.azure.com"]
    if body is not None:
        cmd+=["--body",json.dumps(body),"--headers","Content-Type=application/json"]
    p=subprocess.run(cmd,capture_output=True,text=True)
    if p.returncode: raise SystemExit(p.stderr)
    return json.loads(p.stdout) if p.stdout.strip() else {}

def run(pipeline, params):
    rid=az("post", f"{BASE}/pipelines/{pipeline}/createRun?api-version={API}", params)["runId"]
    for _ in range(120):
        time.sleep(5)
        st=az("get", f"{BASE}/pipelineruns/{rid}?api-version={API}")
        if st["status"] in ("Succeeded","Failed","Cancelled"): break
    if st["status"]!="Succeeded": print("STATUS:",st["status"],st.get("message"),file=sys.stderr)
    acts=az("post", f"{BASE}/pipelineruns/{rid}/queryActivityruns?api-version={API}",
            {"lastUpdatedAfter":"2000-01-01T00:00:00Z","lastUpdatedBefore":"2100-01-01T00:00:00Z"})
    for a in acts.get("value",[]):
        if a.get("error",{}).get("message"): print("ERROR:",a["error"]["message"],file=sys.stderr)
        val=(a.get("output") or {}).get("value")
        print(json.dumps(val if val is not None else a.get("output"), ensure_ascii=False, indent=1))

mode, q = sys.argv[1], sys.argv[2]
if mode=="cube": run("Cube_Explore_TEST", {"MDXQuery": q})
else:            run("SQL_Explore_TEST",  {"SqlQuery": q,
                                           "dbName": sys.argv[3] if len(sys.argv)>3 else "EWBPROD_dwh"})
```

> Voraussetzung: `az login` im Tenant `ewbuchs.ch`. Die Lookup-Activity liefert maximal
> 5'000 Zeilen bzw. 4 MB — für grössere Ergebnisse aggregieren statt auflisten.

---

## 1. Lastgänge & Zeitreihen-Stammdaten

### 1.1 Zustand nach jedem Ladeschritt

Die zentrale Abfrage beim Delta-Load-Test. **`aktuelle_werte` muss immer der Anzahl
eindeutiger Zeitpunkte entsprechen** — egal wie viele Versionen darunter liegen.
`mart_zeilen` muss `aktuelle_werte` folgen, nicht `vault_zeilen`.

```sql
SELECT
    (SELECT COUNT(DISTINCT dss_source_filename) FROM stg.ext_ise_lastgaenge)         AS dateien,
    (SELECT COUNT(*) FROM vault_ise.sat_lastgang_tl__ise)                            AS vault_zeilen,
    (SELECT COUNT(*) FROM vault_ise.sat_lastgang_tl__ise_current_v)                  AS aktuelle_werte,
    (SELECT COUNT(*) FROM (SELECT hk_zeitreihe, messzeitpunkt
                           FROM vault_ise.sat_lastgang_tl__ise
                           GROUP BY hk_zeitreihe, messzeitpunkt
                           HAVING COUNT(*) > 1) x)                                   AS revidierte_zeitpunkte,
    (SELECT MIN(messzeitpunkt) FROM vault_ise.sat_lastgang_tl__ise)                  AS ts_von,
    (SELECT MAX(messzeitpunkt) FROM vault_ise.sat_lastgang_tl__ise)                  AS ts_bis,
    (SELECT COUNT(*) FROM vault_ise.sat_zeitreihe__ise)                              AS stammdaten,
    (SELECT COUNT(*) FROM mart_ise.fakt_lastgang)                                    AS mart_zeilen;
```

**Referenzwerte aus dem Delta-Load-Test (19.08.2026):**

| Schritt | dateien | vault_zeilen | aktuelle_werte | revidiert | ts_bis |
|---|---|---|---|---|---|
| Full-Refresh, 1 Datei | 1 | 19'680 | 19'680 | 0 | 07.08. 00:00 |
| + 2. Datei, inkrementell | 2 | 24'057 | 23'616 | 441 | 08.08. 00:00 |

Rechenprobe: 19'680 + 3'936 (ein neuer Tag = 41 Serien × 96 Viertelstunden) = 23'616.
24'057 − 23'616 = 441 → jeder revidierte Zeitpunkt trägt genau zwei Versionen.

### 1.2 Duplikate und Revisionen in der Quelle

```sql
SELECT
    COUNT(*)                                                     AS rohzeilen,
    COUNT(DISTINCT CONCAT([Category],'|',[Date]))                AS eindeutige_paare,
    (SELECT COUNT(*) FROM (SELECT [Category],[Date]
                           FROM stg.ext_ise_lastgaenge
                           GROUP BY [Category],[Date]
                           HAVING COUNT(DISTINCT [Value]) > 1) t) AS revidierte_paare
FROM stg.ext_ise_lastgaenge;
```

Stand bei 9 Dateien: 279'456 / 169'248 / **6'267**. Die dritte Zahl ist die
entscheidende — sie belegt, dass Messwerte nachträglich korrigiert werden und ein
`SELECT DISTINCT` deshalb falsch wäre.

### 1.3 Datei-Inventar und Überlappung

```sql
SELECT * FROM (
    SELECT TOP 20
        [dss_source_filename]                                  AS datei,
        COUNT(*)                                               AS zeilen,
        COUNT(DISTINCT CONCAT([Category],'|',[Date]))          AS eindeutig,
        MIN(TRY_CONVERT(datetime2(0),[Date],104))              AS ts_von,
        MAX(TRY_CONVERT(datetime2(0),[Date],104))              AS ts_bis
    FROM stg.ext_ise_lastgaenge
    GROUP BY [dss_source_filename]
    ORDER BY [dss_source_filename]
) x;
```

Jede Tagesdatei deckt ein 5-Tage-Fenster ab: 41 Serien × 480 Viertelstunden = 19'680 Zeilen.
Der Backfill vom 11.08. enthält 122'016 Zeilen = 41 × 2'976 (voller Juli).

### 1.4 Welcher Export hat je Zeitpunkt gewonnen

```sql
SELECT * FROM (
    SELECT TOP 20 dss_source_filename AS datei,
                  MIN(dss_export_datum) AS export_datum,
                  COUNT(*) AS gewinner_zeilen
    FROM stg.ise_lastgang_dedup
    GROUP BY dss_source_filename
    ORDER BY dss_source_filename
) x;
```

Erwartetes Muster: die jüngste Datei gewinnt ihr ganzes Fenster (19'680), jede ältere
steuert genau ihren noch nicht überschriebenen Tag bei (3'936 = 41 × 96).

### 1.5 Referenzielle Integrität im Vault

```sql
SELECT
    (SELECT COUNT(*) FROM vault_ise.sat_lastgang_tl__ise s
      WHERE NOT EXISTS (SELECT 1 FROM vault_ise.hub_zeitreihe h
                        WHERE h.hk_zeitreihe = s.hk_zeitreihe))                   AS sat_waisen,
    (SELECT COUNT(*) FROM vault_ise.link_zeitreihe_gruppe l
      WHERE NOT EXISTS (SELECT 1 FROM vault_ise.hub_zeitreihe h
                        WHERE h.hk_zeitreihe = l.hk_zeitreihe))                   AS link_waisen_zr,
    (SELECT COUNT(*) FROM vault_ise.link_zeitreihe_gruppe l
      WHERE NOT EXISTS (SELECT 1 FROM vault_ise.hub_zeitreihegruppe g
                        WHERE g.hk_zeitreihegruppe = l.hk_zeitreihegruppe))       AS link_waisen_grp,
    (SELECT COUNT(*) FROM mart_ise.fakt_lastgang f
      WHERE NOT EXISTS (SELECT 1 FROM mart_ise.dim_zeitreihe_v d
                        WHERE d.zeitreihe_key = f.zeitreihe_key))                 AS mart_waisen,
    (SELECT COUNT(*) FROM mart_ise.fakt_lastgang f
      WHERE NOT EXISTS (SELECT 1 FROM mart.dim_date d
                        WHERE d.date_key = f.datum_key))                          AS datum_waisen;
```

Alle fünf müssen **0** sein.

### 1.6 Diagnose bei Multi-Active-Satelliten (historisch)

Falls irgendwo ein `ma_sat` verwendet wird: **alle Sätze eines Hash Keys aus einem
Ladelauf müssen dasselbe Load Date tragen**, sonst verdoppelt sich der Satellit bei
jedem Lauf. Prüfung:

```sql
SELECT * FROM (
    SELECT TOP 10 <hash_key>,
           COUNT(DISTINCT dss_load_date) AS n_ldts,
           COUNT(*) AS n_rows
    FROM <ma_satellit>
    GROUP BY <hash_key>
    ORDER BY COUNT(DISTINCT dss_load_date) DESC
) x;
```

`n_ldts` muss 1 sein. Hintergrund: [`LESSONS_LEARNED.md`](LESSONS_LEARNED.md).

---

## 2. Absatzstatistik

### 2.1 Grundprofil

```sql
SELECT COUNT(*)                                AS zeilen,
       COUNT(DISTINCT [dss_source_filename])   AS dateien,
       COUNT(DISTINCT [termin])                AS termine,
       MIN([termin_jahr])                      AS jahr_min,
       MAX([termin_jahr])                      AS jahr_max,
       COUNT(DISTINCT [rechnungsart])          AS rechnungsarten,
       COUNT(DISTINCT [tarif])                 AS tarife,
       COUNT(DISTINCT [verrechnungstyp])       AS verrechnungstypen
FROM stg.ext_ise_absatzstatistik;
```

Stand 26.08.2026: 11'098'698 Zeilen aus **11 Dateien** — das sind 11 identische
Vollsnapshots à ~1'009'000 Zeilen (Export läuft zweimal täglich, 03:00 und 05:00).

> ⛔ **Ohne Snapshot-Filter sind alle Summen um Faktor 11 zu hoch.** Für jede inhaltliche
> Auswertung auf den jüngsten Snapshot einschränken:
> `WHERE [dss_source_filename] = (SELECT MAX([dss_source_filename]) FROM stg.ext_ise_absatzstatistik)`

### 2.2 Snapshot-Nachweis

```sql
SELECT * FROM (
    SELECT TOP 20 [dss_source_filename] AS datei,
                  COUNT(*)              AS zeilen,
                  SUM(TRY_CAST([rechpos_betrag] AS decimal(38,6))) AS betrag_exkl
    FROM stg.ext_ise_absatzstatistik
    GROUP BY [dss_source_filename]
    ORDER BY [dss_source_filename]
) x;
```

Alle 11 Zeilen zeigen praktisch dieselbe Summe (~27'948'000) — der Beweis, dass es
Vollsnapshots und keine Deltas sind.

### 2.3 Jahressummen für den Cube-Abgleich

```sql
SELECT * FROM (
    SELECT TOP 10
        [termin_jahr]                                              AS jahr,
        COUNT(*)                                                   AS zeilen,
        SUM(TRY_CAST([rechpos_basis] AS decimal(38,6)))            AS basis,
        SUM(TRY_CAST([rechpos_betrag] AS decimal(38,6)))           AS betrag_exkl,
        SUM(TRY_CAST([rechpos_mwst_betrag] AS decimal(38,6)))      AS mwst,
        SUM(TRY_CAST([rechpos_betrag_inkl_mwst] AS decimal(38,6))) AS betrag_inkl
    FROM stg.ext_ise_absatzstatistik
    WHERE [dss_source_filename] = 'ewb_PowerBI_Absatz_20260826050053.csv'
    GROUP BY [termin_jahr]
    ORDER BY [termin_jahr]
) x;
```

### 2.4 Datenqualität des Exports

```sql
SELECT COUNT(*) AS zeilen,
       SUM(CASE WHEN TRY_CAST([rechpos_betrag] AS decimal(38,6)) IS NULL THEN 1 ELSE 0 END) AS betrag_nicht_parsebar,
       SUM(CASE WHEN [rechnungsart] LIKE '%"%'
                  OR [verrechnungstyp] LIKE '%"%' THEN 1 ELSE 0 END)                        AS quoting_schaden,
       COUNT(DISTINCT [statistikgruppe])                                                    AS statistikgruppe_werte
FROM stg.ext_ise_absatzstatistik
WHERE [dss_source_filename] = 'ewb_PowerBI_Absatz_20260826050053.csv';
```

Stand: **4'622 Zeilen mit Quoting-Schaden** (0.46 %), `statistikgruppe` durchgehend leer.
Zerstörte Umlaute lassen sich so nachweisen (U+FFFD statt des Originalzeichens):

```sql
SELECT * FROM (
    SELECT TOP 5 [verrechnungstyp], CONVERT(varbinary(60), [verrechnungstyp]) AS hex
    FROM stg.ext_ise_absatzstatistik
    WHERE [verrechnungstyp] LIKE N'%' + NCHAR(0xFFFD) + N'%'
) x;
```

---

## 3. Der Cube (Weg B)

### 3.1 Metadaten — was der Cube enthält

```bash
# Alle Dimensionen
python3 adf_run.py cube "SELECT [DIMENSION_UNIQUE_NAME],[DIMENSION_CARDINALITY] \
  FROM \$system.MDSCHEMA_DIMENSIONS WHERE [CUBE_NAME]='ISAG'"

# Alle Measures, gruppiert nach Measure Group
python3 adf_run.py cube "SELECT [MEASUREGROUP_NAME],[MEASURE_NAME] \
  FROM \$system.MDSCHEMA_MEASURES WHERE [CUBE_NAME]='ISAG'"

# Welche Dimensionen hängen an einer Measure Group?
python3 adf_run.py cube "SELECT [DIMENSION_UNIQUE_NAME] \
  FROM \$system.MDSCHEMA_MEASUREGROUP_DIMENSIONS \
  WHERE [CUBE_NAME]='ISAG' AND [MEASUREGROUP_NAME]='Fakten Rechnungsstatistik'"

# Hierarchien und Ebenen einer Dimension
python3 adf_run.py cube "SELECT [HIERARCHY_UNIQUE_NAME],[HIERARCHY_CARDINALITY] \
  FROM \$system.MDSCHEMA_HIERARCHIES WHERE [CUBE_NAME]='ISAG' \
  AND [DIMENSION_UNIQUE_NAME]='[Termin]'"

# Member Properties — hier verstecken sich Attribute, die wie fehlende Spalten aussehen
python3 adf_run.py cube "SELECT [PROPERTY_NAME] FROM \$system.MDSCHEMA_PROPERTIES \
  WHERE [CUBE_NAME]='ISAG' AND [DIMENSION_UNIQUE_NAME]='[Verrechnungstyp]'"
```

> Die DMV-`WHERE`-Klausel unterstützt nur einfache Gleichheitsvergleiche zuverlässig.
> `IN (…)` mit mehreren Werten schlägt fehl — je Dimension einzeln abfragen.

**Wichtige Fundstellen:**

| Suche | Ergebnis |
|---|---|
| `verrechnungstyp_messart` | Property `Verrechnungstyp Messart` auf `[Verrechnungstyp]` |
| `marktprodukt` | Property `Marktprodukt` auf `[Tarif]` |
| `verbrauchergruppe` | Property `Verbrauchergruppe BEW` auf `[Abnehmerkategorie]` |
| `zev_evg_nummer` | `[Energiegemeinschaft]` existiert, ist aber **nicht** an `Fakten Rechnungsstatistik` gebunden |
| `gruppe` (Sparten) | keine Entsprechung im Cube gefunden |

### 3.2 Rechnungsstatistik je Jahr — der Abgleich zur Absatzstatistik

```bash
python3 adf_run.py cube "SELECT NON EMPTY \
  {[Measures].[Basis],[Measures].[Betrag Exkl MwSt],[Measures].[Betrag MwSt],[Measures].[Betrag Inkl MwSt]} ON 0, \
  NON EMPTY [Termin].[Jahr].[Jahr].MEMBERS ON 1 FROM [ISAG]"
```

**Ergebnis 26.08.2026** (Cube-Historie reicht bis 2021 zurück, der Export nur bis 2025):

| Jahr | Basis (Cube) | Basis (Export, 1 Snapshot) | Betrag exkl. (Cube) | Betrag exkl. (Export) |
|---|---|---|---|---|
| 2025 | 13'481'541'571.30 | 13'481'541'571.30 ✅ | 18'298'836.08 | 18'298'831.38 (Δ 4.70) |
| 2026 | 7'204'943'425.90 | 7'204'943'425.90 ✅ | 9'648'798.98 | 9'648'797.48 (Δ 1.50) |

Die Basis stimmt stellengenau; die Betrags-Differenz entspricht den defekten CSV-Zeilen
aus 2.4 — sie fehlen **im Export**, nicht im Cube.

### 3.3 Zeitreihen je Monat — der Abgleich zu den Lastgängen

```bash
python3 adf_run.py sql "SELECT ID_Zeitreihe, Month_ID, Summe, Minimum, Maximum \
  FROM DataMart_EVU.ZeitreihenData WHERE Month_ID='2026/07' AND ID_Zeitreihe=148746" EWBPROD_dwh
```

Gegenstück im Vault — **Abgrenzung beachten**, die Quelle datiert auf das Intervall-**Ende**:

```sql
SELECT COUNT(*) AS n_werte, SUM(m.wert) AS summe_juli,
       MIN(m.wert) AS min_wert, MAX(m.wert) AS max_wert
FROM vault_ise.sat_lastgang_tl__ise_current_v m
JOIN vault_ise.hub_zeitreihe h ON h.hk_zeitreihe = m.hk_zeitreihe
WHERE h.id_zeitreihe = 148746
  AND m.messzeitpunkt >  '2026-07-01'
  AND m.messzeitpunkt <= '2026-08-01';
```

Erwartung: 2'976 Werte, Summe `4612940.997043` — identisch zum Cube.
Im Mart ist die Konvention bereits aufgelöst, dort genügt:

```sql
SELECT anzahl_werte, summe_kwh, min_kwh, max_kwh
FROM mart_ise.fakt_lastgang_monat_v m
JOIN mart_ise.dim_zeitreihe_v d ON d.zeitreihe_key = m.zeitreihe_key
WHERE d.zeitreihe_id = 148746 AND m.jahr_monat = '2026/07';
```

---

## 4. `EWBPROD` / `EWBPROD_dwh` (Weg C)

```bash
# Objekte suchen
python3 adf_run.py sql "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE \
  FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Zeitreihe%'" EWBPROD_dwh

# Spalten einer Tabelle/View
python3 adf_run.py sql "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS \
  WHERE TABLE_NAME='VR_Zeitreihe' ORDER BY ORDINAL_POSITION" EWBPROD_dwh
```

**Die relevanten Objekte:**

| Objekt | DB | Inhalt | Zeilen |
|---|---|---|---|
| `DataMart_EVU.RechnungFakten` | `EWBPROD_dwh` | Rechnungs-/Absatzfakten (Cube-Quelle) | 3'399'415 |
| `DataMart_EVU.ZeitreihenData` | `EWBPROD_dwh` | Zeitreihen-Monatswerte | 486k |
| `DataMart_EVU.VR_Zeitreihe` | `EWBPROD_dwh` | Zeitreihen-Dimension des Cubes | 19'205 |
| `Techanl.ZEITREIHE` | `EWBPROD` | Zeitreihen-Stammdaten (vollständig) | 203'378 |
| `Techanl.ZEITREIHEGRUPPE` / `…ZUORD` | `EWBPROD` | 43 Gruppen, Gruppe 150 = `ewb_Power BI` | — |
| `Techanl.ZEITREIHEINFO` | `EWBPROD` | Werte-Zeitraum und Lücken je Serie | — |
| `Techanl.METERINGCODE` | `EWBPROD` | Messpunkt-Bezeichnung (`CH1008…`) | — |
| `Techanl.MARKTPARTNER` | `EWBPROD` | Netz / Lieferant / „Auswertungen" | — |

**Historientiefe der Zeitreihen** (ohne Cassandra-Zugriff ermittelbar):

```bash
python3 adf_run.py sql "SELECT YEAR(ZeitreihewertStart) AS start_jahr, COUNT(*) AS n_serien, \
  SUM(DATEDIFF(day, ZeitreihewertStart, ZeitreihewertEnde) * 96) AS geschaetzte_werte \
  FROM Techanl.ZEITREIHEINFO WHERE ID_Zeitreihe IN (<IDs>) GROUP BY YEAR(ZeitreihewertStart)" EWBPROD
```

**Gruppenzugehörigkeit prüfen** — reproduziert die Auswahl des Exports:

```bash
python3 adf_run.py sql "SELECT g.ID_ZEITREIHEGRUPPE, g.Bezeichnung, COUNT(z.ID_Zeitreihe) AS n_serien \
  FROM Techanl.ZEITREIHEGRUPPE g \
  LEFT JOIN Techanl.ZEITREIHEGRUPPEZUORD z ON z.ID_ZEITREIHEGRUPPE = g.ID_ZEITREIHEGRUPPE \
  GROUP BY g.ID_ZEITREIHEGRUPPE, g.Bezeichnung ORDER BY g.ID_ZEITREIHEGRUPPE" EWBPROD
```

Gruppe 150 muss genau 41 Serien enthalten — dieselbe Zahl wie im Export.

---

## 5. Bekannte Fallen

| # | Falle | Auswirkung / Gegenmittel |
|---|---|---|
| 1 | **Wildcard External Tables lesen alle Dateien** | Lastgänge: bis 5× dupliziert · Absatzstatistik: 11× · Immer auf Snapshot/Dedup filtern |
| 2 | **`Date` ist `VARCHAR`** im Format `dd.MM.yyyy HH:mm:ss` | `MIN`/`MAX` sortieren lexikografisch (Tag vor Monat) → `TRY_CONVERT(datetime2(0), …, 104)` |
| 3 | **Intervall-ENDE** | Der Wert `01.08. 00:00` gehört zum Juli. Abgrenzung `> Monatsanfang AND <= Folgemonatsanfang`, sonst weichen Summen am Monatsrand ab |
| 4 | **`dss_stage_timestamp` taugt nicht zum Sortieren** | Über alle Dateien eines ADF-Laufs identisch (je 1 distinct Wert). Ordnen nur über den Export-Zeitstempel aus `dss_source_filename` |
| 5 | **`dbt show --inline` + `TOP`/`ORDER BY`/`UNION`** | Kollidiert mit dem internen `OFFSET`-Wrapper → in eine innere Ableitung packen |
| 6 | **DMV-`WHERE` mit `IN (…)`** | Schlägt fehl → je Wert einzeln abfragen |
| 7 | **Nummernkreis-Zufall bei Schlüsselvergleichen** | Trefferquote gegen die Dichte des Zielnummernkreises prüfen: `hub_kreditor` hat 93 % Dichte → 93 % „Treffer" sind Rauschen, keine Beziehung |
| 8 | **`BK` ist keine gültige Mermaid-Kardinalität** | Nur `PK`/`FK`/`UK` — betroffene ER-Diagramme rendern nicht |
