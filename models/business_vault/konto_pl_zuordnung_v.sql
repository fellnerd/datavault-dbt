/*
 * Business Vault: konto_pl_zuordnung_v
 *
 * Pattern: Business Vault Reference (abgeleitete Business-Regel, kein Quellsystem)
 * Source: seed_konto_pl_zuordnung (dbt Seed, manuell gepflegt)
 * Primary Key: konto_l2_prefix (Natural Key)
 * Schema: mart_finance (via dbt_project.yml business_vault-Config) — bewusst NICHT
 * vault, da direkt von Power BI konsumiert (Endnutzer sollen langfristig nur mart/
 * mart_<domain> sehen, nie vault/stg).
 *
 * WICHTIG: Enthaelt NICHT die Kontogruppen-Labels selbst (Konto_L2/KontoName_L2) —
 * die sind echte Sharepoint-Referenzdaten und kommen live aus ref_konto_v
 * (models/staging/ewb_sp_konten.sql). Diese Tabelle enthaelt nur die Teile,
 * fuer die es kein Quellsystem gibt:
 *   - konto_sort:          Anzeige-Reihenfolge (3->4->5->6a->6b->6c->7->8->x)
 *   - ab_stufe:             ab welcher P&L-Stufe (siehe konto_pl_stufen_v) die
 *                           Gruppe in die Zwischensumme einfliesst (NULL = fliesst
 *                           in keine Summenzeile ein, z.B. "x Hilfskonten")
 *   - konto_key_plug:       negativer Plug-Konto-Key fuer dim_konto_v
 *                           (NULL = bekommt keine Plug-Zeile, z.B. "x Hilfskonten")
 *   - konto_l2_korrektur / konto_l2_name_korrektur:
 *                           Korrektur NUR fuer "6a" (bekannter Encoding-Fehler in
 *                           Sharepoint: "Ü" -> "�"). Fuer alle anderen Gruppen NULL,
 *                           d.h. der rohe Sharepoint-Wert wird unveraendert verwendet.
 *
 * Zentralisiert die Business-Regel, die vorher parallel in dim_konto_v
 * (hartcodierte Plug-Zeilen + CASE-Bloecke) UND der Power-BI-Calculation-Group
 * "Summary Lines" (hartcodierte KEEPFILTERS-Strings) gepflegt wurde.
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-07-21 V1.1 Labels entfernt (kommen aus ref_konto_v), nur noch
 *            reine Business-Regel-Spalten (sort/ab_stufe/plug-key/korrektur).
 */

{{ config(
    materialized='view'
) }}

SELECT
    konto_l2_prefix,
    konto_sort,
    ab_stufe,
    konto_key_plug,
    konto_l2_korrektur,
    konto_l2_name_korrektur,
    'manual_business_rule'          AS dss_record_source,
    CAST(GETDATE() AS DATETIME2(7)) AS dss_load_date
FROM {{ ref('seed_konto_pl_zuordnung') }}
