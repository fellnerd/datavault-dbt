/*
 * Wrapper-View: dim_konto_v
 * Schema: mart_finance
 *
 * Duenner Wrapper um die materialisierte Tabelle dim_konto (Performance-Cache).
 * Publiziertes Objekt — von Power BI konsumiert. Analog zum fakt_buchungen /
 * fakt_buchungen_v Muster in diesem Projekt.
 *
 * Volle Logik (Sharepoint-Join, Plug-Zeilen, Business-Vault-Anreicherung) liegt
 * in dim_konto.sql — siehe dort fuer Details.
 *
 * Version: 2026-07-24 V2.0 Auf Wrapper reduziert (Performance-Fix, vorher Full-View)
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT * FROM {{ ref('dim_konto') }}
