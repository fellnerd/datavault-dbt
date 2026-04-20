{{ config(materialized='view') }}

SELECT
    MAX(CASE WHEN pipeline_name = 'load-fs_ewb' THEN completed_at END)  AS last_adf_load,
    MAX(CASE WHEN pipeline_name = 'dbt_run'     THEN completed_at END)  AS last_dbt_run,
    CASE WHEN
        MAX(CASE WHEN pipeline_name = 'load-fs_ewb' THEN completed_at END)
        >
        ISNULL(MAX(CASE WHEN pipeline_name = 'dbt_run' THEN completed_at END), '1900-01-01')
    THEN 1 ELSE 0 END                                                    AS dbt_run_pending
FROM vault.load_status
WHERE CAST(completed_at AS DATE) = CAST(GETDATE() AS DATE)
  AND status = 'completed'
