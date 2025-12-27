/*
 * Satellite: sat_country
 * Schema: vault
 * 
 * Attribute für Länder.
 * dss_is_current: 'Y' für aktuellen Eintrag, 'N' für historische
 * dss_end_date: Enddatum der Gültigkeit (NULL = aktuell)
 */

{{ config(
    materialized='incremental',
    unique_key='hk_country',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_country') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_country,
        hd_country,
        dss_load_date,
        dss_record_source,
        -- Payload
        name
    FROM {{ ref('stg_country') }}
    WHERE hk_country IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_country,
        hd_country
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_country,
        src.hd_country,
        src.dss_load_date,
        src.dss_record_source,
        src.name
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_country = src.hk_country
          AND es.hd_country = src.hd_country
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
