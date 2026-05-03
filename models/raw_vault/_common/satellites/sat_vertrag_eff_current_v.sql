{#
    Current View: sat_vertrag_eff_current_v
    Satellite: sat_vertrag_eff__compax
    Hub: hub_vertrag

    Canonical access layer für sat_vertrag_eff__compax.
    Stellt dss_is_current und dss_end_date für Downstream-Konsumenten bereit.
    SCD1: WHERE dss_is_current = 'Y' → aktueller Aktivitätsstatus des Vertrags
    SCD2: Kein Filter (vollständige Historie der Statuswechsel)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_vertrag_eff__compax',
    hashkey_column='hk_vertrag'
) }}
