{#
    Current View: sat_vertrag_eff_current_v
    Effectivity Satellite: sat_vertrag_eff__compax
    Link: link_vertrag_kunde

    Zeigt aktive Vertrag-Kunde-Beziehungen.
    automate_dv.eff_sat() verwendet START_DATE / END_DATE (keine dss_is_current).
    Aktiv = kundigungs_datum ist leer (leerer String '' oder NULL) — kein Kündigungsdatum gesetzt.
    Compax liefert aktive Verträge mit kundigungs_datum = '' (leerer String), nicht NULL oder '9999-12-31'.
#}

{{ config(materialized='view') }}

SELECT *
FROM {{ ref('sat_vertrag_eff__compax') }}
WHERE kundigungs_datum IS NULL OR kundigungs_datum = ''
