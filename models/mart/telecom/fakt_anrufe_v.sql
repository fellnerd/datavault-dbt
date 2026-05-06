/*
 * Faktentabelle (öffentliche Schnittstelle): fakt_anrufe_v
 * Schema: mart_telecom
 *
 * Tages-Aggregat: Anrufe/SMS pro Vertrag, Tag und Gesprächstyp.
 * Wrapper-View auf fakt_anrufe__base (incremental table).
 *
 * Grain: 1 Zeile pro (vertrag_key, verbindungs_datum_key, record_type, is_roaming).
 * Inkrementelle Logik und Schema: siehe fakt_anrufe__base.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT * FROM {{ ref('fakt_anrufe') }}
