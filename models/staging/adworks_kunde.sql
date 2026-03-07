/*
 * Staging Model: adworks_kunde
 *
 * Source: ext_adventureworks_saleslt_customer
 * Business Key: CUSTOMERID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_kunde (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'companyname',
    'emailaddress',
    'firstname',
    'lastname',
    'middlename',
    'namestyle',
    'passwordhash',
    'passwordsalt',
    'phone',
    'salesperson',
    'suffix',
    'title'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_adventureworks_saleslt_customer') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(CUSTOMERID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_kunde,

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
        ), 2) AS hd_kunde,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        CUSTOMERID,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        namestyle,
        title,
        firstname,
        middlename,
        lastname,
        suffix,
        companyname,
        salesperson,
        emailaddress,
        phone,
        passwordhash,
        passwordsalt,
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