/*
 * Staging Model: adworks_produkt_preis
 *
 * Source: ext_adventureworks_saleslt_product
 * Business Key: PRODUCTID
 * Split-Satellite Target: adworks.hub_produkt
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_produkt (Split-Satellite Hash Key - points to adworks.hub_produkt)
 */

{%- set hashdiff_columns = [
    'listprice',
    'standardcost'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_adventureworks_saleslt_product') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(PRODUCTID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_produkt,

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
        ), 2) AS hd_produkt_preis,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        PRODUCTID,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        standardcost,
        listprice,
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