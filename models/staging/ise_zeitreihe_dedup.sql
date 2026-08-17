/*
 * Pre-Staging Deduplication: ise_zeitreihe_dedup
 *
 * Source: ext_ise_stammdaten (Wildcard External Table auf ewb/ise/stammdaten/)
 * Downstream: ise_zeitreihe_main (automate_dv.stage), ise_lastgang_dedup (Key-Auflösung)
 *
 * Inhalt: Stammdaten der i-SE-Zeitreihegruppe 150 "ewb_Power BI" (41 Zeitreihen).
 *
 * Problem 1 — Snapshot-Duplikate:
 *   Die External Table liest ALLE Export-Dateien. Der werktägliche i-SE-Export legt
 *   jeweils einen vollständigen Snapshot ab → aktuell 10 Snapshots, 410 Zeilen für
 *   41 Zeitreihen.
 *
 *   Auflösung per DISTINCT über die FACHSPALTEN (GROUP BY), bewusst NICHT
 *   "letzter Snapshot gewinnt": fachlich identische Snapshots kollabieren auf eine
 *   Zeile. Die Metadatenspalten müssen dabei aggregiert werden — würde man sie
 *   einfach mitselektieren, bliebe wegen des je Datei unterschiedlichen
 *   dss_source_filename jede der 10 Zeilen stehen und DISTINCT liefe leer.
 *
 *   dss_load_date = Export-Zeitstempel des FRÜHESTEN Snapshots, der diesen Stand
 *   zeigt ("gültig seit"). Das ist die korrekte SCD-Semantik für den Satelliten
 *   und gleichzeitig die Vorlage für den späteren Dimensions-Snapshot (TASKS.md).
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
 * Offener Entscheid — Verhalten bei Attributänderung:
 *   Stand 2026-08-17 sind alle 10 Snapshots fachlich identisch (410 → 41 distinct).
 *   Ändert sich ein Attribut (z. B. GueltigBis wird gesetzt), liefert der GROUP BY
 *   ZWEI Zeilen je ID_Zeitreihe. Der ROW_NUMBER-Guard unten hält dann die
 *   Hub-Eindeutigkeit aufrecht, verdeckt die Änderung aber. Damit das nicht
 *   unbemerkt bleibt, schlägt der Test assert_ise_zeitreihe_snapshot_eindeutig an.
 *   Fachlicher Entscheid (SCD2-Historisierung vs. aktueller Stand): TASKS.md,
 *   "Dimensions-Snapshot-Strategie für i-SE-Zeitreihen-Stammdaten".
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

        -- Herkunft je Snapshot
        [dss_source_filename]                                             AS dss_source_filename,
        [dss_record_source]                                               AS dss_source_feed,
        [dss_run_id]                                                      AS dss_run_id,
        TRY_CAST([dss_stage_timestamp] AS DATETIME2)                      AS dss_stage_timestamp,
        {{ ise_export_timestamp('[dss_source_filename]') }}               AS dss_export_datum

    FROM source
    WHERE TRY_CAST([ID_Zeitreihe] AS INT) IS NOT NULL
),

-- DISTINCT über die Fachspalten; Metadaten des frühesten Snapshots je Stand
distinct_versionen AS (
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
        MIN(dss_export_datum)     AS dss_export_datum,
        MIN(dss_source_filename)  AS dss_source_filename,
        MIN(dss_source_feed)      AS dss_source_feed,
        MAX(dss_run_id)           AS dss_run_id,
        MIN(dss_stage_timestamp)  AS dss_stage_timestamp,
        COUNT(*)                  AS snapshot_treffer

    FROM typed
    GROUP BY
        id_zeitreihe, id_zeitreihe_typ, zeitreihe_typ, zeitreihe_key, einheit,
        zeitschritt_min, energieart, referenz_typ, referenz_id, referenz,
        standort, bezuegeranlage, id_zeitreihegruppe, zeitreihegruppe,
        reihenfolge, gruppe_gueltig_von, gruppe_gueltig_bis,
        zeitreihe_gueltig_von, zeitreihe_gueltig_bis
),

-- Guard: hält die Hub-Eindeutigkeit, falls sich ein Attribut geändert hat.
-- Überwacht durch assert_ise_zeitreihe_snapshot_eindeutig.
ranked AS (
    SELECT
        d.*,
        ROW_NUMBER() OVER (
            PARTITION BY d.id_zeitreihe
            ORDER BY d.zeitreihe_gueltig_von DESC,
                     d.gruppe_gueltig_von DESC,
                     d.id_zeitreihe_typ
        ) AS rn
    FROM distinct_versionen d
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
    snapshot_treffer,
    dss_source_filename,
    dss_source_feed,
    dss_run_id,
    dss_stage_timestamp,
    dss_export_datum,
    CAST('ewb_ise' AS NVARCHAR(100))                           AS dss_record_source,
    COALESCE(dss_export_datum, CAST(GETDATE() AS DATETIME2))   AS dss_load_date
FROM ranked
WHERE rn = 1
