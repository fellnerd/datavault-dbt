/*
 * Dimension: dim_zeitreihe_v
 * Schema: mart_ise
 *
 * Stammdaten der i-SE-Energiezeitreihen (Zeitreihegruppe 150 "ewb_Power BI").
 * Grain: 1 Zeile pro Zeitreihe (hub_zeitreihe).
 *
 * Quellen:
 *   hub_zeitreihe                        — Business Key id_zeitreihe
 *   sat_zeitreihe__ise_current_v         — Eigenschaften der Serie (SCD1-Sicht)
 *   link_zeitreihe_gruppe                — Zuordnung zur Gruppe
 *   sat_zeitreihe_gruppe__ise_current_v  — Gruppenbezeichnung/Reihenfolge
 *
 * Hinweis zur Quellbenennung: zeitreihe_typ ist die Typbezeichnung
 * (z. B. "Bruttolastgangsumme BLS/EN"); sie ist NICHT eindeutig. Eindeutig wird
 * eine Serie erst mit der Referenz — deshalb zeitreihe_name als sprechende
 * Kombination "Typ (Referenz)" für Power-BI-Achsen.
 *
 * Die Gruppenzuordnung ist im Vault M:N modelliert. Solange nur Gruppe 150
 * angebunden ist, bleibt das Grain 1:1; kommen weitere Gruppen dazu, muss diese
 * View auf die gewuenschte Gruppe filtern oder das Grain wird verletzt —
 * ueberwacht durch den unique-Test auf zeitreihe_key.
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('hz.id_zeitreihe') }}                          AS zeitreihe_key,
    hz.id_zeitreihe                                                 AS zeitreihe_id,
    CAST(s.zeitreihe_typ AS NVARCHAR(400))                          AS zeitreihe_typ,
    CAST(s.referenz AS NVARCHAR(400))                               AS referenz,
    CAST(s.zeitreihe_typ + ' (' + s.referenz + ')' AS NVARCHAR(800)) AS zeitreihe_name,
    CAST(s.zeitreihe_key AS NVARCHAR(800))                          AS zeitreihe_exportschluessel,
    s.id_zeitreihe_typ                                              AS zeitreihe_typ_id,
    CAST(s.einheit AS NVARCHAR(50))                                 AS einheit,
    s.zeitschritt_min                                               AS zeitschritt_min,
    s.energieart                                                    AS energieart_id,
    CASE s.energieart WHEN 1 THEN 'Elektrizität' ELSE CAST(s.energieart AS NVARCHAR(50)) END
                                                                    AS energieart,
    s.referenz_typ                                                  AS referenz_typ_id,
    CASE s.referenz_typ
         WHEN 19  THEN 'Messpunkt'
         WHEN 172 THEN 'Marktpartner'
         ELSE CAST(s.referenz_typ AS NVARCHAR(50))
    END                                                             AS referenz_art,
    CAST(s.standort AS NVARCHAR(400))                               AS standort,
    CAST(s.bezuegeranlage AS NVARCHAR(400))                         AS bezuegeranlage,
    s.zeitreihe_gueltig_von                                         AS gueltig_von,
    s.zeitreihe_gueltig_bis                                         AS gueltig_bis,
    CAST(sg.zeitreihegruppe AS NVARCHAR(400))                       AS zeitreihegruppe,
    sg.reihenfolge                                                  AS gruppe_reihenfolge,
    hz.dss_load_date,
    hz.dss_record_source

FROM {{ ref('hub_zeitreihe') }} hz

INNER JOIN {{ ref('sat_zeitreihe__ise_current_v') }} s
    ON  s.hk_zeitreihe = hz.hk_zeitreihe
    AND s.dss_is_current = 'Y'

LEFT JOIN {{ ref('link_zeitreihe_gruppe') }} l
    ON l.hk_zeitreihe = hz.hk_zeitreihe

LEFT JOIN {{ ref('sat_zeitreihe_gruppe__ise_current_v') }} sg
    ON  sg.hk_link_zeitreihe_gruppe = l.hk_link_zeitreihe_gruppe
    AND sg.dss_is_current = 'Y'
