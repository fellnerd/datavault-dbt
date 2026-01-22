/*
 * Staging Model: werkportal_company_client
 *
 * Source: ext_werkportal_public_wp_company_client
 * Business Key: object_id
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 */

{%- set hashdiff_columns = [
    'bic',
    'city',
    'citycode',
    'commission_fee',
    'country',
    'credit_rating',
    'date_created',
    'date_updated',
    'description',
    'email',
    'employeecount',
    'fax',
    'freistellungsbescheinigung',
    'iban',
    'mobile',
    'mobile2',
    'name',
    'org_type',
    'phone',
    'province',
    'state',
    'street',
    'subscription',
    'uid',
    'website'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_werkportal_public_wp_company_client') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        -- Note: FK hash keys are calculated in Link models, not in staging
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_company_client,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_company_client,

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
        freistellungsbescheinigung,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged