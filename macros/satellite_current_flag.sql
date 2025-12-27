/*
 * Satellite Current Flag Macro
 * 
 * Wiederverwendbarer Post-Hook für dss_is_current Flag Management.
 * Setzt alte Einträge auf 'N' wenn neue Einträge hinzugefügt werden.
 *
 * Parameter:
 *   - satellite_table: Vollqualifizierter Tabellenname (z.B. {{ this }})
 *   - hash_key_column: Name der Hash Key Spalte (z.B. 'hk_company')
 */

{% macro update_satellite_current_flag(satellite_table, hash_key_column) %}
    UPDATE {{ satellite_table }} 
    SET dss_is_current = 'N',
        dss_end_date = (
            SELECT MIN(s2.dss_load_date) 
            FROM {{ satellite_table }} s2 
            WHERE s2.{{ hash_key_column }} = {{ satellite_table }}.{{ hash_key_column }}
              AND s2.dss_load_date > {{ satellite_table }}.dss_load_date
        )
    WHERE dss_is_current = 'Y' 
      AND {{ hash_key_column }} IN (
          SELECT {{ hash_key_column }} 
          FROM {{ satellite_table }} 
          GROUP BY {{ hash_key_column }} 
          HAVING COUNT(*) > 1
      )
      AND dss_load_date < (
          SELECT MAX(dss_load_date) 
          FROM {{ satellite_table }} t2 
          WHERE t2.{{ hash_key_column }} = {{ satellite_table }}.{{ hash_key_column }}
      )
{% endmacro %}


/*
 * Effectivity Satellite End-Date Update Macro
 * 
 * Setzt dss_end_date und dss_is_active für beendete Beziehungen.
 * Verwendet für Effectivity Satellites auf Links.
 */
{% macro update_effectivity_end_dates() %}
    -- Beende alte Beziehungen wenn sich Country ändert
    UPDATE {{ this }}
    SET dss_is_active = 'N',
        dss_end_date = (
            SELECT MIN(e2.dss_start_date)
            FROM {{ this }} e2
            WHERE e2.hk_company = {{ this }}.hk_company
              AND e2.dss_start_date > {{ this }}.dss_start_date
        )
    WHERE dss_is_active = 'Y'
      AND hk_company IN (
          SELECT hk_company 
          FROM {{ this }} 
          GROUP BY hk_company 
          HAVING COUNT(*) > 1
      )
      AND dss_start_date < (
          SELECT MAX(dss_start_date) 
          FROM {{ this }} t2 
          WHERE t2.hk_company = {{ this }}.hk_company
      )
{% endmacro %}


/*
 * Satellite Post-Hook für sat_company
 */
{% macro sat_company_current_flag_hook() %}
    {{ update_satellite_current_flag(this, 'hk_company') }}
{% endmacro %}


/*
 * Satellite Post-Hook für sat_country
 */
{% macro sat_country_current_flag_hook() %}
    {{ update_satellite_current_flag(this, 'hk_country') }}
{% endmacro %}


/*
 * Satellite Post-Hook für sat_company_client_ext
 */
{% macro sat_company_client_ext_current_flag_hook() %}
    {{ update_satellite_current_flag(this, 'hk_company') }}
{% endmacro %}
