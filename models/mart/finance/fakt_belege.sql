/*
 * Faktentabelle: fakt_belege
 * Schema: mart_finance
 *
 * Kreditorenbelege (Lieferantenrechnungen) mit Kreditoren-, Status- und Zahlungszuordnung.
 * Repliziert Synapse [Finance].[Belege] vollstaendig:
 *   KBL (Kreditorenbelege) LEFT JOIN KVL (Zahlungsvisierungen).
 *
 * Granularitaet: 1 Zeile pro (Beleg × Zahlung/Visierungsposition)
 *   — KBL ohne KVL: 1 Zeile (NULL-Zahlungsfelder)
 *   — KBL mit N KVL-Positionen: N Zeilen
 *
 * Vault-Lineage:
 *   hub_kreditorenbeleg.belnr
 *   + sat_kreditorenbeleg__abacus_current_v  (Beleg-Attribute)
 *   + link_kreditorenbeleg_kreditor → hub_kreditor.knr         (FK Kreditor)
 *   + link_kreditorenbeleg_zahlung  → hub_zahlung              (FK Zahlung)
 *     + sat_zahlung__abacus_current_v                          (Zahlungs-Attribute)
 *
 * Spalten-Mapping (Vault → Mart):
 *   KBL: bwbtr          → betrag            (Betrag Buchungswaehrung)
 *        bwbtr-mwsbwbtr → nettobetrag       (Betrag ohne MWST)
 *        bwwrc          → waehrung          (Buchungswaehrungscode)
 *        belref         → umschreibung      (Belegtext/Referenz)
 *        erfuser        → visierende_id     (Erfassungsbenutzer)
 *        user_f         → visierende        (Freigabe-Benutzer)
 *        kbeldat        → datum_key         (Kreditoren-Belegdatum)
 *        statid         → buchungsstatus_key(Status-Referenz)
 *   KVL: freigabebetrag → zahlbetrag        (Freigabebetrag der Zahlungsposition)
 *        datum_zeit     → valuta_datum      (Datum der Zahlungsposition)
 *        positionnr     → positionnr        (Zahlungspositions-Nummer, aus hub_zahlung)
 *        elementtyp     → elementtyp        (Element-Typ der Position, aus hub_zahlung)
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT
    -- Dimension Keys (KBL)
    {{ surrogate_key('hkr.knr') }}                                                      AS kreditor_key,
    {{ surrogate_key('skb.statid') }}                                                    AS buchungsstatus_key,
    TRY_CAST(FORMAT(TRY_CAST(skb.kbeldat AS DATE), 'yyyyMMdd') AS INT)                  AS belegdatum_date_key,
    -- Degenerate Dimensions (KBL)
    CAST(hkb.belnr AS NVARCHAR(255))                                                     AS belegnummer,
    -- Measures (KBL)
    TRY_CAST(skb.bwbtr AS DECIMAL(18,2))                                                 AS betrag,
    TRY_CAST(skb.bwbtr AS DECIMAL(18,2))
        - ISNULL(TRY_CAST(skb.mwsbwbtr AS DECIMAL(18,2)), 0)                             AS nettobetrag,
    -- Attributes (KBL)
    CAST(skb.bwwrc AS NVARCHAR(10))                                                       AS waehrung,
    CAST(skb.belref AS NVARCHAR(4000))                                                    AS umschreibung,
    CAST(skb.erfuser AS NVARCHAR(255))                                                    AS visierende_id,
    CAST(skb.user_f AS NVARCHAR(255))                                                     AS visierende,
    -- Measures (KVL — Zahlungsvisierung)
    TRY_CAST(szv.freigabebetrag AS DECIMAL(18,2))                                         AS zahlbetrag,
    TRY_CAST(szv.datum_zeit AS DATE)                                                       AS valuta_datum,
    TRY_CAST(FORMAT(TRY_CAST(szv.datum_zeit AS DATE), 'yyyyMMdd') AS INT)                 AS valuta_datum_date_key,
    -- Degenerate Dimensions (KVL)
    CAST(hz.positionnr AS NVARCHAR(255))                                                   AS positionnr,
    CAST(hz.elementtyp AS NVARCHAR(255))                                                   AS elementtyp,
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
LEFT JOIN {{ ref('link_kreditorenbeleg_zahlung') }} lkz
    ON hkb.hk_kreditorenbeleg = lkz.hk_kreditorenbeleg
LEFT JOIN {{ ref('hub_zahlung') }} hz
    ON lkz.hk_zahlung = hz.hk_zahlung
LEFT JOIN {{ ref('sat_zahlung__abacus_current_v') }} szv
    ON hz.hk_zahlung = szv.hk_zahlung
