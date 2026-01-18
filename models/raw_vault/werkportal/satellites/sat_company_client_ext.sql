/*
 * Satellite: sat_company_client_ext
 * Schema: vault
 * 
 * Erweiterte Attribute nur für Clients (freistellungsbescheinigung).
 * Hängt am hub_company, aber nur für Einträge mit role_code = 'CLIENT'.
 * dss_is_current: 'Y' für aktuellen Eintrag, 'N' für historische
 * dss_end_date: Enddatum der Gültigkeit (NULL = aktuell)
 */

{{ config(
    materialized='incremental',
    unique_key='hk_company',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_company') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_company,
        -- Hash Diff nur für client-spezifische Attribute
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(freistellungsbescheinigung AS NVARCHAR(MAX)), '')
        ), 2) AS hd_company_client_ext,
        dss_load_date,
        dss_record_source,
        -- Payload (nur client-spezifisch)
        freistellungsbescheinigung
    FROM {{ ref('stg_company') }}
    WHERE hk_company IS NOT NULL
      AND role_code = 'CLIENT'
      AND freistellungsbescheinigung IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_company,
        hd_company_client_ext
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_company,
        src.hd_company_client_ext,
        src.dss_load_date,
        src.dss_record_source,
        src.freistellungsbescheinigung
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_company = src.hk_company
          AND es.hd_company_client_ext = src.hd_company_client_ext
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
