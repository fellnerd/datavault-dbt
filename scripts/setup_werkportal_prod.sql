-- =====================================================
-- SETUP SCRIPT: Vault_Werkportal (Produktion)
-- =====================================================
-- Ausführen in Azure Data Studio oder Azure Portal
-- Verbindung: sql-datavault-weu-001.database.windows.net
-- Datenbank: Vault_Werkportal
-- =====================================================

-- 1. SCHEMAS ERSTELLEN
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'stg')
    EXEC('CREATE SCHEMA stg');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'vault')
    EXEC('CREATE SCHEMA vault');
GO

-- 2. MASTER KEY (falls noch nicht vorhanden)
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name = '##MS_DatabaseMasterKey##')
    CREATE MASTER KEY ENCRYPTION BY PASSWORD = '<STRONG_PASSWORD_HERE>';
GO

-- 3. DATABASE SCOPED CREDENTIAL
-- =====================================================
-- SAS Token aus Azure Storage Account holen
-- Storage Account: <YOUR_STORAGE_ACCOUNT>
-- Container: <YOUR_CONTAINER>
IF NOT EXISTS (SELECT 1 FROM sys.database_scoped_credentials WHERE name = 'adls_credential')
    CREATE DATABASE SCOPED CREDENTIAL adls_credential
    WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
    SECRET = '<SAS_TOKEN_OHNE_FRAGEZEICHEN>';
GO

-- 4. EXTERNAL DATA SOURCE
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.external_data_sources WHERE name = 'adls_source')
    CREATE EXTERNAL DATA SOURCE adls_source
    WITH (
        TYPE = BLOB_STORAGE,
        LOCATION = 'https://<STORAGE_ACCOUNT>.blob.core.windows.net/<CONTAINER>',
        CREDENTIAL = adls_credential
    );
GO

-- 5. EXTERNAL FILE FORMAT (Parquet)
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.external_file_formats WHERE name = 'ParquetFormat')
    CREATE EXTERNAL FILE FORMAT ParquetFormat
    WITH (
        FORMAT_TYPE = PARQUET,
        DATA_COMPRESSION = 'org.apache.hadoop.io.compress.SnappyCodec'
    );
GO

-- 6. EXTERNAL TABLE: ext_company_client
-- =====================================================
-- Pfad anpassen: /werkportal/company_client/*.parquet
IF NOT EXISTS (SELECT 1 FROM sys.external_tables WHERE name = 'ext_company_client' AND schema_id = SCHEMA_ID('stg'))
    CREATE EXTERNAL TABLE [stg].[ext_company_client] (
        [object_id] INT,
        [company_name] NVARCHAR(255),
        [company_street] NVARCHAR(255),
        [company_zip] NVARCHAR(20),
        [company_city] NVARCHAR(100),
        [company_country] NVARCHAR(100),
        [company_email] NVARCHAR(255),
        [company_phone] NVARCHAR(50),
        [company_website] NVARCHAR(255),
        [company_logo] NVARCHAR(MAX),
        [company_description] NVARCHAR(MAX),
        [record_source] NVARCHAR(100),
        [dss_record_source] NVARCHAR(100),
        [dss_load_date] DATETIME2,
        [dss_run_id] NVARCHAR(100)
    )
    WITH (
        LOCATION = '/werkportal/company_client/',
        DATA_SOURCE = adls_source,
        FILE_FORMAT = ParquetFormat
    );
GO

-- 7. VALIDIERUNG
-- =====================================================
SELECT 'Schemas' AS [Type], name FROM sys.schemas WHERE name IN ('stg', 'vault')
UNION ALL
SELECT 'External Tables', s.name + '.' + t.name 
FROM sys.external_tables t 
JOIN sys.schemas s ON t.schema_id = s.schema_id;
GO

PRINT '✅ Setup abgeschlossen. Jetzt dbt run --target werkportal ausführen.'
