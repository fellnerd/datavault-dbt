/*
 * Dimension: dim_kreditor
 * Schema: mart_finance
 *
 * Kreditoren (Lieferanten) mit Adress-Referenz.
 * Abgeleitet aus hub_kreditor (Ghost Hub) + sat_kreditor__abacus_current_v.
 * Ghost Hub: Kreditoren-Stammdaten werden aus Kreditorenbelegen (KRED.KBL.Main) abgeleitet.
 *
 * Synapse-Referenz: Finance/Kunden (KNR + ADRID).
 * Zusaetzlich: FADRINR (Adressstamm-Referenz, 100% befuellt).
 *
 * Vault-Lineage: hub_kreditor.knr + sat_kreditor__abacus (adrid, fadrinr)
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('TRY_CAST(hk.knr AS INT)') }}                                      AS kreditor_key,
    CAST(hk.knr AS NVARCHAR(255))                                                       AS kreditor_id,
    CAST(hk.knr AS NVARCHAR(255))                                                       AS kreditor_code,
    ISNULL(CAST(sk.adrid AS NVARCHAR(255)), ISNULL(CAST(hk.knr AS NVARCHAR(255)), 'UNKNOWN')) AS kreditor_name,
    sk.fadrinr,
    sk.dss_load_date,
    sk.dss_record_source
FROM {{ ref('hub_kreditor') }} hk
INNER JOIN {{ ref('sat_kreditor__abacus_current_v') }} sk
    ON hk.hk_kreditor = sk.hk_kreditor
