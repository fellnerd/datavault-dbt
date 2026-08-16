/*
 * Pre-Staging Deduplication: ise_zeitreihe_dedup
 *
 * Source: ext_ise_stammdaten (Wildcard External Table auf ewb/ise/stammdaten/)
 * Downstream: ise_zeitreihe_main (automate_dv.stage), ise_lastgang_dedup (Key-Auflösung)
 *
 * Inhalt: Stammdaten der i-SE-Zeitreihegruppe 150 "ewb_Power BI" (41 Zeitreihen).
 *
 * Problem 1 — Duplikate:
 *   Die External Table liest ALLE Export-Dateien. Der werktägliche i-SE-Export legt
 *   jeweils einen vollständigen Snapshot ab → aktuell 10 identische Snapshots,
 *   410 Zeilen für 41 Zeitreihen. Reduktion auf eine Zeile je ID_Zeitreihe.
 *
 * Problem 2 — Typisierung:
 *   Der CSV→Parquet-Weg liefert alles als Text. ID_Zeitreihe steht als NVARCHAR(4000)
 *   in sources.yml und muss auf INT gecastet werden, damit der Hash Key mit
 *   ise_lastgang_main übereinstimmt. Datumsfelder kommen als 'dd.MM.yyyy HH:mm:ss'
 *   (Style 104), Reihenfolge als Float-Artefakt 'NaN'.
 *
 * Problem 3 — Namensgebung der Quelle:
 *   Die Exportspalte "Zeitreihe" enthält NICHT den Serien-, sondern den Typnamen
 *   (entspricht Techanl.ZEITREIHETYP.Bezeichnung). Sie wird deshalb als
 *   zeitreihe_typ übernommen. Die Serienidentität entsteht erst aus
 *   Typ + Referenz + Einheit → zeitreihe_key (Join-Schlüssel zu den Lastgängen).
 *
 * ⚠ Einschränkung "letzter Snapshot gewinnt":
 *   Die External Table hat keine Herkunftsspalte (Dateiname/Export-Zeitstempel);
 *   filename()/filepath() werden von Azure SQL DB auf External Tables nicht
 *   unterstützt (geprüft). Solange die Snapshots identisch sind, ist die Auswahl
 *   eindeutig. Sobald sich ein Attribut ändert, greift der deterministische
 *   Tie-Break unten — der neueste Stand ist dann NICHT bestimmbar.
 *   Dauerhafte Lösung: $$FILEPATH als additionalColumns in der ADF-Pipeline
 *   CopyPipeline_Lastgaenge mitschreiben.
 *   Siehe docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md §12.7 (Q-4).
 */

{{ config(materialized='view', tags=['ise']) }}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ise_stammdaten') }}
),

typed AS (
    SELECT
        TRY_CAST([ID_Zeitreihe] AS INT)                                   AS id_zeitreihe,
        [ID_ZeitreiheTyp]                                                 AS id_zeitreihe_typ,
        [Zeitreihe]                                                       AS zeitreihe_typ,
        -- Join-Schlüssel: entspricht exakt ext_ise_lastgaenge.Category
        [Zeitreihe] + '.' + [Referenz] + '.' + [Einheit]                  AS zeitreihe_key,
        [Einheit]                                                         AS einheit,
        TRY_CAST([Zeitschritt] AS INT)                                    AS zeitschritt_min,
        TRY_CAST([Energieart] AS INT)                                     AS energieart,
        [ReferenzTyp]                                                     AS referenz_typ,
        [ReferenzID]                                                      AS referenz_id,
        [Referenz]                                                        AS referenz,
        NULLIF([Standort], '')                                            AS standort,
        NULLIF([Bezuegeranlage], '')                                      AS bezuegeranlage,
        [ID_Zeitreihegruppe]                                              AS id_zeitreihegruppe,
        [Zeitreihegruppe]                                                 AS zeitreihegruppe,
        TRY_CAST(NULLIF([Reihenfolge], 'NaN') AS INT)                     AS reihenfolge,
        TRY_CONVERT(DATETIME2(0), NULLIF([GueltigVon], ''), 104)          AS gruppe_gueltig_von,
        TRY_CONVERT(DATETIME2(0), NULLIF([GueltigBis], ''), 104)          AS gruppe_gueltig_bis,
        TRY_CONVERT(DATETIME2(0), NULLIF([ZeitreiheGueltigVon], ''), 104) AS zeitreihe_gueltig_von,
        TRY_CONVERT(DATETIME2(0), NULLIF([ZeitreiheGueltigBis], ''), 104) AS zeitreihe_gueltig_bis,

        -- Metadaten: der Export liefert weder Record Source noch Load Date mit
        CAST('ewb_ise' AS NVARCHAR(100))                                  AS dss_record_source,
        CAST(GETDATE() AS DATETIME2)                                      AS dss_load_date

    FROM source
    WHERE TRY_CAST([ID_Zeitreihe] AS INT) IS NOT NULL
),

distinct_snapshots AS (
    SELECT DISTINCT * FROM typed
),

ranked AS (
    SELECT
        d.*,
        ROW_NUMBER() OVER (
            PARTITION BY d.id_zeitreihe
            ORDER BY d.zeitreihe_gueltig_von DESC,
                     d.gruppe_gueltig_von DESC,
                     d.id_zeitreihe_typ
        ) AS rn
    FROM distinct_snapshots d
)

SELECT
    id_zeitreihe,
    id_zeitreihe_typ,
    zeitreihe_typ,
    zeitreihe_key,
    einheit,
    zeitschritt_min,
    energieart,
    referenz_typ,
    referenz_id,
    referenz,
    standort,
    bezuegeranlage,
    id_zeitreihegruppe,
    zeitreihegruppe,
    reihenfolge,
    gruppe_gueltig_von,
    gruppe_gueltig_bis,
    zeitreihe_gueltig_von,
    zeitreihe_gueltig_bis,
    dss_record_source,
    dss_load_date
FROM ranked
WHERE rn = 1
