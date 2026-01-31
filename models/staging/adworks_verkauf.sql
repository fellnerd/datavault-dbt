/*
 * Staging Model: adworks_verkauf
 *
 * Source: ext_adventureworks_saleslt_salesorderheader
 * Business Key: SALESORDERID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - adworks.hub_kunde via customerid
 *   - adworks.hub_adresse via shiptoaddressid
 *   - adworks.hub_adresse via billtoaddressid
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_verkauf (Entity Hash Key)
 *   - hk_kunde (FK Hash Key for adworks.hub_kunde via customerid)
 *   - hk_link_verkauf_kunde (Link Hash Key)
 *   - hk_adresse_1 (FK Hash Key for adworks.hub_adresse via shiptoaddressid)
 *   - hk_link_verkauf_adresse_1 (Link Hash Key)
 *   - hk_adresse_2 (FK Hash Key for adworks.hub_adresse via billtoaddressid)
 *   - hk_link_verkauf_adresse_2 (Link Hash Key)
 */

{%- set hashdiff_columns = [
    'accountnumber',
    'comment',
    'creditcardapprovalcode',
    'duedate',
    'freight',
    'onlineorderflag',
    'orderdate',
    'purchaseordernumber',
    'revisionnumber',
    'salesordernumber',
    'shipdate',
    'shipmethod',
    'status',
    'subtotal',
    'taxamt',
    'totaldue'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_adventureworks_saleslt_salesorderheader') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(SALESORDERID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_verkauf,

        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(customerid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_kunde,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(shiptoaddressid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_adresse_1,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(billtoaddressid AS NVARCHAR(MAX)), '')
        ), 2) AS hk_adresse_2,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(SALESORDERID AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(customerid AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_verkauf_kunde,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(SALESORDERID AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(shiptoaddressid AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_verkauf_adresse_1,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(SALESORDERID AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(billtoaddressid AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_verkauf_adresse_2,

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
        ), 2) AS hd_verkauf,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        SALESORDERID,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        revisionnumber,
        orderdate,
        duedate,
        shipdate,
        status,
        onlineorderflag,
        salesordernumber,
        purchaseordernumber,
        accountnumber,
        customerid,
        shiptoaddressid,
        billtoaddressid,
        shipmethod,
        creditcardapprovalcode,
        subtotal,
        taxamt,
        freight,
        totaldue,
        comment,
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