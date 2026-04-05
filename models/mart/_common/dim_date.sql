{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['static', 'dimension'],
    post_hook=[
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_date_date_key' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_date_date_key ON {{ this }} (date_key)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_date_year_month' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_date_year_month ON {{ this }} (year, month)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_date_year_quarter' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_date_year_quarter ON {{ this }} (year, quarter)"
    ]
) }}

/*
 * =============================================================================
 * DIM_DATE - Datumsdimension
 * =============================================================================
 * Generierte Datumsdimension mit vorberechneten Attributen für BI-Analysen.
 * Zeitraum: 2020-01-01 bis 2035-12-31 (16 Jahre)
 *
 * Verwendung:
 *   - JOIN über date_key (INT im Format YYYYMMDD) für Performance
 *   - Oder JOIN über full_date (DATE) für Flexibilität
 *
 * Hinweis:
 *   - is_today / is_yesterday stehen bewusst NICHT in dieser Tabelle (stale
 *     bei TABLE-Materialisierung). Dynamische Werte via dim_date_v (View).
 *   - iso_year kann von YEAR() abweichen: 1. Jan 2021 = ISO-Jahr 2020 (Woche 53).
 *   - Weekend-Check ist DATEFIRST-unabhängig (Bit-Arithmetik auf @@DATEFIRST).
 * =============================================================================
 */

WITH date_spine AS (
    -- Generiere alle Tage von 2020 bis 2035
    SELECT DATEADD(DAY, n, '2020-01-01') AS full_date
    FROM (
        SELECT TOP (DATEDIFF(DAY, '2020-01-01', '2036-01-01'))
            ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n
        FROM sys.objects a
        CROSS JOIN sys.objects b
    ) numbers
),

-- ISO-Jahr-Berechnung: Jahr des Donnerstags derselben ISO-Woche
-- (DATEPART(WEEKDAY) + @@DATEFIRST - 2) % 7 = 0=Mo, 1=Di, ..., 6=So → unabhängig von DATEFIRST
iso_base AS (
    SELECT
        full_date,
        (DATEPART(WEEKDAY, full_date) + @@DATEFIRST - 2) % 7 AS iso_wd,  -- 0=Mo…6=So
        DATEPART(ISO_WEEK, full_date)                        AS iso_week_nr
    FROM date_spine
),

date_attributes AS (
    SELECT
        -- Surrogate Key (Integer für optimierte JOINs)
        CAST(FORMAT(full_date, 'yyyyMMdd') AS INT) AS date_key,

        -- Natürlicher Schlüssel
        full_date,

        -- Jahr
        YEAR(full_date) AS year,
        CAST(FORMAT(full_date, 'yyyy') AS CHAR(4)) AS year_name,

        -- ISO-Jahr (weicht von YEAR() an Jahresgrenzen ab)
        YEAR(DATEADD(DAY, 3 - iso_wd, full_date)) AS iso_year,

        -- Quartal
        DATEPART(QUARTER, full_date) AS quarter,
        CONCAT('Q', DATEPART(QUARTER, full_date)) AS quarter_name,
        CONCAT(YEAR(full_date), '-Q', DATEPART(QUARTER, full_date)) AS year_quarter,

        -- Monat
        MONTH(full_date) AS month,
        FORMAT(full_date, 'MMMM', 'de-DE') AS month_name,
        FORMAT(full_date, 'MMM', 'de-DE') AS month_name_short,
        CONCAT(YEAR(full_date), '-', FORMAT(full_date, 'MM')) AS year_month,

        -- Woche (iso_year statt YEAR() für korrekte Jahresgrenzen)
        iso_week_nr AS iso_week,
        CONCAT(
            YEAR(DATEADD(DAY, 3 - iso_wd, full_date)),
            '-W',
            FORMAT(iso_week_nr, '00')
        ) AS year_week,

        -- Tag
        DAY(full_date) AS day_of_month,
        DATEPART(DAYOFYEAR, full_date) AS day_of_year,
        iso_wd + 1 AS day_of_week,  -- 1=Mo, 2=Di, ..., 7=So (ISO, DATEFIRST-unabhängig)
        FORMAT(full_date, 'dddd', 'de-DE') AS day_name,
        FORMAT(full_date, 'ddd', 'de-DE') AS day_name_short,

        -- Wochenend-Flags (DATEFIRST-unabhängig: iso_wd 5=Sa, 6=So)
        CASE WHEN iso_wd >= 5 THEN 'Y' ELSE 'N' END AS is_weekend,
        CASE WHEN iso_wd <  5 THEN 'Y' ELSE 'N' END AS is_weekday,

        -- Monats-Grenzen
        CASE WHEN DAY(full_date) = 1 THEN 'Y' ELSE 'N' END AS is_first_day_of_month,
        CASE WHEN full_date = EOMONTH(full_date) THEN 'Y' ELSE 'N' END AS is_last_day_of_month,

        -- Quartals-Grenzen
        CASE WHEN full_date = DATEFROMPARTS(YEAR(full_date), (DATEPART(QUARTER, full_date) - 1) * 3 + 1, 1)
             THEN 'Y' ELSE 'N' END AS is_first_day_of_quarter,
        CASE WHEN full_date = EOMONTH(DATEFROMPARTS(YEAR(full_date), DATEPART(QUARTER, full_date) * 3, 1))
             THEN 'Y' ELSE 'N' END AS is_last_day_of_quarter,

        -- Jahres-Grenzen
        CASE WHEN full_date = DATEFROMPARTS(YEAR(full_date), 1, 1) THEN 'Y' ELSE 'N' END AS is_first_day_of_year,
        CASE WHEN full_date = DATEFROMPARTS(YEAR(full_date), 12, 31) THEN 'Y' ELSE 'N' END AS is_last_day_of_year,

        -- Perioden-Berechnungen
        EOMONTH(full_date) AS last_day_of_month,
        DATEADD(DAY, 1, EOMONTH(full_date, -1)) AS first_day_of_month,
        DATEFROMPARTS(YEAR(full_date), (DATEPART(QUARTER, full_date) - 1) * 3 + 1, 1) AS first_day_of_quarter,
        EOMONTH(DATEFROMPARTS(YEAR(full_date), DATEPART(QUARTER, full_date) * 3, 1)) AS last_day_of_quarter,
        DATEFROMPARTS(YEAR(full_date), 1, 1) AS first_day_of_year,
        DATEFROMPARTS(YEAR(full_date), 12, 31) AS last_day_of_year,

        -- Vorjahresvergleich
        DATEADD(YEAR, -1, full_date) AS same_day_last_year,

        -- Metadata
        GETDATE() AS dss_load_date

    FROM iso_base
)

SELECT * FROM date_attributes
