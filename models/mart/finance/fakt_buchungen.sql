/*
 * Faktentabelle: fakt_buchungen (materialisierter Performance-Cache)
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
 * Materialisierung: TABLE (Performance-Cache fuer Power BI DirectQuery)
 * Konsumenten nutzen fakt_buchungen_v (Wrapper-View, publiziertes Objekt).
 *
 * Security (RLS):
 *   dss_sec_value_key = 'ewb||<kostenstelle_nr>' (Perspektive: kst bzw. kst2).
 *   Physische Tabelle ist wegen Schema-Grant direkt lesbar -> native
 *   Security Policy sec.policy_fakt_buchungen (Kontext 'finance') via
 *   Hook-Paar. Hooks NIE einzeln entfernen (siehe macros/security/).
 *   Voraussetzung: security-DDL (Schema sec, Funktionen) deployed (sonst schlaegt der Run fehl).
 *
 * Vault-Lineage:
 *   hub_hauptbuch.recnum + sat_hauptbuch__abacus_current_v
 *
 * Indizes (2026-07-24, Performance-Fix — Tabelle war zuvor HEAP ohne jeglichen
 * Index trotz 80k+ Zeilen, jeder Dimension-Join war ein Full-Scan):
 *   NONCLUSTERED je konto_key, buchungsdatum_date_key, kostenstelle_key.
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['fact'],
    pre_hook=["{{ drop_security_policy() }}"],
    post_hook=[
        "{{ create_composite_index(['konto_key']) }}",
        "{{ create_composite_index(['buchungsdatum_date_key']) }}",
        "{{ create_composite_index(['kostenstelle_key']) }}",
        "{{ apply_security_policy('finance') }}"
    ]
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.kto AS DECIMAL(18,0)) AS INT)') }}          AS konto_key,
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.kst AS DECIMAL(18,0)) AS INT)') }} AS kostenstelle_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.dkkundennummer AS DECIMAL(18,0)) AS INT)') }} AS kreditor_key,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                  AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    {{ sec_value_key('CAST(TRY_CAST(b.kst AS INT) AS NVARCHAR(50))') }} AS dss_sec_value_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.gkto AS DECIMAL(18,0)) AS INT)') }}         AS konto_key,
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.kst2 AS DECIMAL(18,0)) AS INT)') }} AS kostenstelle_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.dkkundennummer AS DECIMAL(18,0)) AS INT)') }} AS kreditor_key,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                  AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    {{ sec_value_key('CAST(TRY_CAST(b.kst2 AS INT) AS NVARCHAR(50))') }} AS dss_sec_value_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.kto AS DECIMAL(18,0)) AS INT)') }}          AS konto_key,
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.kst AS DECIMAL(18,0)) AS INT)') }} AS kostenstelle_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.dkkundennummer AS DECIMAL(18,0)) AS INT)') }} AS kreditor_key,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                  AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    {{ sec_value_key('CAST(TRY_CAST(b.kst AS INT) AS NVARCHAR(50))') }} AS dss_sec_value_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.gkto AS DECIMAL(18,0)) AS INT)') }}         AS konto_key,
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.kst2 AS DECIMAL(18,0)) AS INT)') }} AS kostenstelle_key,
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
    {{ surrogate_key('TRY_CAST(TRY_CAST(b.dkkundennummer AS DECIMAL(18,0)) AS INT)') }} AS kreditor_key,
    TRY_CAST(b.mwstbetr AS DECIMAL(18,4))                             AS mwst_betrag,
    CAST(TRY_CAST(b.mwsttyp AS INT) AS NVARCHAR(10))                  AS mwst_typ,
    CAST(b.mwstcode AS NVARCHAR(50))                                  AS mwst_code,
    CAST(b.mwstincl AS NVARCHAR(10))                                  AS mwst_incl,
    TRY_CAST(b.mwstsatz AS DECIMAL(18,4))                             AS mwst_satz,
    CAST(b.[text] AS NVARCHAR(4000))                                  AS umschreibung,
    CAST(b.text2 AS NVARCHAR(4000))                                   AS umschreibung2,
    CAST(b.sam AS NVARCHAR(10))                                        AS sam,
    {{ sec_value_key('CAST(TRY_CAST(b.kst2 AS INT) AS NVARCHAR(50))') }} AS dss_sec_value_key,
    b.dss_load_date,
    b.dss_record_source
FROM buchung_base b
WHERE b.sh = 'H'
    AND b.sam <> '#'
    AND ISNULL(TRY_CAST(b.kst2 AS INT), 0) NOT IN (2990, 3990, 4990, 5990, 6990, 7990)
    AND TRY_CAST(b.gkto AS INT) > 30000
    AND TRY_CAST(b.gkto AS INT) < 90000
