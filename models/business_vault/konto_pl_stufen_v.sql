/*
 * Business Vault: konto_pl_stufen_v
 *
 * Pattern: Business Vault Reference (abgeleitete Business-Regel, kein Quellsystem)
 * Source: seed_konto_pl_stufen (dbt Seed, manuell gepflegt)
 * Primary Key: stufe (Natural Key)
 * Schema: vault (via dbt_project.yml business_vault-Config)
 *
 * Die 6 Zwischensummen-Zeilen der Erfolgsrechnung (Bruttoergebnis -> EBITDA
 * -> EBIT -> Betriebsergebnis -> Ergebnis), inkl. Label, Sortierposition und
 * negativem Plug-Konto-Key fuer dim_konto_v.
 *
 * Siehe konto_pl_zuordnung_v fuer die Zuordnung "welche Kontogruppe fliesst
 * ab welcher Stufe ein".
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-07-21 V1.0 Initialversion
 */

{{ config(
    materialized='view'
) }}

SELECT
    stufe,
    subtotal_label,
    konto_sort,
    konto_key_plug,
    'manual_business_rule'          AS dss_record_source,
    CAST(GETDATE() AS DATETIME2(7)) AS dss_load_date
FROM {{ ref('seed_konto_pl_stufen') }}
