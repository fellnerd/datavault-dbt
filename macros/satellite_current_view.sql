{#
    Macro: satellite_current_view
    
    Creates a current view for a satellite, providing the canonical
    access layer for downstream consumers (mart, business vault).
    
    The satellite table already has dss_is_current and dss_end_date
    maintained by the update_satellite_current_flag post-hook.
    This view exposes them as the standard interface.
    
    Usage:
      {{ satellite_current_view(
          satellite_model='sat_person',
          hashkey_column='hk_person'
      ) }}
#}

{% macro satellite_current_view(satellite_model, hashkey_column) %}

SELECT *
FROM {{ ref(satellite_model) }}
WHERE dss_is_current = 'Y'

{% endmacro %}
