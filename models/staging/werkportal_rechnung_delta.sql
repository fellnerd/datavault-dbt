/*
 * Staging Model: werkportal_rechnung_delta
 *
 * Source: ext_werkportal_api_invoice_delta
 * Business Key: object_id
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_rechnung_delta (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'date_updated'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_werkportal_api_invoice_delta') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_rechnung_delta,

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
        ), 2) AS hd_rechnung_delta,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        object_id,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        advance_payment,
        client_name,
        client_object_id,
        comission_amount,
        contractor_name,
        contractor_object_id,
        createdby_name,
        createdby_object_id,
        credit_period,
        credit_rating_check,
        date_created,
        date_updated,
        deductions,
        deductions_description,
        description,
        discount,
        gross,
        hours_worked,
        invoice_date,
        invoicing_period_year,
        member_email,
        member_name,
        member_object_id,
        name,
        ordering,
        pay_target_date,
        payed,
        project_name,
        project_object_id,
        state,
        subscription_name,
        subscription_object_id,
        subtractions,
        sum_goal,
        sum_payed,
        u_amount,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date

    FROM source
)

SELECT * FROM staged