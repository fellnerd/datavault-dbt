/*
 * Staging Model: adworks_adresse
 *
 * Source: ext_adventureworks_saleslt_address
 * Business Key: ADDRESSID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_adresse (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'addressline1',
    'addressline2',
    'city',
    'countryregion',
    'postalcode',
    'stateprovince'
] -%}

WITH source AS (
    SELECT * FROM {{ ref('psa_adventureworks_saleslt_address') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(ADDRESSID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_adresse,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_adresse,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        ADDRESSID,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        addressline1,
        addressline2,
        city,
        stateprovince,
        countryregion,
        postalcode,
        modifieddate,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'adworks') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged