-- =============================================================================
-- SETUP SCRIPT: EWB Datenbanken (datavault / datavault-dev / datavault-test)
-- =============================================================================
-- Ausführen in Azure Data Studio oder SSMS
-- Server : sql-analytics-ewb-001.database.windows.net
-- Admin  : sqladmin
--
-- Dieses Skript EINMAL pro Datenbank ausführen (DB wechseln, dann erneut laufen).
-- Reihenfolge: datavault-dev → datavault-test → datavault (Prod zuletzt)
--
-- Voraussetzung:
--   Managed Identity der Azure SQL-Instanz muss Storage Blob Data Reader
--   auf Container "stage-fs" in Storage Account "analyticsstoraccount001" haben.
--   (RBAC via Azure Portal / az role assignment create)
--   Kein SAS-Token erforderlich.
-- =============================================================================

-- Zieldatenbank setzen (ggf. manuell wechseln wenn USE nicht unterstützt)
-- USE [datavault-dev];
-- GO

-- =============================================================================
-- 1. SCHEMAS
-- =============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'stg')
    EXEC('CREATE SCHEMA stg');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'vault')
    EXEC('CREATE SCHEMA vault');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'bv')
    EXEC('CREATE SCHEMA bv');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'mart')
    EXEC('CREATE SCHEMA mart');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'mart_finance')
    EXEC('CREATE SCHEMA mart_finance');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'mart_project')
    EXEC('CREATE SCHEMA mart_project');
GO

-- =============================================================================
-- 2. MASTER KEY
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.symmetric_keys WHERE name = '##MS_DatabaseMasterKey##'
)
    CREATE MASTER KEY ENCRYPTION BY PASSWORD = 'EWB-MK-2026!xZ9q';
GO

-- =============================================================================
-- 3. DATABASE SCOPED CREDENTIAL (Managed Identity)
-- =============================================================================
-- Verwendet die Managed Identity der Azure SQL-Instanz für den Storage-Zugriff.
-- Kein Secret / SAS-Token erforderlich.
-- Voraussetzung: RBAC Storage Blob Data Reader auf Container "stage-fs" vergeben.
IF NOT EXISTS (
    SELECT 1 FROM sys.database_scoped_credentials WHERE name = 'managed_identity'
)
    CREATE DATABASE SCOPED CREDENTIAL managed_identity
        WITH IDENTITY = 'Managed Service Identity';
GO

-- =============================================================================
-- 4. EXTERNAL FILE FORMAT (Parquet / Snappy)
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.external_file_formats WHERE name = 'ParquetFormat'
)
    CREATE EXTERNAL FILE FORMAT ParquetFormat
        WITH (
            FORMAT_TYPE = PARQUET,
            DATA_COMPRESSION = 'org.apache.hadoop.io.compress.SnappyCodec'
        );
GO

-- =============================================================================
-- 5. EXTERNAL FILE FORMAT (JSON via CSV-Trick für SharePoint-Daten)
-- =============================================================================
-- JsonAsCsvFormat: JSON-Dateien als einspaltiges DELIMITEDTEXT einlesen.
-- Feldtrennzeichen 0x0b (vertikaler Tabulator) kommt in JSON nicht vor,
-- sodass jede JSON-Zeile als eine Spalte (NVARCHAR(MAX)) gelesen wird.
IF NOT EXISTS (
    SELECT 1 FROM sys.external_file_formats WHERE name = 'JsonAsCsvFormat'
)
    CREATE EXTERNAL FILE FORMAT JsonAsCsvFormat
        WITH (
            FORMAT_TYPE = DELIMITEDTEXT,
            FORMAT_OPTIONS (
                FIELD_TERMINATOR = '0x0b',
                STRING_DELIMITER = '0x0b',
                FIRST_ROW = 1
            )
        );
GO

-- =============================================================================
-- 5. EXTERNAL DATA SOURCE: StageFileSystem
-- =============================================================================
-- Zeigt auf Container "stage-fs" im Storage Account "analyticsstoraccount001"
-- Format: adls://<account>.dfs.core.windows.net/<container>
-- (Azure SQL Database unterstützt das adls://-Schema; abfss:// und
--  https://blob... funktionieren NICHT)
-- Name "StageFileSystem" ist der einheitliche Name für alle Konzepte
-- (Jira, AdventureWorks, EWB) – muss in allen DBs identisch heissen.
IF NOT EXISTS (
    SELECT 1 FROM sys.external_data_sources WHERE name = 'StageFileSystem'
)
    CREATE EXTERNAL DATA SOURCE StageFileSystem
        WITH (
            LOCATION = 'adls://analyticsstoraccount001.dfs.core.windows.net/stage-fs',
            CREDENTIAL = managed_identity
        );
GO

-- =============================================================================
-- 6. EXTERNAL DATA SOURCE: LandingZoneFS
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.external_data_sources WHERE name = 'LandingZoneFS'
)
    CREATE EXTERNAL DATA SOURCE LandingZoneFS
        WITH (
            LOCATION = 'adls://analyticsstoraccount001.dfs.core.windows.net/landing-zone',
            CREDENTIAL = managed_identity
        );
GO
-- =============================================================================
-- 7. VALIDIERUNG
-- =============================================================================
SELECT 'Schema'       AS [Typ], name AS [Name] FROM sys.schemas
    WHERE name IN ('stg', 'vault', 'bv', 'mart', 'mart_finance', 'mart_project')
UNION ALL
SELECT 'Credential',  name FROM sys.database_scoped_credentials
    WHERE name = 'managed_identity'
UNION ALL
SELECT 'File Format', name FROM sys.external_file_formats
    WHERE name IN ('ParquetFormat', 'JsonAsCsvFormat')
UNION ALL
SELECT 'Data Source', name FROM sys.external_data_sources
    WHERE name IN ('StageFileSystem', 'LandingZoneFS');
GO

-- =============================================================================
-- 7. VERBINDUNGSTEST: OPENROWSET (optional)
-- =============================================================================
-- Führe nach dem Setup aus um Parquet-Files zu prüfen:
--
-- SELECT TOP 5 r.filepath(1) AS file_name
-- FROM OPENROWSET(
--     BULK 'ewb/abacus/*.parquet',
--     DATA_SOURCE = 'StageFileSystem',
--     FORMAT = 'PARQUET'
-- ) AS r;
--
-- Erwartet: Zeilen mit file_name = 'FIBU.FHE.Main' o.ä.
-- GO

PRINT 'EWB Basis-Setup abgeschlossen.';
PRINT 'Nächste Schritte:';
PRINT '  1. export DBT_EWB_SQL_PASSWORD=<Passwort>';
PRINT '  2. cd datavault-dbt';
PRINT '  3. dbt debug --target ewb-dev';
PRINT '  4. dbt run-operation stage_external_sources --target ewb-dev';
GO
