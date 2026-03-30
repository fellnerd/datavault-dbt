/*
 * Dimension: dim_buchungsstatus
 * Schema: mart_finance
 *
 * Buchungsstatus fuer Kreditorenbelege (16 Zeilen, 7 Basis + 9 Provisorisch).
 * Abgeleitet aus ref_kred_buchungsstatus (KRED.KBS.Main).
 *
 * Pattern: Einfache Referenz-Dimension (wie dim_leistungsart).
 * Quelle: ref_kred_buchungsstatus (STATID = Code, STATDEF = Sortierung).
 *
 * Hinweis: STATDEF ist eine numerische Sortierung (31-80), KEIN Statusname.
 * STATID selbst ist der sprechende Code (OFFEN, ERLED, ABGES, BLOCK, etc.).
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('ref.statid') }}                                                    AS buchungsstatus_key,
    CAST(ref.statid AS NVARCHAR(255))                                                    AS buchungsstatus_id,
    CAST(ref.statid AS NVARCHAR(255))                                                    AS buchungsstatus_code,
    ISNULL(CAST(ref.statid AS NVARCHAR(255)), 'UNKNOWN')                                 AS buchungsstatus_name,
    TRY_CAST(ref.statdef AS INT)                                                         AS sort_order,
    ref.dss_load_date,
    ref.dss_record_source
FROM {{ ref('ref_kred_buchungsstatus') }} ref
