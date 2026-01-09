{% macro bootstrap_mds() %}
{# 
  Bootstrap-Macro für MDS Tabellen
  Wird bei Container-Start aufgerufen: dbt run-operation bootstrap_mds
#}

{% set schemas_sql %}
-- Schemas erstellen
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'mds_meta') EXEC('CREATE SCHEMA mds_meta');
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'mds_stage') EXEC('CREATE SCHEMA mds_stage');
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'mds_load') EXEC('CREATE SCHEMA mds_load');
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'mds_master') EXEC('CREATE SCHEMA mds_master');
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'mds_view') EXEC('CREATE SCHEMA mds_view');
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'mds_audit') EXEC('CREATE SCHEMA mds_audit');
{% endset %}

{% set model_sql %}
-- mds_meta.model Tabelle
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_meta' AND t.name = 'model')
CREATE TABLE mds_meta.model (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(100) NOT NULL UNIQUE,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    version INT NOT NULL DEFAULT 1,
    status NVARCHAR(20) NOT NULL DEFAULT 'draft',
    source_database NVARCHAR(100) NULL,
    target_schema NVARCHAR(100) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(100) NOT NULL DEFAULT 'system',
    updated_at DATETIME2,
    updated_by NVARCHAR(100)
);
{% endset %}

{% set entity_sql %}
-- mds_meta.entity Tabelle
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_meta' AND t.name = 'entity')
CREATE TABLE mds_meta.entity (
    id INT IDENTITY(1,1) PRIMARY KEY,
    model_id INT NOT NULL,
    code NVARCHAR(100) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    source_schema NVARCHAR(100),
    source_table NVARCHAR(255),
    target_schema NVARCHAR(100) NOT NULL DEFAULT 'mds_master',
    target_table NVARCHAR(255) NOT NULL,
    business_key_columns NVARCHAR(MAX) NOT NULL,
    staging_view NVARCHAR(255) NULL,
    hub_name NVARCHAR(255) NULL,
    is_deployed BIT NOT NULL DEFAULT 0,
    last_deployed_at DATETIME2 NULL,
    record_count INT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(100) NOT NULL DEFAULT 'system',
    updated_at DATETIME2,
    updated_by NVARCHAR(100),
    CONSTRAINT FK__entity__model_id FOREIGN KEY (model_id) REFERENCES mds_meta.model(id),
    CONSTRAINT UQ__entity__model_code UNIQUE (model_id, code)
);
{% endset %}

{% set attribute_sql %}
-- mds_meta.attribute Tabelle
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_meta' AND t.name = 'attribute')
CREATE TABLE mds_meta.attribute (
    id INT IDENTITY(1,1) PRIMARY KEY,
    entity_id INT NOT NULL,
    code NVARCHAR(100) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    data_type NVARCHAR(100) NOT NULL,
    max_length INT,
    is_nullable BIT NOT NULL DEFAULT 1,
    is_business_key BIT NOT NULL DEFAULT 0,
    default_value NVARCHAR(MAX),
    validation_regex NVARCHAR(500),
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(100) NOT NULL DEFAULT 'system',
    CONSTRAINT FK__attribute__entity_id FOREIGN KEY (entity_id) REFERENCES mds_meta.entity(id),
    CONSTRAINT UQ__attribute__entity_code UNIQUE (entity_id, code)
);
{% endset %}

{% set view_sql %}
-- mds_meta.view Tabelle
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_meta' AND t.name = 'view')
CREATE TABLE mds_meta.[view] (
    id INT IDENTITY(1,1) PRIMARY KEY,
    entity_id INT NOT NULL,
    code NVARCHAR(100) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    view_type NVARCHAR(50) NOT NULL DEFAULT 'current',
    view_definition NVARCHAR(MAX),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(100) NOT NULL DEFAULT 'system',
    CONSTRAINT FK__view__entity_id FOREIGN KEY (entity_id) REFERENCES mds_meta.entity(id),
    CONSTRAINT UQ__view__entity_code UNIQUE (entity_id, code)
);
{% endset %}

{% set staged_record_sql %}
-- mds_stage.staged_record Tabelle
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_stage' AND t.name = 'staged_record')
CREATE TABLE mds_stage.staged_record (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    entity_id INT NOT NULL,
    business_key_hash CHAR(64) NOT NULL,
    business_key NVARCHAR(MAX) NULL,
    payload NVARCHAR(MAX) NOT NULL,
    data NVARCHAR(MAX) NULL,
    previous_data NVARCHAR(MAX) NULL,
    commit_id INT NULL,
    operation NVARCHAR(10) NOT NULL DEFAULT 'UPSERT',
    status NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
    validation_errors NVARCHAR(MAX),
    source_system NVARCHAR(100),
    source_id NVARCHAR(255),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(100) NOT NULL DEFAULT 'system',
    processed_at DATETIME2,
    processed_by NVARCHAR(100),
    CONSTRAINT FK__staged_record__entity_id FOREIGN KEY (entity_id) REFERENCES mds_meta.entity(id)
);

{% endset %}

{% set commit_sql %}
-- mds_stage.commit Tabelle
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_stage' AND t.name = 'commit')
CREATE TABLE mds_stage.[commit] (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(50) NOT NULL,
    description NVARCHAR(500) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by NVARCHAR(100) NOT NULL DEFAULT 'system',
    approved_at DATETIME2 NULL,
    approved_by NVARCHAR(100) NULL,
    deployed_at DATETIME2 NULL,
    deployed_by NVARCHAR(100) NULL
);
{% endset %}

{% set index_sql %}
-- Indices für staged_record
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_staged_record_entity_status')
CREATE INDEX IX_staged_record_entity_status ON mds_stage.staged_record(entity_id, status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_staged_record_business_key')
CREATE INDEX IX_staged_record_business_key ON mds_stage.staged_record(business_key_hash);
{% endset %}

-- Ausführen
{{ log("Creating MDS schemas...", info=True) }}
{% do run_query(schemas_sql) %}

{{ log("Creating mds_meta.model table...", info=True) }}
{% do run_query(model_sql) %}

{{ log("Creating mds_meta.entity table...", info=True) }}
{% do run_query(entity_sql) %}

{{ log("Creating mds_meta.attribute table...", info=True) }}
{% do run_query(attribute_sql) %}

{{ log("Creating mds_meta.view table...", info=True) }}
{% do run_query(view_sql) %}

{{ log("Creating mds_stage.staged_record table...", info=True) }}
{% do run_query(staged_record_sql) %}

{{ log("Creating mds_stage.commit table...", info=True) }}
{% do run_query(commit_sql) %}

{{ log("Creating indices...", info=True) }}
{% do run_query(index_sql) %}

{{ log("MDS Bootstrap completed successfully!", info=True) }}

{% endmacro %}
