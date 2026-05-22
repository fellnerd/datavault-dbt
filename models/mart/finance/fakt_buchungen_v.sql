/*
 * Faktentabelle: fakt_buchungen
 * Schema: mart_finance
 *
 * Hauptbuch-Buchungen (General Ledger) mit doppelter Perspektive.
 * Repliziert Synapse [Finance].[Buchungen] — 4-facher UNION ALL mit Vorzeichenlogik.
 *
 * Business-Logik (Doppik-Aufloesung):
 *   Jede GL-Zeile wird in 2 Perspektiven aufgeloest (Direct + Counter):
 *   - Teil 1: SH='S' (Soll), Direct  → Betrag NEGATIV, KTO, KST
 *   - Teil 2: SH='S' (Soll), Counter → Betrag POSITIV, GKTO, KST2
 *   - Teil 3: SH='H' (Haben), Direct  → Betrag POSITIV, KTO, KST
 *   - Teil 4: SH='H' (Haben), Counter → Betrag NEGATIV, GKTO, KST2
 *
 * MWST-Adjustierung:
 *   MWSTTYP='5' oder MWSTINCL='E' → Betrag unveraendert (inkl. MWST)
 *   Sonst → Betrag + MWSTBETR (MWST aufrechnen)
 *
 * Filter:
 *   - SAM <> '#' (keine Sammelbuchungen)
 *   - KST NOT IN (2990,3990,4990,5990,6990,7990) (keine Konsolidierung)
 *   - KTO > 30000 AND KTO < 90000 (nur Erfolgsrechnung)
 *
 * Granularitaet: 2 Zeilen pro GL-Buchungszeile (Direct + Counter Perspektive)
 *
 * Vault-Lineage:
 *   hub_hauptbuch.recnum + sat_hauptbuch__abacus_current_v (Buchungs-Attribute + KTO/DKBELEGNUMMER)
 *   KTO und DKBELEGNUMMER als denormalisierte Payload-Spalten im Satellite statt ueber Links,
 *   da link_hauptbuch_konto N:1 ist (RECNUM nicht unique ueber GL-Jahresscheiben → Cross-Product).
 *
 * Wave 3 Refactoring (2026-03-30):
 *   Staging-Join durch Vault-Links ersetzt. KTO aus hub_konto via link,
 *   DKBELEGNUMMER aus hub_buchungskopf via link. GKTO/KST/KST2 aus Satellite.
 *   Neue FK-Spalten: konto_key → dim_konto, kostenstelle_key → dim_kostenstelle.
 *
 * Bugfix (2026-03-31):
 *   Cross-Product durch link_hauptbuch_konto (871K Links fuer 433K Hubs, avg 2.01x).
 *   Fix: KTO + DKBELEGNUMMER direkt aus Satellite-Payload lesen statt ueber Links.
 *   Links bleiben im Vault korrekt, werden aber nicht im Mart-Join verwendet.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

WITH buchung_base AS (
    SELECT
        sh.[date],
        sh.sh,
        sh.betrag,
        sh.mwstbetr,
        sh.mwsttyp,
        sh.mwstincl,
        sh.mwstcode,
        sh.mwstsatz,
        sh.kto,
        sh.gkto,
        sh.kst,
        sh.kst2,
        sh.projebene,
        sh.dkbelegnummer,
        sh.dkkundennummer,
        sh.sam,
        sh.[text],
        sh.text2,
        sh.dss_load_date,
        sh.dss_record_source
    FROM {{ ref('hub_hauptbuch') }} hh
    INNER JOIN {{ ref('sat_hauptbuch__abacus_current_v') }} sh
        ON hh.hk_hauptbuch = sh.hk_hauptbuch
)

-- =====================================================
-- Teil 1: SH='S' (Soll), Perspektive Direct
--         Betrag NEGATIV, Konto=KTO, Kostenstelle=KST
-- =====================================================
SELECT
    TRY_CAST(FORMAT(TRY_CAST(b.[date] AS DATE), 'yyyyMMdd') AS INT) AS buchungsdatum_date_key,
    {{ surrogate_key('b.kto') }}                                      AS konto_key,
    {{ surrogate_key('CAST(b.kst AS NVARCHAR(MAX))') }}               AS kostenstelle_key,
    -1 * CASE
        WHEN TRY_CAST(b.mwsttyp AS DECIMAL(18,4)) = 5 OR b.mwstincl = 'E'
            THEN TRY_CAST(b.betrag AS DECIMAL(18,4))
            ELSE TRY_CAST(b.betrag AS DECIMAL(18,4))
                 + ISNULL(TRY_CAST(b.mwstbetr AS DECIMAL(18,4)), 0)
    END                                                               AS betrag,
    CAST(b.sh AS NVARCHAR(10))                                        AS soll_haben,
    TRY_CAST(b.kto AS INT)                                            AS konto_nr,
    TRY_CAST(b.gkto AS INT)                                           AS konto_nr_gegen,
    TRY_CAST(b.kst AS INT)                                            AS kostenstelle_nr,
    TRY_CAST(b.kst2 AS INT)                                           AS kostenstelle_nr_gegen,
    TRY_CAST(b.projebene AS INT)                                      AS projekt_nr,
    TRY_CAST(b.dkbelegnummer AS INT)                                  AS belegnummer,
    TRY_CAST(b.dkkundennummer AS INT)                                 AS kundennummer,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                                   AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    b.dss_load_date,
    b.dss_record_source
FROM buchung_base b
WHERE b.sh = 'S'
    AND b.sam <> '#'
    AND ISNULL(TRY_CAST(b.kst AS INT), 0) NOT IN (2990, 3990, 4990, 5990, 6990, 7990)
    AND TRY_CAST(b.kto AS INT) > 30000
    AND TRY_CAST(b.kto AS INT) < 90000

UNION ALL

-- =====================================================
-- Teil 2: SH='S' (Soll), Perspektive Counter
--         Betrag POSITIV, Konto=GKTO, Kostenstelle=KST2
-- =====================================================
SELECT
    TRY_CAST(FORMAT(TRY_CAST(b.[date] AS DATE), 'yyyyMMdd') AS INT) AS buchungsdatum_date_key,
    {{ surrogate_key('b.gkto') }}                                     AS konto_key,
    {{ surrogate_key('CAST(b.kst2 AS NVARCHAR(MAX))') }}              AS kostenstelle_key,
    CASE
        WHEN TRY_CAST(b.mwsttyp AS DECIMAL(18,4)) = 5 OR b.mwstincl = 'E'
            THEN TRY_CAST(b.betrag AS DECIMAL(18,4))
            ELSE TRY_CAST(b.betrag AS DECIMAL(18,4))
                 + ISNULL(TRY_CAST(b.mwstbetr AS DECIMAL(18,4)), 0)
    END                                                               AS betrag,
    CAST(b.sh AS NVARCHAR(10))                                        AS soll_haben,
    TRY_CAST(b.gkto AS INT)                                           AS konto_nr,
    TRY_CAST(b.kto AS INT)                                            AS konto_nr_gegen,
    TRY_CAST(b.kst2 AS INT)                                           AS kostenstelle_nr,
    TRY_CAST(b.kst AS INT)                                            AS kostenstelle_nr_gegen,
    TRY_CAST(b.projebene AS INT)                                      AS projekt_nr,
    TRY_CAST(b.dkbelegnummer AS INT)                                  AS belegnummer,
    TRY_CAST(b.dkkundennummer AS INT)                                 AS kundennummer,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                                   AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    b.dss_load_date,
    b.dss_record_source
FROM buchung_base b
WHERE b.sh = 'S'
    AND b.sam <> '#'
    AND ISNULL(TRY_CAST(b.kst2 AS INT), 0) NOT IN (2990, 3990, 4990, 5990, 6990, 7990)
    AND TRY_CAST(b.gkto AS INT) > 30000
    AND TRY_CAST(b.gkto AS INT) < 90000

UNION ALL

-- =====================================================
-- Teil 3: SH='H' (Haben), Perspektive Direct
--         Betrag POSITIV, Konto=KTO, Kostenstelle=KST
-- =====================================================
SELECT
    TRY_CAST(FORMAT(TRY_CAST(b.[date] AS DATE), 'yyyyMMdd') AS INT) AS buchungsdatum_date_key,
    {{ surrogate_key('b.kto') }}                                      AS konto_key,
    {{ surrogate_key('CAST(b.kst AS NVARCHAR(MAX))') }}               AS kostenstelle_key,
    CASE
        WHEN TRY_CAST(b.mwsttyp AS DECIMAL(18,4)) = 5 OR b.mwstincl = 'E'
            THEN TRY_CAST(b.betrag AS DECIMAL(18,4))
            ELSE TRY_CAST(b.betrag AS DECIMAL(18,4))
                 + ISNULL(TRY_CAST(b.mwstbetr AS DECIMAL(18,4)), 0)
    END                                                               AS betrag,
    CAST(b.sh AS NVARCHAR(10))                                        AS soll_haben,
    TRY_CAST(b.kto AS INT)                                            AS konto_nr,
    TRY_CAST(b.gkto AS INT)                                           AS konto_nr_gegen,
    TRY_CAST(b.kst AS INT)                                            AS kostenstelle_nr,
    TRY_CAST(b.kst2 AS INT)                                           AS kostenstelle_nr_gegen,
    TRY_CAST(b.projebene AS INT)                                      AS projekt_nr,
    TRY_CAST(b.dkbelegnummer AS INT)                                  AS belegnummer,
    TRY_CAST(b.dkkundennummer AS INT)                                 AS kundennummer,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                                   AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    b.dss_load_date,
    b.dss_record_source
FROM buchung_base b
WHERE b.sh = 'H'
    AND b.sam <> '#'
    AND ISNULL(TRY_CAST(b.kst AS INT), 0) NOT IN (2990, 3990, 4990, 5990, 6990, 7990)
    AND TRY_CAST(b.kto AS INT) > 30000
    AND TRY_CAST(b.kto AS INT) < 90000

UNION ALL

-- =====================================================
-- Teil 4: SH='H' (Haben), Perspektive Counter
--         Betrag NEGATIV, Konto=GKTO, Kostenstelle=KST2
-- =====================================================
SELECT
    TRY_CAST(FORMAT(TRY_CAST(b.[date] AS DATE), 'yyyyMMdd') AS INT) AS buchungsdatum_date_key,
    {{ surrogate_key('b.gkto') }}                                     AS konto_key,
    {{ surrogate_key('CAST(b.kst2 AS NVARCHAR(MAX))') }}              AS kostenstelle_key,
    -1 * CASE
        WHEN TRY_CAST(b.mwsttyp AS DECIMAL(18,4)) = 5 OR b.mwstincl = 'E'
            THEN TRY_CAST(b.betrag AS DECIMAL(18,4))
            ELSE TRY_CAST(b.betrag AS DECIMAL(18,4))
                 + ISNULL(TRY_CAST(b.mwstbetr AS DECIMAL(18,4)), 0)
    END                                                               AS betrag,
    CAST(b.sh AS NVARCHAR(10))                                        AS soll_haben,
    TRY_CAST(b.gkto AS INT)                                           AS konto_nr,
    TRY_CAST(b.kto AS INT)                                            AS konto_nr_gegen,
    TRY_CAST(b.kst2 AS INT)                                           AS kostenstelle_nr,
    TRY_CAST(b.kst AS INT)                                            AS kostenstelle_nr_gegen,
    TRY_CAST(b.projebene AS INT)                                      AS projekt_nr,
    TRY_CAST(b.dkbelegnummer AS INT)                                  AS belegnummer,
    TRY_CAST(b.dkkundennummer AS INT)                                 AS kundennummer,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                                   AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    b.dss_load_date,
    b.dss_record_source
FROM buchung_base b
WHERE b.sh = 'H'
    AND b.sam <> '#'
    AND ISNULL(TRY_CAST(b.kst2 AS INT), 0) NOT IN (2990, 3990, 4990, 5990, 6990, 7990)
    AND TRY_CAST(b.gkto AS INT) > 30000
    AND TRY_CAST(b.gkto AS INT) < 90000
