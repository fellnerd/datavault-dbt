/*
 * Dimension: dim_person_funktion_v
 * Schema: mart_project
 *
 * Mitarbeiterliste mit Funktion und Abteilung (nur aktive Mitarbeiter).
 * Entspricht der Original-Abfrage auf LOHN.LEN JOIN LTC(Funktion) JOIN LTC(Abteilung).
 *
 * Filter:
 *   - Nur aktive Mitarbeiter: date_out IS NULL
 *   - Nur mit Funktionszuordnung: code_2 nicht leer
 *
 * Hinweis: CODE_2 (Funktionscode) ist nicht im Payload von sat_person__abacus.
 * Bis der Satellite um CODE_2 erweitert wird, wird ewb_lohn_len_main (Staging)
 * für den Funktionscode herangezogen. Dies ist eine bewusste Ausnahme vom
 * Vault-First-Prinzip, dokumentiert als technische Schuld.
 *
 * Quell-Vault-Objekte:
 *   sat_person__abacus_current_v — Personendaten (aktueller Stand je hk_person)
 *   ewb_lohn_len_main            — CODE_2 Funktionscode (Staging, siehe Hinweis oben)
 *   ref_funktion_v               — Funktionsbezeichnung (LOHN.LTC via ID)
 *   ref_abteilung_v              — Abteilungsbezeichnung (LOHN.LTC, GROUP=1)
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

WITH person_current AS (
    SELECT
        hk_person,
        last_name,
        first_name,
        badge_id,
        CAST(home_dept_nr AS INT)          AS home_dept_nr,
        TRY_CAST(date_in AS DATE)          AS date_in,
        TRY_CAST(mutation_date AS DATE)    AS mutation_date,
        dss_load_date,
        dss_record_source
    FROM {{ ref('sat_person__abacus_current_v') }}
    WHERE dss_is_current = 'Y'
      AND date_out IS NULL
),

-- CODE_2 (Funktionscode) aus Staging, da nicht im Satellite-Payload enthalten
person_code2 AS (
    SELECT DISTINCT
        hk_person,
        code_2
    FROM {{ ref('ewb_lohn_len_main') }}
    WHERE code_2 IS NOT NULL
      AND LTRIM(RTRIM(CAST(code_2 AS NVARCHAR(MAX)))) != ''
),

combined AS (
    SELECT
        {{ surrogate_key('badge_id') }}    AS person_key,
        pc.badge_id,
        pc.last_name,
        pc.first_name,
        pc.home_dept_nr,
        pc.date_in,
        pc.mutation_date,
        p2.code_2                          AS funktion_code,
        pc.dss_load_date,
        pc.dss_record_source
    FROM person_current pc
    LEFT JOIN person_code2 p2
        ON pc.hk_person = p2.hk_person
)

SELECT
    c.person_key,
    CAST(c.badge_id AS NVARCHAR(255))                           AS person_id,
    CAST(c.badge_id AS NVARCHAR(255))                           AS person_code,
    ISNULL(
        NULLIF(CONCAT_WS(', ', c.last_name, c.first_name), ''),
        'UNKNOWN'
    )                                                           AS person_name,
    c.last_name,
    c.first_name,
    CAST(c.badge_id AS NVARCHAR(255))                          AS badge_id,
    c.home_dept_nr                                             AS abteilung_nr,
    ISNULL(ref_abt.description, 'UNKNOWN')                     AS abteilung,
    c.funktion_code,
    ISNULL(ref_fun.description, 'UNKNOWN')                     AS funktion,
    c.date_in                                                  AS eintritt,
    TRY_CAST(FORMAT(c.date_in, 'yyyyMMdd') AS INT)             AS eintritt_date_key,
    c.mutation_date,
    c.dss_load_date,
    c.dss_record_source
FROM combined c
LEFT JOIN {{ ref('ref_funktion_v') }} ref_fun
    ON CAST(c.funktion_code AS NVARCHAR(4000)) = ref_fun.id
LEFT JOIN {{ ref('ref_abteilung_v') }} ref_abt
    ON c.home_dept_nr = TRY_CAST(ref_abt.nr AS INT)
    AND TRY_CAST(ref_abt.group_nr AS INT) = 1
