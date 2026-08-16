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
 * 3. Duplikate auflösen
 *    Die External Table liest ALLE Export-Dateien. Der werktägliche Export enthält
 *    ein rollierendes 5-Tage-Fenster, dazu kam ein Juli-Backfill → derselbe
 *    (Category, Date) erscheint bis zu 5×.
 *
 * ⚠ Einschränkung "letzter Export gewinnt":
 *   Die Werte werden nachträglich korrigiert (Ersatz- → validierter Wert):
 *   6'267 (Category, Date)-Paare tragen mehr als einen Wert. Welcher davon der
 *   neueste ist, lässt sich derzeit NICHT bestimmen — die External Table hat keine
 *   Herkunftsspalte, und filename()/filepath() werden von Azure SQL DB auf
 *   External Tables nicht unterstützt (geprüft). Der ROW_NUMBER unten ist deshalb
 *   nur ein deterministischer Platzhalter: er liefert reproduzierbar genau einen
 *   Wert je Zeitpunkt (und verhindert damit Doppelzählung), trifft bei revidierten
 *   Werten aber nicht garantiert den aktuellen.
 *   Dauerhafte Lösung: $$FILEPATH als additionalColumns in der ADF-Pipeline
 *   CopyPipeline_Lastgaenge mitschreiben; danach hier auf
 *   "ORDER BY source_file DESC" umstellen.
 *   Siehe docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md §12.7 (Q-3/Q-4).
 */

{{ config(materialized='view', tags=['ise']) }}

WITH source AS (
    SELECT
        [Date]     AS date_raw,
        [Category] AS category,
        [Value]    AS wert
    FROM {{ source('staging', 'ext_ise_lastgaenge') }}
),

typed AS (
    SELECT
        TRY_CONVERT(DATETIME2(0), date_raw, 104) AS messzeitpunkt,
        category,
        wert
    FROM source
    WHERE TRY_CONVERT(DATETIME2(0), date_raw, 104) IS NOT NULL
      AND category IS NOT NULL
),

ranked AS (
    SELECT
        t.messzeitpunkt,
        t.category,
        t.wert,
        ROW_NUMBER() OVER (
            PARTITION BY t.category, t.messzeitpunkt
            ORDER BY t.wert DESC
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
    CAST('ewb_ise' AS NVARCHAR(100)) AS dss_record_source,
    CAST(GETDATE() AS DATETIME2)     AS dss_load_date

FROM ranked r
INNER JOIN {{ ref('ise_zeitreihe_dedup') }} z
    ON z.zeitreihe_key = r.category
WHERE r.rn = 1
