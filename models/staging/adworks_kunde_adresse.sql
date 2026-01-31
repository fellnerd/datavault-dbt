/*
 * Staging Model: adworks_kunde_adresse
 *
 * Source: ext_adventureworks_saleslt_customeraddress
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - adworks.hub_kunde via customerid
 *   - adworks.hub_adresse via addressid
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_link_kunde_adresse (Combined Link Hash Key)
 *   - hk_kunde (FK Hash Key for adworks.hub_kunde)
 *   - hk_adresse (FK Hash Key for adworks.hub_adresse)
 *   - hd_kunde_adresse (Link Satellite Hash Diff)
 */

{%- set hashdiff_columns = [
    'addresstype'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_adventureworks_saleslt_customeraddress') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(customerid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_kunde,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(addressid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_adresse,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        -- Pure Link Entity: Combined hash from all FKs
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', ISNULL(CAST(addressid AS NVARCHAR(MAX)), '') + '^^' + ISNULL(CAST(customerid AS NVARCHAR(MAX)), '')), 2) AS hk_link_kunde_adresse,

        -- ===========================================
        -- HASH DIFF (Change Detection - Link Satellite)
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
        customerid,
        addressid,
        addresstype,
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