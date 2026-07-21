/*
 * Dimension: dim_konto
 * Schema: mart_finance
 *
 * Kontenplan (Chart of Accounts) mit Sharepoint-Hierarchie.
 * Ghost Hub: Konto-Nummern werden aus Hauptbuch-Buchungszeilen (FIBU.GL) abgeleitet.
 * Stammdaten (Kontenplan) aus Sharepoint ref_konto (254 Konten).
 *
 * Hierarchie (analog Finance001 Power BI Modell):
 *   konto_l2    = Top-Klasse (1-stellig, mit 6a/6b/6c-Subkategorien)
 *                 z.B. "3 Ertrag", "4 Aufwand", "6a Uebriger Betriebsaufwand"
 *   konto_l1    = Subklasse (2-stellig)
 *                 z.B. "30 Ertrag Netz", "40 Aufwand Production"
 *   konto_label = Detail (5-stellig + Bezeichnung)
 *                 z.B. "30100 Ertrag Strom-Energie"
 *
 * konto_gruppe(_name) entsprechen der Top-Klasse (L2 = breitere Kategorie),
 * konto_subgruppe(_name) der Subklasse (L1 = engere Kategorie).
 *
 * Vault-Lineage: hub_konto.kto LEFT JOIN ref_konto_v (Sharepoint Kontenplan)
 * LEFT JOIN: Nicht alle GL-Konto-Nummern haben einen Sharepoint-Eintrag.
 *
 * Plug-Zeilen (UNION ALL):
 *   8 synthetische Zeilen je Top-Klasse (3, 4, 5, 6a, 6b, 6c, 7, 8) damit
 *   Zebra BI Tables / Plug-Zero-Logic im Visual auch leere Kategorien anzeigt,
 *   plus 6 Summary-Plugs (Zwischensummen 4x..9x). Quelle: Business Vault
 *   konto_pl_zuordnung_v / konto_pl_stufen_v (zentrale P&L-Hierarchie-Regel,
 *   ersetzt die vorherige hartcodierte VALUES()-Liste — dieselbe Regel speist
 *   auch die Power-BI-Calculation-Group "Summary Lines").
 *   konto_key < 0, konto_id/code/name NULL, konto_l1/konto_label NULL.
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

WITH base AS (
    -- Konten-Universum: hub_konto (KTO aus Buchungen) UNION ref_konto (Sharepoint Stammdaten)
    -- Notwendig, weil einige Konten (z.B. 59090, 65050, 68000) NUR als GKTO in den Buchungen
    -- erscheinen und nicht in hub_konto sind, aber im Sharepoint-Kontenplan vorhanden sind.
    SELECT
        konto_nr,
        MIN(dss_load_date)                              AS dss_load_date,
        MIN(dss_record_source)                          AS dss_record_source
    FROM (
        SELECT
            TRY_CAST(TRY_CAST(hk.kto AS DECIMAL(18,0)) AS INT) AS konto_nr,
            hk.dss_load_date,
            hk.dss_record_source
        FROM {{ ref('hub_konto') }} hk
        WHERE TRY_CAST(TRY_CAST(hk.kto AS DECIMAL(18,0)) AS INT) IS NOT NULL

        UNION

        SELECT
            rk.KontoNr                                  AS konto_nr,
            CAST(GETDATE() AS DATETIME2(7))             AS dss_load_date,
            CAST('ewb_sharepoint' AS NVARCHAR(255))     AS dss_record_source
        FROM {{ ref('ref_konto_v') }} rk
        WHERE rk.KontoNr IS NOT NULL
    ) u
    GROUP BY konto_nr
),
enriched AS (
    SELECT
        {{ surrogate_key('b.konto_nr') }}                                          AS konto_key,
        CAST(b.konto_nr AS NVARCHAR(255))                                          AS konto_id,
        CAST(b.konto_nr AS NVARCHAR(255))                                          AS konto_code,
        ISNULL(CAST(rk.KontoName AS NVARCHAR(255)),
               ISNULL(CAST(b.konto_nr AS NVARCHAR(255)), 'UNKNOWN'))               AS konto_name,
        -- Gruppe = Top-Klasse (Konto_L2 in Sharepoint)
        CAST(rk.Konto_L2 AS NVARCHAR(255))                                         AS konto_gruppe,
        CAST(rk.KontoName_L2 AS NVARCHAR(255))                                     AS konto_gruppe_name,
        -- Subgruppe = Sub-Klasse (Konto_L1 in Sharepoint)
        CAST(rk.Konto_L1 AS NVARCHAR(255))                                         AS konto_subgruppe,
        CAST(rk.KontoName_L1 AS NVARCHAR(255))                                     AS konto_subgruppe_name,
        -- Power-BI Hierarchie-Spalten (Format: "Code Name", analog Finance001)
        -- Normalisierung + Sortierung kommen aus dem Business Vault (konto_pl_zuordnung_v):
        -- konto_l2_korrektur ist NUR fuer "6a" gesetzt (bekannter Sharepoint-Encoding-Fehler,
        -- z.B. Ü -> garbled) — fuer alle anderen Gruppen faellt COALESCE auf den rohen
        -- Sharepoint-Wert zurueck.
        COALESCE(z.konto_l2_korrektur, CAST(rk.Konto_L2 AS NVARCHAR(255)))         AS konto_l2,
        CAST(rk.Konto_L1 AS NVARCHAR(255))                                         AS konto_l1,
        ISNULL(CAST(rk.Konto AS NVARCHAR(500)),
               CONCAT_WS(' ', CAST(b.konto_nr AS NVARCHAR(255)), rk.KontoName))    AS konto_label,
        -- Sortierspalte fuer korrekte Reihenfolge im Visual (3→4→5→6a→6b→6c→7→8→x)
        COALESCE(z.konto_sort, 99)                                                 AS konto_sort,
        b.dss_load_date,
        b.dss_record_source
    FROM base b
    LEFT JOIN {{ ref('ref_konto_v') }} rk
        ON b.konto_nr = rk.KontoNr
    LEFT JOIN {{ ref('konto_pl_zuordnung_v') }} z
        ON CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE z.konto_l2_prefix + '%'
),
konto_l2_distinct AS (
    -- Distinkte reale Kontogruppen aus Sharepoint (Single Source of Truth fuer Label/Name)
    -- fuer die Gruppen-Plugs unten. NICHT aus dem Business Vault — der liefert nur Sortierung/
    -- Encoding-Korrektur/Plug-Key, keine Labels.
    SELECT DISTINCT
        CAST(Konto_L2 AS NVARCHAR(255))     AS konto_l2_raw,
        CAST(KontoName_L2 AS NVARCHAR(255)) AS konto_l2_name_raw
    FROM {{ ref('ref_konto_v') }}
    WHERE Konto_L2 IS NOT NULL
)

SELECT * FROM enriched

UNION ALL

-- Gruppen-Plugs fuer Zebra BI (konto_key -3..-8,-61..-63): Sichern Kategorie-Sichtbarkeit bei 0-Werten.
-- Label/Name: echte Sharepoint-Daten (konto_l2_distinct). Sortierung/Encoding-Korrektur/Plug-Key:
-- Business Vault konto_pl_zuordnung_v. "x Hilfskonten" hat dort konto_key_plug=NULL -> kein Plug (INNER JOIN).
-- konto_key < 0, konto_id/code/name/l1/label NULL, konto_l2 = Label, konto_sort = Sortierwert
SELECT
    z.konto_key_plug                                                    AS konto_key,
    CAST(NULL AS NVARCHAR(255))                                         AS konto_id,
    CAST(NULL AS NVARCHAR(255))                                         AS konto_code,
    CAST(NULL AS NVARCHAR(255))                                         AS konto_name,
    COALESCE(z.konto_l2_korrektur, g.konto_l2_raw)                      AS konto_gruppe,
    COALESCE(z.konto_l2_name_korrektur, LTRIM(RTRIM(g.konto_l2_name_raw))) AS konto_gruppe_name,
    CAST(NULL AS NVARCHAR(255))                                         AS konto_subgruppe,
    CAST(NULL AS NVARCHAR(255))                                         AS konto_subgruppe_name,
    COALESCE(z.konto_l2_korrektur, g.konto_l2_raw)                      AS konto_l2,
    CAST(NULL AS NVARCHAR(255))                                         AS konto_l1,
    CAST(NULL AS NVARCHAR(500))                                         AS konto_label,
    z.konto_sort                                                        AS konto_sort,
    CAST(GETDATE() AS DATETIME2(7))                                     AS dss_load_date,
    CAST('plug' AS NVARCHAR(255))                                       AS dss_record_source
FROM konto_l2_distinct g
JOIN {{ ref('konto_pl_zuordnung_v') }} z
    ON g.konto_l2_raw LIKE z.konto_l2_prefix + '%'
WHERE z.konto_key_plug IS NOT NULL

UNION ALL

-- Summary-Plugs fuer Zebra BI (konto_key -41,-51,-611,-621,-71,-91): Zwischensummen-Zeilen (fett im Visual).
-- Quelle: Business Vault konto_pl_stufen_v (zentrale Business-Regel).
SELECT
    s.konto_key_plug                              AS konto_key,
    CAST(NULL AS NVARCHAR(255))                   AS konto_id,
    CAST(NULL AS NVARCHAR(255))                   AS konto_code,
    CAST(NULL AS NVARCHAR(255))                   AS konto_name,
    s.subtotal_label                              AS konto_gruppe,
    s.subtotal_label                              AS konto_gruppe_name,
    CAST(NULL AS NVARCHAR(255))                   AS konto_subgruppe,
    CAST(NULL AS NVARCHAR(255))                   AS konto_subgruppe_name,
    s.subtotal_label                              AS konto_l2,
    CAST(NULL AS NVARCHAR(255))                   AS konto_l1,
    CAST(NULL AS NVARCHAR(500))                   AS konto_label,
    s.konto_sort                                  AS konto_sort,
    CAST(GETDATE() AS DATETIME2(7))               AS dss_load_date,
    CAST('plug' AS NVARCHAR(255))                 AS dss_record_source
FROM {{ ref('konto_pl_stufen_v') }} s
