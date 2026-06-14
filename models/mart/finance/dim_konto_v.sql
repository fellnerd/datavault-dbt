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
 *   Zebra BI Tables / Plug-Zero-Logic im Visual auch leere Kategorien anzeigt.
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
        -- Normalize konto_l2: Konto_L2 from ref_konto may have encoding issues (e.g. Ü → garbled)
        -- Use LIKE-based normalization to ensure consistent labels matching CalculationGroup items
        CASE
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '6a%' THEN '6a Uebriger Betriebsaufwand'
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '6b%' THEN '6b Abschreibungen'
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '6c%' THEN '6c Finanzierung'
            ELSE CAST(rk.Konto_L2 AS NVARCHAR(255))
        END                                                                         AS konto_l2,
        CAST(rk.Konto_L1 AS NVARCHAR(255))                                         AS konto_l1,
        ISNULL(CAST(rk.Konto AS NVARCHAR(500)),
               CONCAT_WS(' ', CAST(b.konto_nr AS NVARCHAR(255)), rk.KontoName))    AS konto_label,
        -- Sortierspalte fuer korrekte Reihenfolge im Visual (3→4→5→6a→6b→6c→7→8→x)
        CASE
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '3%' THEN 10
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '4%' THEN 20
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '5%' THEN 30
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '6a%' THEN 40
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '6b%' THEN 50
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '6c%' THEN 60
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '7%' THEN 70
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE '8%' THEN 80
            WHEN CAST(rk.Konto_L2 AS NVARCHAR(255)) LIKE 'x%' THEN 90
            ELSE 99
        END                                                                         AS konto_sort,
        b.dss_load_date,
        b.dss_record_source
    FROM base b
    LEFT JOIN {{ ref('ref_konto_v') }} rk
        ON b.konto_nr = rk.KontoNr
)

SELECT * FROM enriched

UNION ALL

-- Plug-Zeilen fuer Zebra BI (8 Gruppen + 6 Summary-Lines)
-- Gruppen-Plugs (konto_key -3..-8,-61..-63): Sichern Kategorie-Sichtbarkeit bei 0-Werten
-- Summary-Plugs (konto_key -41,-51,-611,-621,-71,-91): Zwischen-Summen-Zeilen (fett im Visual)
-- konto_key < 0, konto_id/code/name/l1/label NULL, konto_l2 = Label, konto_sort = Sortierwert
SELECT
    plug.konto_key                                AS konto_key,
    CAST(NULL AS NVARCHAR(255))                   AS konto_id,
    CAST(NULL AS NVARCHAR(255))                   AS konto_code,
    CAST(NULL AS NVARCHAR(255))                   AS konto_name,
    plug.plug_l2                                  AS konto_gruppe,
    plug.plug_l2_name                             AS konto_gruppe_name,
    CAST(NULL AS NVARCHAR(255))                   AS konto_subgruppe,
    CAST(NULL AS NVARCHAR(255))                   AS konto_subgruppe_name,
    plug.plug_l2                                  AS konto_l2,
    CAST(NULL AS NVARCHAR(255))                   AS konto_l1,
    CAST(NULL AS NVARCHAR(500))                   AS konto_label,
    plug.konto_sort                               AS konto_sort,
    CAST(GETDATE() AS DATETIME2(7))               AS dss_load_date,
    CAST('plug' AS NVARCHAR(255))                 AS dss_record_source
FROM (VALUES
    -- Gruppen-Plugs (Reihenfolge: sort 10-90)
    (CAST(-3   AS BIGINT), CAST('3 Ertrag'                            AS NVARCHAR(255)), CAST('Ertrag'                            AS NVARCHAR(255)), CAST(10 AS INT)),
    (CAST(-4   AS BIGINT), CAST('4 Aufwand'                           AS NVARCHAR(255)), CAST('Aufwand'                           AS NVARCHAR(255)), CAST(20 AS INT)),
    (CAST(-5   AS BIGINT), CAST('5 Personalaufwand'                   AS NVARCHAR(255)), CAST('Personalaufwand'                   AS NVARCHAR(255)), CAST(30 AS INT)),
    (CAST(-61  AS BIGINT), CAST('6a Uebriger Betriebsaufwand'         AS NVARCHAR(255)), CAST('Uebriger Betriebsaufwand'          AS NVARCHAR(255)), CAST(40 AS INT)),
    (CAST(-62  AS BIGINT), CAST('6b Abschreibungen'                   AS NVARCHAR(255)), CAST('Abschreibungen'                    AS NVARCHAR(255)), CAST(50 AS INT)),
    (CAST(-63  AS BIGINT), CAST('6c Finanzierung'                     AS NVARCHAR(255)), CAST('Finanzierung'                      AS NVARCHAR(255)), CAST(60 AS INT)),
    (CAST(-7   AS BIGINT), CAST('7 Umlagen'                           AS NVARCHAR(255)), CAST('Umlagen'                           AS NVARCHAR(255)), CAST(70 AS INT)),
    (CAST(-8   AS BIGINT), CAST('8 Ausserord. & Betriebsfr. Ergebnis' AS NVARCHAR(255)), CAST('Ausserord. & Betriebsfr. Ergebnis' AS NVARCHAR(255)), CAST(80 AS INT)),
    -- Summary-Plugs: Zwischensummen-Zeilen (sort 25-85, zwischen den Gruppen)
    (CAST(-41  AS BIGINT), CAST('4x Bruttoergebnis'                   AS NVARCHAR(255)), CAST('4x Bruttoergebnis'                 AS NVARCHAR(255)), CAST(25 AS INT)),
    (CAST(-51  AS BIGINT), CAST('5x Bruttoergebnis mit Personal'      AS NVARCHAR(255)), CAST('5x Bruttoergebnis mit Personal'    AS NVARCHAR(255)), CAST(35 AS INT)),
    (CAST(-611 AS BIGINT), CAST('6ax EBITDA'                          AS NVARCHAR(255)), CAST('6ax EBITDA'                        AS NVARCHAR(255)), CAST(45 AS INT)),
    (CAST(-621 AS BIGINT), CAST('6bx EBIT'                            AS NVARCHAR(255)), CAST('6bx EBIT'                          AS NVARCHAR(255)), CAST(55 AS INT)),
    (CAST(-71  AS BIGINT), CAST('7x Betriebsergebnis'                 AS NVARCHAR(255)), CAST('7x Betriebsergebnis'               AS NVARCHAR(255)), CAST(75 AS INT)),
    (CAST(-91  AS BIGINT), CAST('9x Ergebnis'                         AS NVARCHAR(255)), CAST('9x Ergebnis'                       AS NVARCHAR(255)), CAST(85 AS INT))
) AS plug(konto_key, plug_l2, plug_l2_name, konto_sort)
