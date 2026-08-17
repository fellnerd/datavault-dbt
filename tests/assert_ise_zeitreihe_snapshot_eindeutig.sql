/*
 * Test: Die i-SE-Stammdaten-Snapshots sind fachlich eindeutig je Zeitreihe.
 *
 * ise_zeitreihe_dedup fasst die täglichen Snapshots per DISTINCT über die
 * Fachspalten zusammen. Solange alle Snapshots denselben Stand zeigen, bleibt
 * genau eine Version je ID_Zeitreihe übrig.
 *
 * Ändert i-SE ein Stammdatenattribut (z. B. GueltigBis wird gesetzt, eine Serie
 * wechselt den Typ oder die Referenz), entstehen ZWEI Versionen je ID_Zeitreihe.
 * Der ROW_NUMBER-Guard in ise_zeitreihe_dedup hält dann zwar die Hub-Eindeutigkeit
 * aufrecht, verdeckt die Änderung aber — dieser Test macht sie sichtbar.
 *
 * Schlägt der Test an, ist der fachliche Entscheid fällig: SCD2-Historisierung
 * des Snapshots oder Reduktion auf den aktuellen Stand.
 * Siehe TASKS.md "Dimensions-Snapshot-Strategie für i-SE-Zeitreihen-Stammdaten"
 * und docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md §12.11/§12.12.
 *
 * Stand 2026-08-17: 10 Snapshots, 410 Zeilen → 41 eindeutige Versionen.
 */

WITH versionen AS (
    SELECT
        TRY_CAST([ID_Zeitreihe] AS INT) AS id_zeitreihe,
        COUNT(*) AS n_versionen
    FROM (
        SELECT DISTINCT
            [ID_Zeitreihe], [ID_ZeitreiheTyp], [Zeitreihe], [Einheit],
            [ReferenzTyp], [ReferenzID], [Referenz], [Reihenfolge],
            [GueltigVon], [GueltigBis], [ZeitreiheGueltigVon], [ZeitreiheGueltigBis],
            [Zeitschritt], [Energieart], [Standort], [Bezuegeranlage],
            [ID_Zeitreihegruppe], [Zeitreihegruppe]
        FROM {{ source('staging', 'ext_ise_stammdaten') }}
        WHERE TRY_CAST([ID_Zeitreihe] AS INT) IS NOT NULL
    ) d
    GROUP BY TRY_CAST([ID_Zeitreihe] AS INT)
)

SELECT id_zeitreihe, n_versionen
FROM versionen
WHERE n_versionen > 1
