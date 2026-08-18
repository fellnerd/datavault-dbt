{#
    Transaction Satellite: sat_lastgang_tl__ise
    Parent Hub: hub_zeitreihe
    Dependent-Child Key: messzeitpunkt
    Source: ise_lastgang_main

    Fachlicher Schlüssel: (hk_zeitreihe, messzeitpunkt)
    Payload: wert — Energiemenge im ¼-Stunden-Intervall (kWh)

    ── Warum Transaction Satellite und kein Multi-Active Satellite ────────────
    Ein Lastgangwert ist ein FAKT, kein Zustand: "Serie X hatte am 14.08. 08:15
    den Wert 1234 kWh". Solche Sätze sind unveränderlich und voneinander
    unabhängig — es gibt keine Menge gleichzeitig gültiger Werte, die als Ganzes
    ausgetauscht wird.

    Der vorherige Ansatz (automate_dv.ma_sat) behandelte alle Werte einer Serie
    als eine solche Menge und verglich sie bei jedem Lauf komplett. Das war
    fachlich falsch und skaliert nicht: bei voller Historie (~3.2 Mio Werte)
    stünden je Serie ~78'000 Zeilen im Mengenvergleich.
    Hintergrund: docs/LESSONS_LEARNED.md.

    ── Warum kein Link ───────────────────────────────────────────────────────
    Ein Lastgangwert gehört zu genau EINER Entität (der Zeitreihe). Ein Link mit
    nur einem Hub-FK wäre entartet. Der Zeitstempel ist ein Dependent-Child-Key
    am Satelliten, kein zweiter Hub. (Anders als link_cdr_event_tl im
    Telecom-Vault: ein CDR verbindet tatsächlich Vertrag + SIM + Event.)

    ── Umgang mit revidierten Werten ─────────────────────────────────────────
    Der i-SE-Export korrigiert Werte nachträglich (Ersatz- → validierter Wert):
    gemessen 6'267 von 169'248 Zeitpunkten. Der Anti-Join vergleicht deshalb
    (hk_zeitreihe, messzeitpunkt, hd_lastgang_tl__ise) — bei geändertem Wert
    entsteht ein neuer Hashdiff und der korrigierte Wert wird als ZUSÄTZLICHE
    Version geladen. Alter und neuer Wert bleiben unterscheidbar über
    dss_load_date (= Export-Zeitstempel).
    Aktueller Wert je Zeitpunkt: sat_lastgang_tl__ise_current_v.

    ── Performance ───────────────────────────────────────────────────────────
    Append-only, kein Update, kein Mengenvergleich. Der Anti-Join ist bewusst
    ÜBER DEN ZEITRAUM DER QUELLE BEGRENZT (siehe Kommentar bei bounds):
    ohne diese Schranke joint jeder Lauf gegen die vollständige Satellitentabelle.
    Genau daran ist sat_cdr_event__compax gescheitert (9.4M Zeilen → Hash Match
    über die ganze Tabelle → 45+ Minuten); dort wurde es über einen HWM-Delta-View
    gelöst, hier über die Zeitfenster-Schranke — der Export liefert ein
    rollierendes 5-Tage-Fenster, das sich mit bereits Geladenem überlappt, ein
    reiner HWM-Filter würde also Revisionen verwerfen.

    Indizes (post_hook): zusammengesetzter Index auf (hk_zeitreihe, messzeitpunkt)
    mit hd_lastgang_tl__ise als INCLUDE — deckt den Anti-Join komplett ab (Index
    Seek statt Table Scan) und trägt gleichzeitig die typische Mart-Abfrage
    "Werte einer Serie in einem Zeitraum". Zusätzlich ein Index auf
    messzeitpunkt für serienübergreifende Zeitraumfilter.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-08-17 V1.0 Initialversion — EWB EDM/i-SE
               2026-08-17 V2.0 Umbau ma_sat → Transaction Satellite
#}

{{ config(
    materialized='incremental',
    incremental_strategy='append',
    on_schema_change='append_new_columns',
    as_columnstore=false,
    post_hook=[
        "{{ create_composite_index(['hk_zeitreihe', 'messzeitpunkt'], ['hd_lastgang_tl__ise']) }}",
        "{{ create_composite_index(['messzeitpunkt']) }}"
    ]
) }}

WITH source_data AS (

    SELECT
        hk_zeitreihe,
        messzeitpunkt,
        wert,
        hd_lastgang_tl__ise,
        dss_load_date,
        dss_record_source

    FROM {{ ref('ise_lastgang_main') }}
    WHERE hk_zeitreihe IS NOT NULL
      AND messzeitpunkt IS NOT NULL

)

{%- if is_incremental() %}

, bounds AS (

    -- Untere Zeitschranke des aktuellen Exports. Der Anti-Join unten muss nur
    -- gegen Satellitenzeilen AB diesem Zeitpunkt prüfen — ältere Messzeitpunkte
    -- kann der Export gar nicht liefern. Damit bleibt der Vergleich auf das
    -- rollierende Exportfenster begrenzt, statt über die ganze Tabelle zu laufen.
    --
    -- Bewusst direkt gegen die External Table statt gegen source_data: SQL Server
    -- wertet eine mehrfach referenzierte CTE mehrfach aus, und source_data zieht
    -- die volle Staging-Kette (Dedup-Fensterfunktion + Join + Hashing) nach sich.
    -- Gemessen: 4,96 s direkt vs. 12,78 s über die Kette, bei identischem Ergebnis.
    -- Die Rohtabelle liefert eine gleich grosse oder weitere Schranke, weil das
    -- Staging nur filtert und nie Zeitpunkte hinzufügt — die Schranke bleibt also
    -- in jedem Fall korrekt.
    SELECT MIN(TRY_CONVERT(DATETIME2(0), [Date], 104)) AS min_messzeitpunkt
    FROM {{ source('staging', 'ext_ise_lastgaenge') }}

)

, bestand AS (

    SELECT
        s.hk_zeitreihe,
        s.messzeitpunkt,
        s.hd_lastgang_tl__ise
    FROM {{ this }} AS s
    WHERE s.messzeitpunkt >= (SELECT min_messzeitpunkt FROM bounds)

)

SELECT
    src.hk_zeitreihe,
    src.messzeitpunkt,
    src.wert,
    src.hd_lastgang_tl__ise,
    src.dss_load_date,
    src.dss_record_source

FROM source_data AS src
WHERE NOT EXISTS (
    SELECT 1
    FROM bestand AS b
    WHERE b.hk_zeitreihe     = src.hk_zeitreihe
      AND b.messzeitpunkt    = src.messzeitpunkt
      AND b.hd_lastgang_tl__ise = src.hd_lastgang_tl__ise
)

{%- else %}

SELECT
    hk_zeitreihe,
    messzeitpunkt,
    wert,
    hd_lastgang_tl__ise,
    dss_load_date,
    dss_record_source
FROM source_data

{%- endif %}
