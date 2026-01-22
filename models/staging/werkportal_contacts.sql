/*
 * Staging Model: werkportal_contacts
 *
 * Source: ext_werkportal_public_wp_contacts
 * Business Key: object_id, subscription
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 */

{%- set hashdiff_columns = [
    'company_client',
    'company_contractor',
    'company_supplier',
    'contact_function_id',
    'contact_function_name',
    'date_created',
    'date_updated',
    'email1',
    'email2',
    'fax',
    'mobile1',
    'mobile2',
    'name',
    'phone',
    'state',
    'title'
] -%}

WITH source AS (
    SELECT TOP 10 * FROM {{ source('staging', 'ext_werkportal_public_wp_contacts') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(object_id AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(subscription AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_contacts,

        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        -- FK to company_client (same hash logic as hub_company_client)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(company_client AS NVARCHAR(MAX)), '')
        ), 2) AS hk_company_client,

        -- Link Hash Key (contacts + company_client)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(object_id AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(subscription AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(company_client AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_contacts_company_client,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_contacts,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        object_id,
        subscription,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        date_created,
        date_updated,
        name,
        state,
        title,
        email1,
        email2,
        mobile1,
        mobile2,
        phone,
        fax,
        contact_function_name,
        company_supplier,
        company_client,
        company_contractor,
        contact_function_id,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged