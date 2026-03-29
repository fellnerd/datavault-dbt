/*
 * Link: link_<hub1>_<hub2>
 *
 * Confluence-Schicht: VAULT.raw (Raw Vault - Insert-Only)
 * Schema: vault_<concept>
 * Beziehung: <hub1> ↔ <hub2> (n:m)
 *
 * Confluence Link-Regeln (ITDATAH §2.2):
 *   - Beschreibt Beziehungen zwischen Geschäftsobjekten
 *   - Verbindet mindestens 2 Hubs
 *   - Immer n:m Beziehungen
 *   - Keine Links zwischen Links
 *   - Insert-Only
 *
 * Aufbau (Confluence §2.2 + §6):
 *   hk_link_<hub1>_<hub2>  CHAR(64)       - Link Hash Key (PK)
 *   hk_<hub1>               CHAR(64)       - FK zu hub_<hub1>
 *   hk_<hub2>               CHAR(64)       - FK zu hub_<hub2>
 *   dss_load_date            DATETIME2(7)   - Beladungs-Timestamp
 *   dss_record_source        VARCHAR(255)   - Quellenidentifikation
 *
 * Beladung: automate_dv.link() → Insert-Only, Duplikate via Link Hash Key erkannt
 */

{%- set src_pk = 'hk_link_<hub1>_<hub2>' -%}
{%- set src_fk = ['hk_<hub1>', 'hk_<hub2>'] -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.link(src_pk=src_pk,
                    src_fk=src_fk,
                    src_ldts=src_ldts,
                    src_source=src_source,
                    source_model='<concept>_<entity>') }}
