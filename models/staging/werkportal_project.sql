/*
 * Staging Model: stg_project
 * 
 * Bereitet project-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: object_id
 */

{%- set hashdiff_columns = [
    'name',
    'state',
    '[begin]',
    'location',
    'price',
    'commission',
    '[end]',
    'work_begin',
    'author_email',
    'description',
    'price_units_value',
    'commission_units_value',
    'details',
    'client',
    'contractor',
    'member',
    'subscription',
    '[user]',
    'provision_charged_state',
    'contractor_count',
    'hidden',
    'is_contracting'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_project') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_project,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT_WS('^^',
                {% for col in hashdiff_columns -%}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last }}
                {% endfor -%}
            )
        ), 2) AS hd_project,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        object_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        name,
        state,
        [begin],
        location,
        price,
        commission,
        [end],
        work_begin,
        author_email,
        description,
        price_units_value,
        commission_units_value,
        details,
        client,
        contractor,
        member,
        subscription,
        [user],
        provision_charged_state,
        contractor_count,
        hidden,
        is_contracting,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'ext_project') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
