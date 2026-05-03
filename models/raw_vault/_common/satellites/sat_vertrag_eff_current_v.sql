{#
    Current View: sat_vertrag_eff_current_v
    Effectivity Satellite: sat_vertrag_eff__compax
    Link: link_vertrag_kunde

    Zeigt aktive Vertrag-Kunde-Beziehungen (END_DATE = 9999-12-31).
    automate_dv.eff_sat() verwendet START_DATE / END_DATE (keine dss_is_current).
    Aktiv = kundigungs_datum ist '9999-12-31' (kein Kündigungsdatum gesetzt).
#}

{{ config(materialized='view') }}

SELECT *
FROM {{ ref('sat_vertrag_eff__compax') }}
WHERE CAST(kundigungs_datum AS DATE) = '9999-12-31'
