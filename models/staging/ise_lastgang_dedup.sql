/*
 * Pre-Staging Deduplication: ise_lastgang_dedup
 *
 * Source: ext_ise_lastgaenge (Wildcard External Table auf ewb/ise/lastgaenge/)
 * Downstream: ise_lastgang_main (automate_dv.stage)
 *
 * Inhalt: ¼-Stunden-Lastgangwerte (Zeitschritt 15 min) der i-SE-Zeitreihegruppe 150
 *         "ewb_Power BI" — 41 Zeitreihen.
 *
 * Aufgaben dieser View:
 *
 * 1. Zeitstempel typisieren
 *    [Date] kommt als VARCHAR(20) im Format 'dd.MM.yyyy HH:mm:ss' → TRY_CONVERT
 *    mit Style 104. Ohne Konvertierung sortieren MIN/MAX lexikografisch (Tag vor
 *    Monat) und liefern irreführende Zeiträume.
 *    Konvention der Quelle: Intervall-ENDE, d. h. der Wert 01.08. 00:00 gehört
 *    noch zum Juli. Der Kreuz-Check gegen die Cube-Monatswerte bestätigt das.
 *
 * 2. Serie auflösen
 *    [Category] ist ein zusammengesetzter Text: Zeitreihe + '.' + Referenz + '.' +
 *    Einheit. Über ise_zeitreihe_dedup.zeitreihe_key wird daraus die ID_Zeitreihe
 *    (1:1, für alle 41 Serien verifiziert). Der INNER JOIN verwirft Werte ohne
 *    Stammsatz — Überwachung via Test assert_ise_lastgang_kategorie_aufloesbar.
 *
 * 3. Duplikate auflösen — "letzter Export gewinnt"
 *    Die External Table liest ALLE Export-Dateien. Der werktägliche Export enthält
 *    ein rollierendes 5-Tage-Fenster (dazu ein Juli-Backfill), und die Werte werden
 *    innerhalb dieses Fensters nachträglich korrigiert (Ersatz- → validierter Wert).
 *    Ohne Auflösung erscheint derselbe (Category, Date) bis zu 5× mit
 *    unterschiedlichen Werten.
 *
 *    dss_source_filename liefert die Herkunft je Zeile. Der Dateiname trägt den
 *    Export-Zeitstempel ('ewb_PowerBI_LG_<yyyyMMddHHmmss>.csv') und sortiert
 *    lexikografisch = chronologisch. Der ROW_NUMBER wählt damit fachlich korrekt
 *    den jüngsten Export je Zeitpunkt.
 *
 *    Bewusst NICHT über dss_stage_timestamp sortiert: das ist der ADF-LADEzeitpunkt
 *    und über alle Dateien eines Copy-Laufs identisch (verifiziert: genau 1 distinct
 *    Wert über alle 9 Dateien, gleiche dss_run_id) — als Ordnungskriterium
 *    unbrauchbar. Er läuft nur als Lineage-Information mit.
 *
 *    ⚠ Interim: Diese Regel löst die Doppelzählung, ersetzt aber keinen
 *    Delta-Load-Entscheid (Revisionen verwerfen vs. historisieren, HWM-Kriterium,
 *    PSA ja/nein) — siehe TASKS.md "Delta-Load-Strategie für i-SE-Lastgänge".
 *
 * 4. Load Date aus dem Export ableiten
 *    dss_load_date ist der Export-Zeitstempel (nicht der dbt-Laufzeitpunkt) —
 *    damit spiegelt die Vault-Historie den tatsächlichen Datenstand. Fallback
 *    GETDATE(), falls der Dateiname vom Muster abweicht.
 *
 * 5. Load Date je Zeile — und warum das hier zulaessig ist
 *    dss_load_date ist der Export-Zeitstempel der EINZELNEN Zeile, also der
 *    Zeitpunkt, zu dem i-SE genau diesen Wert geliefert hat. Damit ist im Vault
 *    nachvollziehbar, aus welchem Export ein Messwert stammt.
 *
 *    Historie: Zwischenzeitlich stand hier ein Batch-Wert
 *    (MAX(dss_export_datum) OVER ()), weil die Lastgaenge zuerst in einem
 *    Multi-Active Satellite lagen. automate_dv.ma_sat vergleicht MENGEN je Hash
 *    Key und bildet latest_records aus allen Saetzen mit dem hoechsten Load Date
 *    je Key — bei zeilenweisen Load Dates schrumpft diese Vergleichsmenge auf die
 *    Saetze der juengsten Exportdatei, alles andere gilt als neu und wird bei
 *    JEDEM Lauf erneut eingefuegt (gemessen: 169'248 → 338'496 beim zweiten Lauf).
 *
 *    Seit dem Umbau auf den append-only Transaction Satellite sat_lastgang_tl__ise
 *    entfaellt dieser Mengenvergleich: dort ist jede Zeile ein eigenstaendiger
 *    Fakt mit Schluessel (hk_zeitreihe, messzeitpunkt), und der zeilenweise
 *    Zeitstempel ist die praezisere Information.
 *    Ausfuehrlich: docs/LESSONS_LEARNED.md.
 *
 * Hinweis dss_record_source: Die Quelle liefert 'ise/lastgaenge' (Ordnerpfad).
 * Für den Vault wird auf die Projektkonvention 'ewb_ise' normalisiert (analog
 * ewb_abacus/ewb_idms — systemweit, nicht je Feed); der Rohwert bleibt als
 * dss_source_feed erhalten.
 *
 * ext_ise_stammdaten führt dieselben Herkunftsspalten; dort wird bewusst per
 * DISTINCT über die Fachspalten dedupliziert statt "letzter gewinnt" — Snapshots
 * eines Stammdatenstands sind fachlich gleichwertig, siehe ise_zeitreihe_dedup.
 * Hintergrund: docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md §12.7/§12.12.
 */

