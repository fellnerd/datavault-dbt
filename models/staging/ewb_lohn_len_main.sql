/*
 * Staging Model: ewb_lohn_len_main
 *
 * Source: ext_ewb_lohn_len_main
 * Business Key: EMPL_NR
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_person (Entity Hash Key)
 *
 * Payload (20 Spalten): Datenbasiert bereinigt — nur gepflegte Spalten.
 * Entfernt: alle konstanten Felder (0E-18, single value) und komplett leere Felder.
 */

{%- set hashdiff_columns = [
    'abrv',
    'adr_inr',
    'badge_id',
    'birth_place',
    'birthday',
    'date_in',
    'date_out',
    'empl_id',
    'first_name',
    'home_dept_nr',
    'last_name',
    'lpe_month',
    'lpe_year',
    'mutation_date',
    'nationality',
    'relevant_for_logib',
    'sex',
    'soc_insurance_nr',
    '[type]',
    'zemis_nr'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_lohn_len_main') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(LTRIM(RTRIM(CAST(EMPL_NR AS NVARCHAR(MAX)))), '-1')
        ), 2) AS hk_person,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(LTRIM(RTRIM(CAST({{ col }} AS NVARCHAR(MAX)))), '-1'){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_person,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        EMPL_NR,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        -- Identität
        empl_id,
        last_name,
        first_name,
        abrv,
        badge_id,
        birthday,
        sex,
        nationality,
        birth_place,
        -- Anstellung
        home_dept_nr,
        adr_inr,            -- FK → hub_adresse
        date_in,
        date_out,
        [type],             -- Mitarbeitertyp: M=Mitarbeiter, S=Student, R=Rentner, J=Jugend
        mutation_date,
        lpe_year,
        lpe_month,
        -- Sozialversicherung (CH)
        soc_insurance_nr,   -- AHV-Nummer
        -- Compliance & Register
        relevant_for_logib, -- LOGIB Lohngleichheitsanalyse
        zemis_nr,           -- CH Ausländerregister (nur Ausländer befüllt)

        -- ===========================================
        -- METADATA
        -- ===========================================
        CONCAT_WS('||', 'default', 'default',
            ISNULL(LTRIM(RTRIM(CAST(EMPL_NR AS NVARCHAR(MAX)))), '-1')
        ) AS dss_business_key,
        GETDATE() AS dss_create_datetime,
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged