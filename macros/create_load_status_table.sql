{% macro create_load_status_table() %}
  {% set sql %}
    IF OBJECT_ID('vault.load_status', 'U') IS NULL
    CREATE TABLE vault.load_status (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        pipeline_name       NVARCHAR(100)  NOT NULL,
        dss_run_id          NVARCHAR(255),
        status              NVARCHAR(50)   NOT NULL,
        started_at          DATETIME2,
        completed_at        DATETIME2,
        target_database     NVARCHAR(100),
        dss_record_source   NVARCHAR(255),
        dss_load_date       DATETIME2,
        dss_create_datetime DATETIME2      DEFAULT GETDATE(),
        model_count         INT,
        details             NVARCHAR(MAX)
    )
  {% endset %}
  {% do run_query(sql) %}
  {{ log("vault.load_status created (or already exists)", info=True) }}
{% endmacro %}


{% macro log_load_status() %}
  {% set sql %}
    INSERT INTO vault.load_status (
        pipeline_name,
        dss_run_id,
        status,
        completed_at,
        target_database,
        dss_record_source,
        dss_load_date,
        dss_create_datetime
    ) VALUES (
        'dbt_run',
        '{{ invocation_id }}',
        'completed',
        GETDATE(),
        '{{ target.database }}',
        'dbt',
        CAST(GETDATE() AS DATE),
        GETDATE()
    )
  {% endset %}
  {% do run_query(sql) %}
  {{ log("load_status logged for invocation " ~ invocation_id, info=True) }}
{% endmacro %}