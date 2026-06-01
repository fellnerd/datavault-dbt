/*
 * Persistent Staging Area: psa_rsn_mobile_cdr_main
 *
 * Source: ext_rsn_mobile_cdr_main (PolyBase Folder-Scan über ewb/cdr/udrs/)
 * Strategy: delete+insert (idempotent per Dateiname — verhindert Duplikate bei Re-Runs)
 * Unique Key: id + dss_source_file_name
 *
 * Zweck: Cached CDR-Verbindungsdaten (Call, Data, SMS) aus ADLS in einer lokalen SQL-Tabelle.
 *        Vermeidet wiederholte teure PolyBase-Scans über alle UDR-Files beim Laden der Vault-Layer.
 *        Staging View rsn_mobile_cdr_main referenziert diese PSA statt ext_rsn_mobile_cdr_main direkt.
 *
 * Inkrementell: Neue Dateien werden per dss_source_file_name-Lookup erkannt und geladen.
 *               Bereits geladene Dateien werden übersprungen (idempotent).
 */

{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key=['id', 'dss_source_file_name'],
    as_columnstore=false,
    tags=['cdr']
) }}

SELECT
    id,
    contract_id,
    signaling_start,
    connection_start,
    duration,
    imsi,
    iccid,
    a,
    pai,
    b,
    privacy,
    display_name,
    diversion_reason,
    p_chrg_v,
    p_ch_o,
    result_code,
    result_status,
    call_type,
    record_type,
    service_type,
    bytes_in,
    bytes_out,
    data_packet,
    r_mcc_mnc,
    price,
    ws_price,
    tarif,
    tap3,
    dss_record_source,
    COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
    dss_run_id,
    dss_stage_timestamp,
    dss_source_file_name,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_rsn_mobile_cdr_main') }}
{% if is_incremental() %}
WHERE dss_source_file_name NOT IN (
    SELECT DISTINCT dss_source_file_name
    FROM {{ this }}
    WHERE dss_source_file_name IS NOT NULL
)
{% endif %}
