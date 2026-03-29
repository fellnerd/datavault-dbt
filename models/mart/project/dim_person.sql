/*
 * Dimension: dim_person
 * Schema: mart_project
 *
 * Mitarbeiterstammdaten mit Abteilungszuordnung.
 * Repliziert Synapse structured-tables [Projekt].[Personal] + [Projekt].[Abteilung].
 *
 * Surrogate Key: PersonalNr (INT) = ADR.LOHNNR = LEN.EMPL_NR
 *
 * Quell-Vault-Objekte:
 *   - hub_adresse + sat_person_adresse (Name, Vorname aus PUBL.ADR)
 *   - hub_person + sat_person (Initialen, Abteilung, Eintritt/Austritt aus LOHN.LEN)
 *   - link_adresse_person (ADR ↔ LEN via LOHNNR = EMPL_NR)
 *   - ref_abteilung (Abteilungsname, GROUP=1)
 *   - ewb_publ_adr_main (Staging: LOHNJN/GESPERRT Filter)
 *
 * Business-Logik (aus Azure Pipeline / Synapse):
 *   1. Nur aktive Mitarbeiter: LOHNJN='1', GESPERRT=0, LOHNNR<>0
 *   2. Initialen: aktueller Wert via dss_is_current='Y'
 *   3. Abteilung: Nur GROUP=1 (eigentliche Abteilungen)
 *   4. DISTINCT: Duplikate entfernen
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['dimension'],
    post_hook=[
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_person_pk' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_person_pk ON {{ this }} (PersonalNr)"
    ]
) }}

WITH aktive_adressen AS (
    SELECT
        hk_adresse,
        CAST(lohnnr AS INT) AS PersonalNr
    FROM {{ ref('ewb_publ_adr_main') }}
    WHERE lohnjn = '1'
      AND gesperrt = 0
      AND CAST(lohnnr AS DECIMAL(38,18)) <> 0
),

person_name AS (
    SELECT hk_adresse, name, vorname
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
        aa.PersonalNr,
        pn.name                              AS Name,
        pn.vorname                           AS Vorname,
        pd.abrv                              AS Initialen,
        pd.home_dept_nr                      AS AbteilungNr,
        ref_abt.description                  AS Abteilung,
        pd.mutation_date                     AS MutationDate,
        pd.date_in                           AS Eintritt,
        pd.date_out                          AS Austritt,
        ROW_NUMBER() OVER (
            PARTITION BY aa.PersonalNr
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
    PersonalNr,
    Name,
    Vorname,
    Initialen,
    AbteilungNr,
    Abteilung,
    MutationDate,
    Eintritt,
    Austritt
FROM joined
WHERE rn = 1
