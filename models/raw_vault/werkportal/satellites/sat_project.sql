/*
 * Satellite: sat_project
 * Parent Hub: hub_project
 * Source: stg_project
 */

{{ config(
    materialized='incremental',
    unique_key='hk_project',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_project') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_project,
        hd_project,
        dss_load_date,
        dss_record_source,
        name,
        state,
        [begin],
        location,
        price,
        commission,
        [end],
        work_begin,
        author_email,
        description,
        price_units_value,
        commission_units_value,
        details,
        client,
        contractor,
        member,
        subscription,
        [user],
        provision_charged_state,
        contractor_count,
        hidden,
        is_contracting
    FROM {{ ref('stg_project') }}
    WHERE hk_project IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_project,
        hd_project
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_project,
        src.hd_project,
        src.dss_load_date,
        src.dss_record_source,
        src.name,
        src.state,
        src.[begin],
        src.location,
        src.price,
        src.commission,
        src.[end],
        src.work_begin,
        src.author_email,
        src.description,
        src.price_units_value,
        src.commission_units_value,
        src.details,
        src.client,
        src.contractor,
        src.member,
        src.subscription,
        src.[user],
        src.provision_charged_state,
        src.contractor_count,
        src.hidden,
        src.is_contracting
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_project = src.hk_project
          AND es.hd_project = src.hd_project
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
