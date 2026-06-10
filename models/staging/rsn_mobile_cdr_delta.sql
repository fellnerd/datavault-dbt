/*
 * Delta-Filter View: rsn_mobile_cdr_delta
 *
 * Zweck: Hochwassermarke (High-Water Mark) Filter auf psa_rsn_mobile_cdr_main.
 *        Liefert nur PSA-Rows die NEUER sind als der letzte Stand in sat_cdr_event__compax.
 *
 *        → Wenn keine neuen CDR-Files → 0 Rows → Vault-Modelle in Sekunden fertig
 *        → Neue CDR-Files → nur neue Rows → normaler Durchsatz
 *
 * Full-Refresh-Sicherheit:
 *   OBJECT_ID()-Check verhindert Fehler wenn vault_telecom.sat_cdr_event__compax
 *   während --full-refresh temporär nicht existiert → fällt auf '1900-01-01' zurück
 *   → alle Rows laufen durch (korrekt).
 *
 * Source: psa_rsn_mobile_cdr_main (PSA-Tabelle mit allen historischen CDR-Events)
 * Tags: [cdr, nightly] — Teil der CDR-Pipeline, nicht für reguläre Tests
 */

{{ config(
    materialized='view',
    tags=['cdr', 'nightly']
) }}

SELECT *
FROM {{ ref('psa_rsn_mobile_cdr_main') }}
WHERE dss_load_date > (
    SELECT ISNULL(
        CASE
            WHEN OBJECT_ID('vault_telecom.sat_cdr_event__compax') IS NOT NULL
            THEN (SELECT MAX(dss_load_date) FROM vault_telecom.sat_cdr_event__compax)
            ELSE NULL
        END,
        CAST('1900-01-01' AS DATETIME2)
    )
)
