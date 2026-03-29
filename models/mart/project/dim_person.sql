/*
 * Dimension: dim_person
 * Schema: mart_project
 *
 * Mitarbeiterstammdaten mit Abteilungszuordnung.
 * Repliziert Synapse [Projekt].[Personal] + [Projekt].[Abteilung].
 *
 * Quell-Vault-Objekte:
 *   hub_adresse + sat_person_adresse, hub_person + sat_person,
 *   link_adresse_person, ref_abteilung, ewb_publ_adr_main
 *
 * Business-Logik:
 *   1. Nur aktive Mitarbeiter: LOHNJN='1', GESPERRT=0, LOHNNR<>0
 *   2. Initialen via dss_is_current='Y'
 *   3. Abteilung: Nur GROUP=1
 *   4. Dedup: ROW_NUMBER nach MutationDate DESC
 *
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

WITH aktive_adressen AS (
    SELECT
        hk_adresse,
        ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(lohnnr AS NVARCHAR(MAX))))) AS person_key
    FROM {{ ref('ewb_publ_adr_main') }}
    WHERE lohnjn = '1'
      AND gesperrt = 0
      AND CAST(lohnnr AS DECIMAL(38,18)) <> 0
),

person_name AS (
    SELECT hk_adresse, name, vorname, dss_load_date, dss_record_source
    FROM {{ ref('sat_person_adresse') }}
    WHERE dss_is_current = 'Y'
),

person_details AS (
    SELECT
        hk_person,
        abrv,
        CAST(home_dept_nr AS INT) AS home_dept_nr,
        TRY_CAST(mutation_date AS DATE) AS mutation_date,
        TRY_CAST(date_in AS DATE) AS date_in,
        TRY_CAST(date_out AS DATE) AS date_out
    FROM {{ ref('sat_person') }}
    WHERE dss_is_current = 'Y'
),

joined AS (
    SELECT
        aa.person_key,
        pn.name,
        pn.vorname,
        pd.abrv,
        pd.home_dept_nr,
        ref_abt.description                  AS abteilung,
        pd.mutation_date,
        pd.date_in,
        pd.date_out,
        pn.dss_load_date,
        pn.dss_record_source,
        ROW_NUMBER() OVER (
            PARTITION BY aa.person_key
            ORDER BY pd.mutation_date DESC, pn.name
        ) AS rn
    FROM aktive_adressen aa
    INNER JOIN person_name pn
        ON aa.hk_adresse = pn.hk_adresse
    LEFT JOIN {{ ref('link_adresse_person') }} lap
        ON aa.hk_adresse = lap.hk_adresse
    LEFT JOIN person_details pd
        ON lap.hk_person = pd.hk_person
    LEFT JOIN {{ ref('ref_abteilung') }} ref_abt
        ON pd.home_dept_nr = TRY_CAST(ref_abt.nr AS INT)
        AND TRY_CAST(ref_abt.group_nr AS INT) = 1
)

SELECT
    person_key,
    CAST(person_key AS NVARCHAR(255))                                       AS person_id,
    ISNULL(abrv, CAST(person_key AS NVARCHAR(255)))                         AS person_code,
    ISNULL(
        NULLIF(CONCAT_WS(', ', name, vorname), ''),
        ISNULL(abrv, 'UNKNOWN')
    )                                                                        AS person_name,
    CAST(home_dept_nr AS INT)                                                AS abteilung_nr,
    ISNULL(abteilung, 'UNKNOWN')                                             AS abteilung,
    mutation_date,
    date_in                                                                  AS eintritt,
    date_out                                                                 AS austritt,
    dss_load_date,
    dss_record_source
FROM joined
WHERE rn = 1
