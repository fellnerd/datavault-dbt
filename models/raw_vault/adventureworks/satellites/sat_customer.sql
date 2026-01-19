/*
 * Satellite: sat_customer
 * Parent Hub: hub_customer
 * Source: stg_aw_customer
 */

{{ config(
    materialized='incremental',
    unique_key='hk_customer',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_customer') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_customer,
        hd_customer,
        dss_load_date,
        dss_record_source,
        NameStyle,
        Title,
        FirstName,
        MiddleName,
        LastName,
        Suffix,
        CompanyName
    FROM {{ ref('adventureworks_customer') }}
    WHERE hk_customer IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_customer,
        hd_customer
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_customer,
        src.hd_customer,
        src.dss_load_date,
        src.dss_record_source,
        src.NameStyle,
        src.Title,
        src.FirstName,
        src.MiddleName,
        src.LastName,
        src.Suffix,
        src.CompanyName
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_customer = src.hk_customer
          AND es.hd_customer = src.hd_customer
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
