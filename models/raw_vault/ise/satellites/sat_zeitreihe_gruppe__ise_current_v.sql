{#
    Current View: sat_zeitreihe_gruppe__ise_current_v
    Satellite: sat_zeitreihe_gruppe__ise
    Link: link_zeitreihe_gruppe

    Kanonischer Zugriffslayer auf sat_zeitreihe_gruppe__ise.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: ohne Filter (volle Historie der Gruppenzuordnung)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_zeitreihe_gruppe__ise',
    hashkey_column='hk_link_zeitreihe_gruppe'
) }}
