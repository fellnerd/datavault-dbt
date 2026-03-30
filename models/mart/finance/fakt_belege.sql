/*
 * Faktentabelle: fakt_belege
 * Schema: mart_finance
 *
 * Kreditorenbelege (Lieferantenrechnungen) mit Kreditoren- und Status-Zuordnung.
 * Repliziert Synapse [Finance].[Belege] (KBL-Teil; KVL kommt in Wave 3).
 *
 * Granularitaet: 1 Zeile pro Kreditorenbeleg (BELNR)
 *
 * Vault-Lineage:
 *   hub_kreditorenbeleg.belnr
 *   + sat_kreditorenbeleg__abacus_current_v (Beleg-Attribute)
 *   + link_kreditorenbeleg_kreditor → hub_kreditor.knr (FK Kreditor)
 *
 * Spalten-Mapping (Vault → Mart):
 *   bwbtr          → betrag         (Betrag Buchungswaehrung)
 *   bwbtr-mwsbwbtr → nettobetrag    (Betrag ohne MWST)
 *   bwwrc          → waehrung       (Buchungswaehrungscode)
 *   belref         → umschreibung   (Belegtext/Referenz)
 *   erfuser        → visierende_id  (Erfassungsbenutzer)
 *   user_f         → visierende     (Freigabe-Benutzer)
 *   kbeldat        → datum_key      (Kreditoren-Belegdatum)
 *   statid         → buchungsstatus_key (Status-Referenz)
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT
    -- Dimension Keys
    {{ surrogate_key('hkr.knr') }}                                                      AS kreditor_key,
    {{ surrogate_key('skb.statid') }}                                                    AS buchungsstatus_key,
    TRY_CAST(FORMAT(TRY_CAST(skb.kbeldat AS DATE), 'yyyyMMdd') AS INT)                  AS datum_key,
    -- Degenerate Dimensions
    CAST(hkb.belnr AS NVARCHAR(255))                                                     AS belegnummer,
    -- Measures
    TRY_CAST(skb.bwbtr AS DECIMAL(18,2))                                                 AS betrag,
    TRY_CAST(skb.bwbtr AS DECIMAL(18,2))
        - ISNULL(TRY_CAST(skb.mwsbwbtr AS DECIMAL(18,2)), 0)                             AS nettobetrag,
    -- Attributes
    CAST(skb.bwwrc AS NVARCHAR(10))                                                       AS waehrung,
    CAST(skb.belref AS NVARCHAR(4000))                                                    AS umschreibung,
    CAST(skb.erfuser AS NVARCHAR(255))                                                    AS visierende_id,
    CAST(skb.user_f AS NVARCHAR(255))                                                     AS visierende,
    -- Metadata
    skb.dss_load_date,
    skb.dss_record_source
FROM {{ ref('hub_kreditorenbeleg') }} hkb
INNER JOIN {{ ref('sat_kreditorenbeleg__abacus_current_v') }} skb
    ON hkb.hk_kreditorenbeleg = skb.hk_kreditorenbeleg
LEFT JOIN {{ ref('link_kreditorenbeleg_kreditor') }} lkk
    ON hkb.hk_kreditorenbeleg = lkk.hk_kreditorenbeleg
LEFT JOIN {{ ref('hub_kreditor') }} hkr
    ON lkk.hk_kreditor = hkr.hk_kreditor
