/*
 * Staging Model: werkportal_contact
 *
 * Source: ext_werkportal_public_wp_contacts
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - werkportal.hub_contractor via company_contractor
 *
 * Dependent Child Keys (for DC Satellites):
 *   - werkportal.hub_contractor: name, email1
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_contact (Entity Hash Key)
 *   - hk_contractor (FK Hash Key for werkportal.hub_contractor)
 *   - hk_link_contact_contractor (Link Hash Key)
 */

{%- set hashdiff_columns = [
    'company_client',
    'company_supplier',
    'contact_function_name',
    'date_created',
    'date_updated',
    'email2',
    'fax',
    'mobile1',
    'mobile2',
    'phone',
    'state',
    'subscription',
    'title'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_werkportal_public_wp_contacts') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(company_contractor AS NVARCHAR(MAX)), '')
        ), 2) AS hk_contractor,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        -- Link with DCK: name, email1
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(company_contractor AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(name AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(email1 AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_contact_contractor,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_contact,

        -- ===========================================
        -- HASH DIFF (DC Satellites)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(company_client AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(company_supplier AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(contact_function_name AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(date_created AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(date_updated AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(email1 AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(email2 AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(fax AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(mobile1 AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(mobile2 AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(name AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(phone AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(state AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(subscription AS NVARCHAR(MAX)), ''),
                '||',
                ISNULL(CAST(title AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_contact_contractor_dc,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        date_created,
        date_updated,
        subscription,
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

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged