/*
 * Test: Jede Category in ext_ise_lastgaenge lässt sich auf eine Zeitreihe auflösen.
 *
 * ise_lastgang_dedup verbindet die Lastgangwerte per INNER JOIN über
 * zeitreihe_key = Category mit den Stammdaten. Werte ohne Stammsatz würden dabei
 * still verworfen. Der Test schlägt an, sobald der i-SE-Export eine Serie liefert,
 * die (noch) nicht in den Stammdaten der Zeitreihegruppe 150 enthalten ist —
 * typischerweise wenn Lastgang- und Stammdaten-Export zeitlich auseinanderlaufen.
 *
 * Stand der Exploration 2026-08-15: 41 von 41 Categories auflösbar.
 */

{{ config(tags=['ise']) }}

SELECT DISTINCT
    l.[Category] AS nicht_aufloesbare_kategorie

FROM {{ source('staging', 'ext_ise_lastgaenge') }} l

WHERE l.[Category] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM {{ ref('ise_zeitreihe_dedup') }} z
      WHERE z.zeitreihe_key = l.[Category]
  )
