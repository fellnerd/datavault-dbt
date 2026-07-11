/*
 * Macro: cls_mask
 *
 * Column Level Security fuer Mart-Views: maskiert eine sensible Spalte,
 * wenn der aufrufende User keinen Eintrag fuer den Security-Kontext hat
 * (Pruefung via sec.fn_check_cls, siehe security/ddl/03_fn_check_cls.sql).
 *
 * Designregel: CLS-geschuetzte Spalten duerfen NUR in Views vorkommen,
 * nie in physischen Mart-Tabellen (Schema-GRANT wuerde sie sonst ungeschuetzt
 * lesbar machen).
 *
 * Verwendung in der SELECT-Liste eines Views:
 *   {{ cls_mask('nachname', 'person_pii') }}          AS nachname
 *   {{ cls_mask('geburtsdatum', 'person_pii', 'NULL') }} AS geburtsdatum
 *
 * mask_value: Ersatzwert bei fehlender Berechtigung (Default '***');
 * fuer Nicht-String-Spalten 'NULL' oder einen typkompatiblen Wert angeben.
 */

{% macro cls_mask(column_name, security_context, mask_value="'***'") %}
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM sec.fn_check_cls('{{ security_context }}')
        )
        THEN {{ column_name }}
        ELSE {{ mask_value }}
    END
{% endmacro %}
