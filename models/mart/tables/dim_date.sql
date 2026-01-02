{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['static', 'dimension'],
    post_hook=[
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_date_date_key' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_date_date_key ON {{ this }} (date_key)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_date_year_month' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_date_year_month ON {{ this }} (year, month)"
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

date_attributes AS (
    SELECT
        -- Surrogate Key (Integer für optimierte JOINs)
        CAST(FORMAT(full_date, 'yyyyMMdd') AS INT) AS date_key,

        -- Natürlicher Schlüssel
        full_date,

        -- Jahr
        YEAR(full_date) AS year,
        CAST(FORMAT(full_date, 'yyyy') AS CHAR(4)) AS year_name,

        -- Quartal
        DATEPART(QUARTER, full_date) AS quarter,
        CONCAT('Q', DATEPART(QUARTER, full_date)) AS quarter_name,
        CONCAT(YEAR(full_date), '-Q', DATEPART(QUARTER, full_date)) AS year_quarter,

        -- Monat
        MONTH(full_date) AS month,
        FORMAT(full_date, 'MMMM', 'de-DE') AS month_name,
        FORMAT(full_date, 'MMM', 'de-DE') AS month_name_short,
        CONCAT(YEAR(full_date), '-', FORMAT(full_date, 'MM')) AS year_month,

        -- Woche
        DATEPART(ISO_WEEK, full_date) AS iso_week,
        CONCAT(YEAR(full_date), '-W', FORMAT(DATEPART(ISO_WEEK, full_date), '00')) AS year_week,

        -- Tag
        DAY(full_date) AS day_of_month,
        DATEPART(DAYOFYEAR, full_date) AS day_of_year,
        DATEPART(WEEKDAY, full_date) AS day_of_week,
        FORMAT(full_date, 'dddd', 'de-DE') AS day_name,
        FORMAT(full_date, 'ddd', 'de-DE') AS day_name_short,

        -- Flags
        CASE
            WHEN DATEPART(WEEKDAY, full_date) IN (1, 7) THEN 'Y'  -- Sonntag=1, Samstag=7 (US locale)
            ELSE 'N'
        END AS is_weekend,

        CASE
            WHEN DATEPART(WEEKDAY, full_date) NOT IN (1, 7) THEN 'Y'
            ELSE 'N'
        END AS is_weekday,

        -- Monats-/Quartals-/Jahresgrenzen
        CASE WHEN DAY(full_date) = 1 THEN 'Y' ELSE 'N' END AS is_first_day_of_month,
        CASE WHEN full_date = EOMONTH(full_date) THEN 'Y' ELSE 'N' END AS is_last_day_of_month,
        CASE WHEN full_date = DATEFROMPARTS(YEAR(full_date), 1, 1) THEN 'Y' ELSE 'N' END AS is_first_day_of_year,
        CASE WHEN full_date = DATEFROMPARTS(YEAR(full_date), 12, 31) THEN 'Y' ELSE 'N' END AS is_last_day_of_year,

        -- Relative Flags (zur Laufzeit berechnet)
        CASE WHEN full_date = CAST(GETDATE() AS DATE) THEN 'Y' ELSE 'N' END AS is_today,
        CASE WHEN full_date = DATEADD(DAY, -1, CAST(GETDATE() AS DATE)) THEN 'Y' ELSE 'N' END AS is_yesterday,

        -- Perioden-Berechnungen
        EOMONTH(full_date) AS last_day_of_month,
        DATEADD(DAY, 1, EOMONTH(full_date, -1)) AS first_day_of_month,
        DATEFROMPARTS(YEAR(full_date), 1, 1) AS first_day_of_year,
        DATEFROMPARTS(YEAR(full_date), 12, 31) AS last_day_of_year,

        -- Vorjahresvergleich
        DATEADD(YEAR, -1, full_date) AS same_day_last_year,

        -- Metadata
        GETDATE() AS dss_load_date

    FROM date_spine
)

SELECT * FROM date_attributes
