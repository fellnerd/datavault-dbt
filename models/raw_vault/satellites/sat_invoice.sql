/*
 * Satellite: sat_invoice
 * Parent Hub: hub_invoice
 * Source: stg_invoice
 */

{{ config(
    materialized='incremental',
    unique_key='hk_invoice',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_invoice') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_invoice,
        hd_invoice,
        dss_load_date,
        dss_record_source,
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
        subscription
    FROM {{ ref('stg_invoice') }}
    WHERE hk_invoice IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_invoice,
        hd_invoice
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_invoice,
        src.hd_invoice,
        src.dss_load_date,
        src.dss_record_source,
        src.name,
        src.state,
        src.deductions_description,
        src.gross,
        src.invoicing_period_year,
        src.project,
        src.invoice_date,
        src.date_payed,
        src.description,
        src.advance_payment,
        src.date_payed_internally,
        src.payed,
        src.contractor,
        src.client,
        src.sum_goal,
        src.credit_period,
        src.deductions,
        src.sum_payed,
        src.hours_worked,
        src.subtractions,
        src.credit_rating_check,
        src.discount,
        src.ordering,
        src.createdby,
        src.member,
        src.pay_target_date,
        src.u_amount,
        src.comission_amount,
        src.subscription
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_invoice = src.hk_invoice
          AND es.hd_invoice = src.hd_invoice
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
