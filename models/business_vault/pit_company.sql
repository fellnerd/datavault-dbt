/*
 * Point-in-Time Table: pit_company
 * Schema: vault (Business Vault)
 * 
 * PIT-Tabelle für effiziente Point-in-Time Abfragen auf sat_company.
 * Vermeidet ROW_NUMBER() Berechnungen zur Laufzeit.
 * 
 * Wird täglich neu aufgebaut (full-refresh) mit allen relevanten Snapshot-Dates.
 */

{{ config(
    materialized='table',
    as_columnstore=false
) }}

WITH 

-- Alle eindeutigen Snapshot-Dates aus sat_company
snapshot_dates AS (
    SELECT DISTINCT 
        CAST(dss_load_date AS DATE) AS snapshot_date
    FROM {{ ref('sat_company') }}
),

-- Alle Companies aus dem Hub
companies AS (
    SELECT DISTINCT hk_company
    FROM {{ ref('hub_company') }}
),

-- Kreuzprodukt: Jede Company x Jeder Snapshot-Date
company_dates AS (
    SELECT 
        c.hk_company,
        sd.snapshot_date
    FROM companies c
    CROSS JOIN snapshot_dates sd
),

-- Finde für jeden Snapshot-Date den gültigen Satellite-Eintrag
pit_records AS (
    SELECT 
        cd.hk_company,
        cd.snapshot_date,
        (
            SELECT TOP 1 s.hk_company
            FROM {{ ref('sat_company') }} s
            WHERE s.hk_company = cd.hk_company
              AND CAST(s.dss_load_date AS DATE) <= cd.snapshot_date
            ORDER BY s.dss_load_date DESC
        ) AS sat_company_hk,
        (
            SELECT TOP 1 s.dss_load_date
            FROM {{ ref('sat_company') }} s
            WHERE s.hk_company = cd.hk_company
              AND CAST(s.dss_load_date AS DATE) <= cd.snapshot_date
            ORDER BY s.dss_load_date DESC
        ) AS sat_company_load_date
    FROM company_dates cd
)

SELECT 
    hk_company,
    snapshot_date,
    sat_company_hk,
    sat_company_load_date,
    GETDATE() AS dss_load_date,
    'PIT_GENERATION' AS dss_record_source
FROM pit_records
WHERE sat_company_hk IS NOT NULL
