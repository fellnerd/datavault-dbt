/*
 * Staging Model: werkportal_contractor
 *
 * Source: ext_werkportal_public_wp_company_contractor
 * Business Key: object_id
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_contractor (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'bic',
    'city',
    'citycode',
    'commission_fee',
    'country',
    'credit_rating',
    'description',
    'email',
    'employeecount',
    'fax',
    'iban',
    'mobile',
    'mobile2',
    'name',
    'org_type',
    'phone',
    'province',
    'state',
    'street',
    'uid',
    'website'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_werkportal_public_wp_company_contractor') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_contractor,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_contractor,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        object_id,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        date_created,
        date_updated,
        subscription,
        name,
        state,
        citycode,
        city,
        website,
        street,
        province,
        credit_rating,
        country,
        employeecount,
        email,
        commission_fee,
        phone,
        mobile,
        mobile2,
        bic,
        fax,
        iban,
        description,
        org_type,
        uid,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged