/*
 * Staging Model: stg_invoice
 * 
 * Bereitet invoice-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: object_id
 */

{%- set hashdiff_columns = [
    'name',
    'state',
    'deductions_description',
    'gross',
    'invoicing_period_year',
    'project',
    'invoice_date',
    'date_payed',
    'description',
    'advance_payment',
    'date_payed_internally',
    'payed',
    'contractor',
    'client',
    'sum_goal',
    'credit_period',
    'deductions',
    'sum_payed',
    'hours_worked',
    'subtractions',
    'credit_rating_check',
    'discount',
    'ordering',
    'createdby',
    'member',
    'pay_target_date',
    'u_amount',
    'comission_amount',
    'subscription'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_invoice') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_invoice,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT_WS('^^',
                {% for col in hashdiff_columns -%}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last }}
                {% endfor -%}
            )
        ), 2) AS hd_invoice,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        object_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
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
        subscription,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'ext_invoice') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
