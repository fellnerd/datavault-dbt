/*
 * Staging Model: adworks_kunde_adresse
 *
 * Source: ext_adventureworks_saleslt_customeraddress
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_kunde_adresse (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'AddressID',
    'AddressType',
    'CustomerID'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_adventureworks_saleslt_customeraddress') }}
),

staged AS (
    SELECT
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
        ), 2) AS hd_kunde_adresse,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        CustomerID,
        AddressID,
        AddressType,
        ModifiedDate,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'adworks') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged