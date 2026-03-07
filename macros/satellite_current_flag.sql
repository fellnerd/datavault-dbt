/*
 * Satellite Current Flag Macro
 * 
 * Wiederverwendbarer Post-Hook für dss_is_current Flag Management.
 * Setzt alte Einträge auf 'N' wenn neue Einträge hinzugefügt werden.
 * Fügt die Spalten automatisch hinzu falls sie noch nicht existieren.
 *
 * Parameter:
 *   - satellite_table: Vollqualifizierter Tabellenname (z.B. {{ this }})
 *   - hash_key_column: Name der Hash Key Spalte (z.B. 'hk_company')
 */

{% macro update_satellite_current_flag(satellite_table, hash_key_column) %}
    {% set table_name = satellite_table %}
    {% set hash_col = hash_key_column %}

    -- Add columns if they don't exist (idempotent)
    IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('{{ table_name }}')
          AND name = 'dss_is_current'
    )
    BEGIN
        ALTER TABLE {{ table_name }} ADD dss_is_current CHAR(1) NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('{{ table_name }}')
          AND name = 'dss_end_date'
    )
    BEGIN
        ALTER TABLE {{ table_name }} ADD dss_end_date DATETIME2(7) NULL;
    END;

    -- Update flags using dynamic SQL (after columns exist)
    DECLARE @sql NVARCHAR(MAX);
    SET @sql = N'
        -- Set all records to current initially (for new records without flag)
        UPDATE {{ table_name }}
        SET dss_is_current = ''Y''
        WHERE dss_is_current IS NULL;

        -- Mark old records as not current
        UPDATE t1
        SET dss_is_current = ''N'',
            dss_end_date = (
                SELECT MIN(s2.dss_load_date)
                FROM {{ table_name }} s2
                WHERE s2.{{ hash_col }} = t1.{{ hash_col }}
                  AND s2.dss_load_date > t1.dss_load_date
            )
        FROM {{ table_name }} t1
        WHERE t1.dss_is_current = ''Y''
          AND t1.{{ hash_col }} IN (
              SELECT {{ hash_col }}
              FROM {{ table_name }}
              GROUP BY {{ hash_col }}
              HAVING COUNT(*) > 1
          )
          AND t1.dss_load_date < (
              SELECT MAX(t2.dss_load_date)
              FROM {{ table_name }} t2
              WHERE t2.{{ hash_col }} = t1.{{ hash_col }}
          )
    ';
    EXEC sp_executesql @sql;
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
