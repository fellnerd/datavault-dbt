/*
 * Staging Model: adworks_verkauf_detail
 *
 * Source: ext_adventureworks_saleslt_salesorderdetail
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - adworks.hub_verkauf via salesorderid
 *   - adworks.hub_produkt via productid
 *
 * Dependent Child Keys (for DC Satellites):
 *   - adworks.hub_verkauf: salesorderdetailid
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_verkauf_detail (Entity Hash Key)
 *   - hk_verkauf (FK Hash Key for adworks.hub_verkauf)
 *   - hk_link_verkauf_detail_verkauf (Link Hash Key)
 *   - hk_produkt (FK Hash Key for adworks.hub_produkt)
 *   - hk_link_verkauf_detail_produkt (Link Hash Key)
 */

{%- set hashdiff_columns = [
    'linetotal',
    'orderqty',
    'unitprice',
    'unitpricediscount'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_adventureworks_saleslt_salesorderdetail') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(salesorderid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_verkauf,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(productid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_produkt,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        -- DC Link: Combined hash from all FKs + DCK columns
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', ISNULL(CAST(productid AS NVARCHAR(MAX)), '') + '^^' + ISNULL(CAST(salesorderdetailid AS NVARCHAR(MAX)), '') + '^^' + ISNULL(CAST(salesorderid AS NVARCHAR(MAX)), '')), 2) AS hk_link_verkauf_detail,


        -- ===========================================
        -- HASH DIFF (DC Satellites)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(linetotal AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(orderqty AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(salesorderdetailid AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(unitprice AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(unitpricediscount AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_verkauf_detail_dc,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        salesorderid,
        salesorderdetailid,
        orderqty,
        productid,
        unitprice,
        unitpricediscount,
        linetotal,
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