/*
 * Ghost Records Macro
 * 
 * Erstellt Zero-Key Ghost Records für alle Hubs.
 * 
 * DV 2.1 Standard:
 * - 0x00...00 (64x '0') = Unknown/NULL Business Key
 * - 0xFF...FF (64x 'F') = Error/Invalid Business Key
 * 
 * Verwendung: dbt run-operation insert_ghost_records
 */

{% macro insert_ghost_records() %}
    
    {% set zero_key = '0000000000000000000000000000000000000000000000000000000000000000' %}
    {% set error_key = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' %}
    {% set ghost_date = '1900-01-01' %}
    {% set record_source = 'SYSTEM' %}
    
    -- Ghost Records für hub_company
    {% set hub_company_sql %}
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.hub_company WHERE hk_company = '{{ zero_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.hub_company (hk_company, object_id, source_table, dss_load_date, dss_record_source)
            VALUES ('{{ zero_key }}', -1, 'GHOST_UNKNOWN', '{{ ghost_date }}', '{{ record_source }}');
        END
        
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.hub_company WHERE hk_company = '{{ error_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.hub_company (hk_company, object_id, source_table, dss_load_date, dss_record_source)
            VALUES ('{{ error_key }}', -2, 'GHOST_ERROR', '{{ ghost_date }}', '{{ record_source }}');
        END
    {% endset %}
    
    -- Ghost Records für hub_country
    {% set hub_country_sql %}
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.hub_country WHERE hk_country = '{{ zero_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.hub_country (hk_country, object_id, dss_load_date, dss_record_source)
            VALUES ('{{ zero_key }}', -1, '{{ ghost_date }}', '{{ record_source }}');
        END
        
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.hub_country WHERE hk_country = '{{ error_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.hub_country (hk_country, object_id, dss_load_date, dss_record_source)
            VALUES ('{{ error_key }}', -2, '{{ ghost_date }}', '{{ record_source }}');
        END
    {% endset %}
    
    -- Ghost Records für Satellites (für EQUI-JOINs)
    {% set sat_company_sql %}
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.sat_company WHERE hk_company = '{{ zero_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.sat_company (hk_company, hd_company, dss_load_date, dss_record_source, dss_is_current, name)
            VALUES ('{{ zero_key }}', '{{ zero_key }}', '{{ ghost_date }}', '{{ record_source }}', 'Y', 'Unknown');
        END
        
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.sat_company WHERE hk_company = '{{ error_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.sat_company (hk_company, hd_company, dss_load_date, dss_record_source, dss_is_current, name)
            VALUES ('{{ error_key }}', '{{ error_key }}', '{{ ghost_date }}', '{{ record_source }}', 'Y', 'Error');
        END
    {% endset %}
    
    {% set sat_country_sql %}
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.sat_country WHERE hk_country = '{{ zero_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.sat_country (hk_country, hd_country, dss_load_date, dss_record_source, dss_is_current, name)
            VALUES ('{{ zero_key }}', '{{ zero_key }}', '{{ ghost_date }}', '{{ record_source }}', 'Y', 'Unknown');
        END
        
        IF NOT EXISTS (SELECT 1 FROM {{ target.database }}.vault.sat_country WHERE hk_country = '{{ error_key }}')
        BEGIN
            INSERT INTO {{ target.database }}.vault.sat_country (hk_country, hd_country, dss_load_date, dss_record_source, dss_is_current, name)
            VALUES ('{{ error_key }}', '{{ error_key }}', '{{ ghost_date }}', '{{ record_source }}', 'Y', 'Error');
        END
    {% endset %}
    
    {% do run_query(hub_company_sql) %}
    {{ log("Ghost Records für hub_company eingefügt", info=True) }}
    
    {% do run_query(hub_country_sql) %}
    {{ log("Ghost Records für hub_country eingefügt", info=True) }}
    
    {% do run_query(sat_company_sql) %}
    {{ log("Ghost Records für sat_company eingefügt", info=True) }}
    
    {% do run_query(sat_country_sql) %}
    {{ log("Ghost Records für sat_country eingefügt", info=True) }}
    
{% endmacro %}


/*
 * Zero Key Constants Macro
 * Kann in Models verwendet werden für NULL-Handling
 */
{% macro zero_key() %}
    '0000000000000000000000000000000000000000000000000000000000000000'
{% endmacro %}

{% macro error_key() %}
    'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
{% endmacro %}
