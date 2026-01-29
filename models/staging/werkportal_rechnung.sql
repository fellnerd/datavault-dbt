/*
 * Staging Model: werkportal_rechnung
 *
 * Source: ext_werkportal_public_wp_invoices
 * Business Key: object_id
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_rechnung (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'date_updated'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_werkportal_public_wp_invoices') }}
    where invoice_date >= '2025-11-01'
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_rechnung,

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
        ), 2) AS hd_rechnung,

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
        deductions_description,
        gross,
        invoicing_period_year,
        project,
        invoice_date,
        date_payed,
        description,
        advance_payment,
        date_payed_internally,
        payed,
        contractor,
        client,
        sum_goal,
        credit_period,
        deductions,
        sum_payed,
        hours_worked,
        subtractions,
        credit_rating_check,
        discount,
        ordering,
        createdby,
        member,
        pay_target_date,
        u_amount,
        comission_amount,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged