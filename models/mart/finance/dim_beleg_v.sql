/*
 * Dimension: dim_beleg (Bridge)
 * Schema: mart_finance
 *
 * Bridge-Dimension zwischen fakt_buchungen (Hauptbuch-Buchungen) und fakt_belege
 * (Kreditorenbelege). Beide Fakttabellen referenzieren dieselbe Belegnummer, aber
 * jeweils mit eigener Granularitaet (fakt_buchungen: mehrere Buchungszeilen/Perioden
 * je Beleg bei Abgrenzungen; fakt_belege: mehrere Zahlungspositionen je Beleg) —
 * eine direkte Fakt-zu-Fakt-Beziehung waere Many-to-Many. Diese Bridge loest das auf.
 *
 * Grain: 1 Zeile pro belegnummer (Vereinigung aus beiden Fakttabellen, falls eine
 * Belegnummer nur auf einer Seite vorkommt).
 *
 * Hinweis: belegdatum (Rechnungsdatum aus fakt_belege) und buchungsdatum (Buchungsdatum
 * aus fakt_buchungen) koennen bei Abgrenzungen/Rueckbuchungen auseinanderfallen — beim
 * Abgleich Beleg vs. Buchung nicht zusaetzlich nach Periode filtern, sonst werden
 * zusammengehoerige Zeilen faelschlich getrennt.
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['dimension']
) }}

WITH alle_belegnummern AS (
    SELECT DISTINCT belegnummer FROM {{ ref('fakt_buchungen') }} WHERE belegnummer IS NOT NULL
    UNION
    SELECT DISTINCT belegnummer FROM {{ ref('fakt_belege_v') }} WHERE belegnummer IS NOT NULL
)
SELECT
    {{ surrogate_key('belegnummer') }} AS beleg_key,
    belegnummer
FROM alle_belegnummern
