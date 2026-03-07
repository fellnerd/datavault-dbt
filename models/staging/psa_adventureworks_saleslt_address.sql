/*
 * Persistent Staging Area: psa_adventureworks_saleslt_address
 * 
 * Source: ext_adventureworks_saleslt_address
 * Strategy: merge
 * Unique Key: AddressID
 * Incremental Column: dss_load_date
 * 
 * Purpose: Persists external table data to avoid repeated OPENROWSET calls.
 *          Staging views (hash calculation) should reference this PSA table.
 */

{{ config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='AddressID',
    as_columnstore=false
) }}

SELECT
    AddressID,
    AddressLine1,
    AddressLine2,
    City,
    StateProvince,
    CountryRegion,
    PostalCode,
    rowguid,
    ModifiedDate,
    dss_record_source,
    dss_load_date,
    dss_run_id,
    dss_stage_timestamp,
    dss_source_file_name

FROM {{ source('staging', 'ext_adventureworks_saleslt_address') }}

{% if is_incremental() %}
WHERE dss_load_date > (SELECT COALESCE(MAX(dss_load_date), '1900-01-01') FROM {{ this }})
{% endif %}