{{ config(materialized='view', tags=['ise']) }}

WITH source AS (
    SELECT
        [Date]                                              AS date_raw,
        [Category]                                          AS category,
        [Value]                                             AS wert,
        [dss_source_filename]                               AS dss_source_filename,
        [dss_record_source]                                 AS dss_source_feed,
        [dss_run_id]                                        AS dss_run_id,
        TRY_CAST([dss_stage_timestamp] AS DATETIME2)        AS dss_stage_timestamp,
        {{ ise_export_timestamp('[dss_source_filename]') }} AS dss_export_datum
    FROM {{ source('staging', 'ext_ise_lastgaenge') }}
),

typed AS (
    SELECT
        TRY_CONVERT(DATETIME2(0), date_raw, 104) AS messzeitpunkt,
        category,
        wert,
        dss_source_filename,
        dss_source_feed,
        dss_run_id,
        dss_stage_timestamp,
        dss_export_datum
    FROM source
    WHERE TRY_CONVERT(DATETIME2(0), date_raw, 104) IS NOT NULL
      AND category IS NOT NULL
),

ranked AS (
    SELECT
        t.*,
        ROW_NUMBER() OVER (
            PARTITION BY t.category, t.messzeitpunkt
            -- jüngster Export gewinnt; Dateiname als stabiler Tie-Break
            ORDER BY t.dss_export_datum DESC, t.dss_source_filename DESC
        ) AS rn
    FROM typed t
)

SELECT
    z.id_zeitreihe,
    r.category,
    r.messzeitpunkt,
    r.wert,
    z.zeitschritt_min,
    z.einheit,
    r.dss_source_filename,
    r.dss_source_feed,
    r.dss_run_id,
    r.dss_stage_timestamp,
    r.dss_export_datum,
    CAST('ewb_ise' AS NVARCHAR(100))                            AS dss_record_source,
    -- Load Date je Zeile = Export-Zeitstempel dieses Werts (siehe Kopfkommentar, Punkt 5)
    COALESCE(r.dss_export_datum, CAST(GETDATE() AS DATETIME2))  AS dss_load_date

FROM ranked r
INNER JOIN {{ ref('ise_zeitreihe_dedup') }} z
    ON z.zeitreihe_key = r.category
WHERE r.rn = 1
