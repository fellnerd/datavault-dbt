/*
 * Dimension: dim_abteilung
 * Schema: mart_project
 *
 * Historische Mitarbeiter-Abteilungs-Zuordnungen (alle Mutationen).
 * Repliziert Synapse [Projekt].[Abteilung] (LEN LEFT JOIN LTC).
 *
 * Granularitaet: 1 Zeile pro (EMPL_NR × HOME_DEPT_NR × MUTATION_DATE)
 *   — DISTINCT auf alle 4 Felder (wie Synapse-Referenzlogik)
 *   — Alle historischen Records (sat_person__abacus ohne Current-Filter)
 *
 * Vault-Lineage:
 *   hub_person.empl_nr
 *   + sat_person__abacus (ALLE historischen Zeilen, kein dss_is_current Filter)
 *   + ref_abteilung WHERE group_nr=1 (Abteilungsbezeichnungen)
 *
 * Spalten-Mapping (Vault → Mart):
 *   hub_person.empl_nr          → abteilung_key (SK), personal_nr, person_key
 *   sat_person.home_dept_nr     → abteilung_nr
 *   ref_abteilung.description   → abteilung_name (Fallback: 'UNKNOWN')
 *   sat_person.mutation_date    → mutation_date
 *
 * Filter: home_dept_nr IS NOT NULL (ignoriert Datensaetze ohne Abteilungszuordnung)
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT DISTINCT
    -- Keys
    {{ surrogate_key('CAST(sp.home_dept_nr AS NVARCHAR(255))') }}      AS abteilung_key,
    {{ surrogate_key('CAST(hp.empl_nr AS NVARCHAR(255))') }}            AS person_key,
    -- Dimension Attributes
    CAST(sp.home_dept_nr AS NVARCHAR(255))                              AS abteilung_nr,
    ISNULL(ref_abt.description, 'UNKNOWN')                              AS abteilung_name,
    CAST(hp.empl_nr AS NVARCHAR(255))                                   AS personal_nr,
    TRY_CAST(sp.mutation_date AS DATE)                                  AS mutation_date,
    -- Metadata
    sp.dss_load_date,
    sp.dss_record_source
FROM {{ ref('hub_person') }} hp
INNER JOIN {{ ref('sat_person__abacus') }} sp
    ON hp.hk_person = sp.hk_person
LEFT JOIN {{ ref('ref_abteilung_v') }} ref_abt
    ON TRY_CAST(sp.home_dept_nr AS INT) = TRY_CAST(ref_abt.nr AS INT)
    AND TRY_CAST(ref_abt.group_nr AS INT) = 1
WHERE sp.home_dept_nr IS NOT NULL
