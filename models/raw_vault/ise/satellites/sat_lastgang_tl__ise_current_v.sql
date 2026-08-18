{#
    Current View: sat_lastgang_tl__ise_current_v
    Satellite: sat_lastgang_tl__ise
    Hub: hub_zeitreihe

    Liefert je (hk_zeitreihe, messzeitpunkt) den AKTUELLEN Wert — also den aus dem
    jüngsten i-SE-Export. Nötig, weil revidierte Messwerte als zusätzliche Version
    im Satelliten liegen (gemessen: 6'267 von 169'248 Zeitpunkten haben mehr als
    eine Version).

    Nicht satellite_current_view(): das Macro arbeitet mit dss_is_current/
    dss_end_date auf Hash-Key-Ebene (SCD2). Hier ist der Schlüssel
    (hk_zeitreihe, messzeitpunkt) — die Auswahl muss je Zeitpunkt erfolgen.

    ⚠ Performance: ROW_NUMBER über die gesamte Tabelle ist bei wachsender
    Historie teuer (Sort über ~3.2 Mio Zeilen bei Vollhistorie). Für Power BI /
    DirectQuery diese View NICHT direkt anbinden, sondern im Mart als Tabelle
    materialisieren. Für Ad-hoc-Abfragen mit Zeitraumfilter ist sie in Ordnung —
    der Index auf messzeitpunkt greift vor der Fensterfunktion.

    Alternative bei Performance-Druck: den Satelliten so laden, dass Revisionen
    ersetzt statt ergänzt werden (Delta-Load-Entscheid, siehe TASKS.md) — dann
    entfällt diese View ganz.
#}

{{ config(materialized='view') }}

WITH versioniert AS (

    SELECT
        hk_zeitreihe,
        messzeitpunkt,
        wert,
        hd_lastgang_tl__ise,
        dss_load_date,
        dss_record_source,
        ROW_NUMBER() OVER (
            PARTITION BY hk_zeitreihe, messzeitpunkt
            ORDER BY dss_load_date DESC
        ) AS dss_version_rank

    FROM {{ ref('sat_lastgang_tl__ise') }}

)

SELECT
    hk_zeitreihe,
    messzeitpunkt,
    wert,
    hd_lastgang_tl__ise,
    dss_load_date,
    dss_record_source
FROM versioniert
WHERE dss_version_rank = 1
