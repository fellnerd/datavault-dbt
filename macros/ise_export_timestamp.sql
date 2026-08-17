/*
 * Macro: ise_export_timestamp
 *
 * Leitet den Export-Zeitstempel aus dem i-SE-Dateinamen ab.
 * Muster: 'ewb_PowerBI_LG_<yyyyMMddHHmmss>.csv'
 *
 * Warum nicht dss_stage_timestamp?
 *   dss_stage_timestamp ist der ADF-LADEzeitpunkt — alle Dateien eines Copy-Laufs
 *   tragen denselben Wert (verifiziert: je genau 1 distinct Wert über alle 9 bzw.
 *   10 Dateien, identische dss_run_id). Er kann Exportstände deshalb nicht ordnen.
 *   Der Dateiname trägt dagegen den Zeitpunkt, zu dem i-SE den Stand geliefert hat,
 *   und ist je Datei eindeutig.
 *
 * Rückgabe: DATETIME2(0), NULL wenn der Dateiname vom Muster abweicht.
 */

{%- macro ise_export_timestamp(filename_column) -%}
    TRY_CONVERT(
        DATETIME2(0),
        SUBSTRING(SUBSTRING({{ filename_column }},
                            LEN({{ filename_column }})
                              - CHARINDEX('_', REVERSE({{ filename_column }})) + 2, 14), 1, 4) + '-' +
        SUBSTRING(SUBSTRING({{ filename_column }},
                            LEN({{ filename_column }})
                              - CHARINDEX('_', REVERSE({{ filename_column }})) + 2, 14), 5, 2) + '-' +
        SUBSTRING(SUBSTRING({{ filename_column }},
                            LEN({{ filename_column }})
                              - CHARINDEX('_', REVERSE({{ filename_column }})) + 2, 14), 7, 2) + ' ' +
        SUBSTRING(SUBSTRING({{ filename_column }},
                            LEN({{ filename_column }})
                              - CHARINDEX('_', REVERSE({{ filename_column }})) + 2, 14), 9, 2) + ':' +
        SUBSTRING(SUBSTRING({{ filename_column }},
                            LEN({{ filename_column }})
                              - CHARINDEX('_', REVERSE({{ filename_column }})) + 2, 14), 11, 2) + ':' +
        SUBSTRING(SUBSTRING({{ filename_column }},
                            LEN({{ filename_column }})
                              - CHARINDEX('_', REVERSE({{ filename_column }})) + 2, 14), 13, 2),
        120
    )
{%- endmacro -%}
