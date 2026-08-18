{#
    Current View: sat_zeitreihe__ise_current_v
    Satellite: sat_zeitreihe__ise
    Hub: hub_zeitreihe

    Kanonischer Zugriffslayer auf sat_zeitreihe__ise.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: ohne Filter (volle Historie mit Start-/End-Zeitstempel)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_zeitreihe__ise',
    hashkey_column='hk_zeitreihe'
) }}
