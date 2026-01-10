{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias=var('entity_code', 'undefined'),
    incremental_strategy='append',
    as_columnstore=false,
    enabled=var('entity_code', none) is not none
  )
}}

{#
  =====================================================
  MDS Master Table - Generic SCD Type 2 Model
  =====================================================
  
  Dieses Model ist ein TEMPLATE und wird nicht direkt ausgeführt.
  Stattdessen wird für jede Entity ein eigenes Model generiert.
  
  Workflow:
  1. mds_load.load_<entity> (strukturiert, aus Deploy API)
  2. → mds_master.<entity> (SCD2 historisiert)
  
  Aufruf (nach Model-Generierung):
  dbt run --select mds_master.<entity_code>
  
  Oder alle:
  dbt run --select mds_master
  =====================================================
#}

-- Dieses Template Model ist disabled
-- Siehe: macros/generate_entity_models.sql für dynamische Generierung

SELECT 1 AS placeholder
WHERE 1 = 0
