/*
 * Effectivity Satellite: eff_sat_company_country
 * Schema: vault
 * 
 * Trackt die Gültigkeitszeiträume der Company-Country Beziehung.
 * Ermöglicht Abfragen wie: "In welchem Land war Firma X am Datum Y?"
 * 
 * DV 2.1 Pattern: Effectivity Satellite auf Link
 */

{{ config(
    materialized='incremental',
    unique_key='hk_link_company_country',
    as_columnstore=false,
    post_hook=[
        "{{ update_effectivity_end_dates() }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_link_company_country,
        hk_company,
        hk_country,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_company') }}
    WHERE hk_link_company_country IS NOT NULL
      AND hk_country IS NOT NULL
),

{% if is_incremental() %}
existing_records AS (
    SELECT 
        hk_link_company_country,
        hk_company,
        dss_start_date
    FROM {{ this }}
    WHERE dss_is_active = 'Y'
),
{% endif %}

-- Neue Beziehungen erkennen
new_relationships AS (
    SELECT DISTINCT
        src.hk_link_company_country,
        src.hk_company,
        src.hk_country,
        src.dss_load_date AS dss_start_date,
        CAST(NULL AS DATETIME2) AS dss_end_date,
        'Y' AS dss_is_active,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_records er
        WHERE er.hk_link_company_country = src.hk_link_company_country
    )
    {% endif %}
)

SELECT * FROM new_relationships
