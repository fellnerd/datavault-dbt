/*
 * Hub: hub_<entity>
 *
 * Confluence-Schicht: VAULT.raw (Raw Vault - Insert-Only, keine Umformung)
 * Schema: vault_<concept>
 * Geschäftsobjekt: <ENTITY_DESCRIPTION>
 * Business Key: <BK1> + <BK2> (alphabetisch sortiert)
 *
 * Confluence Hub-Regeln (ITDATAH §2.1):
 *   - Enthält NUR Business Keys + Hash Key (unveränderlich)
 *   - Hub ist Tenant-übergreifend
 *   - Natural Key als Business Key
 *   - Keine Umformung von Geschäftsentitäten im Raw Vault
 *
 * Aufbau (Confluence §2.1 + §6):
 *   hk_<entity>          CHAR(64)       - Hash Key (SHA2_256)
 *   <BK1>                NVARCHAR       - Business Key 1 (alphabetisch sortiert)
 *   <BK2>                NVARCHAR       - Business Key 2
 *   dss_business_key     NVARCHAR(255)  - Konkatenierter BK (Confluence §3)
 *   dss_create_datetime  DATETIME2(7)   - Timestamp Erstellung in Zieltabelle
 *   dss_load_date        DATETIME2(7)   - Timestamp Beladung (= dss_load_datetime)
 *   dss_record_source    VARCHAR(255)   - Quellenidentifikation
 *
 * Beladung: automate_dv.hub() mit src_extra_columns für dss_business_key + dss_create_datetime
 *           Insert-Only, Duplikate via Hash Key erkannt
 */

{%- set src_pk = 'hk_<entity>' -%}
{%- set src_nk = ['<BK1>', '<BK2>'] -%}
{%- set src_extra_columns = ['dss_business_key', 'dss_create_datetime'] -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.hub(src_pk=src_pk,
                   src_nk=src_nk,
                   src_extra_columns=src_extra_columns,
                   src_ldts=src_ldts,
                   src_source=src_source,
                   source_model='<concept>_<entity>') }}
