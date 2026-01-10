#!/usr/bin/env python3
"""
MDS Entity Model Generator

Generiert dbt Model-Dateien für alle aktiven Entities aus mds_meta.
Läuft als Teil des Deploy-Prozesses oder manuell.

Verwendung:
    cd /home/user/projects/datavault-dbt/masterdata/dbt
    python scripts/generate_models.py

    # Oder für spezifische Entity:
    python scripts/generate_models.py --entity customer

Nach Generierung:
    dbt run --select mds_master

Später: BullMQ Worker ruft dieses Script auf.
"""

import os
import sys
import argparse
import pyodbc
from pathlib import Path
from datetime import datetime

# Konfiguration
MODELS_DIR = Path(__file__).parent.parent / "models" / "mds_master"
VIEWS_DIR = Path(__file__).parent.parent / "models" / "mds_view"

# SQL Login aus Environment Variables (MDS_DB_USER, MDS_DB_PASSWORD)
def build_connection_string():
    """Baut Connection String mit SQL Auth aus Environment Variables"""
    user = os.environ.get("MDS_DB_USER", "sqladmin")
    password = os.environ.get("MDS_DB_PASSWORD")
    
    if password:
        # SQL Login
        return (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            "SERVER=sql-datavault-weu-001.database.windows.net;"
            "DATABASE=Vault;"
            f"UID={user};"
            f"PWD={password};"
            "TrustServerCertificate=yes"
        )
    else:
        raise ValueError("MDS_DB_PASSWORD environment variable is required")

# SQL Server Typ Mapping
SQL_TYPE_MAP = {
    'string': 'NVARCHAR(MAX)',
    'integer': 'INT',
    'decimal': 'DECIMAL(18,4)',
    'boolean': 'BIT',
    'date': 'DATE',
    'datetime': 'DATETIME2',
    'text': 'NVARCHAR(MAX)',
}


def get_connection():
    """Erstellt Datenbankverbindung mit SQL Auth"""
    conn_str = build_connection_string()
    return pyodbc.connect(conn_str)


def get_entities(conn, entity_code=None):
    """Lädt alle aktiven Entities aus mds_meta"""
    cursor = conn.cursor()
    
    query = """
        SELECT 
            e.id,
            e.code,
            e.name,
            e.is_versioned
        FROM mds_meta.entity e
        WHERE e.status = 'active'
    """
    
    if entity_code:
        query += " AND e.code = ?"
        cursor.execute(query, entity_code)
    else:
        cursor.execute(query)
    
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def get_attributes(conn, entity_id):
    """Lädt Attribute für eine Entity"""
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            a.code,
            a.name,
            a.data_type,
            a.max_length,
            a.is_business_key,
            a.is_required,
            a.sort_order
        FROM mds_meta.attribute a
        WHERE a.entity_id = ?
        ORDER BY a.sort_order
    """, entity_id)
    
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def get_entity_views(conn, entity_id):
    """Lädt alle aktiven Views für eine Entity"""
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            v.id,
            v.code,
            v.name,
            v.view_type,
            v.custom_sql,
            v.column_config,
            v.filter_condition,
            v.is_default
        FROM mds_meta.entity_view v
        WHERE v.entity_id = ? AND v.is_active = 1
    """, entity_id)
    
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def generate_model_sql(entity, attributes):
    """Generiert das dbt Model SQL für eine Entity"""
    
    entity_code = entity['code'].lower()
    # Load table: mds_load.<entity_code> (ohne load_ prefix)
    load_table = f"mds_load.{entity_code}"
    master_table = f"mds_master.{entity_code}"
    
    # Business Key finden
    business_key = None
    for attr in attributes:
        if attr['is_business_key']:
            business_key = attr['code']
            break
    
    if not business_key:
        business_key = 'business_key'  # Fallback
    
    # Spalten für SELECT
    columns = [attr['code'] for attr in attributes]
    
    # Change Detection Bedingungen generieren
    change_conditions = []
    for attr in attributes:
        col = attr['code']
        change_conditions.append(
            f"COALESCE(CAST(s.{col} AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.{col} AS NVARCHAR(MAX)), '')"
        )
    
    change_detection = " OR\n                ".join(change_conditions)
    
    # Spalten für SELECT generieren
    select_columns = ",\n        ".join(columns)
    
    # Model SQL - angepasst an mds_load Spaltenstruktur
    # mds_load.<entity> hat: id, business_key_hash, business_key, <attrs>, commit_id, operation, source_system, source_id, is_processed, created_at, processed_at
    model_sql = f'''{{{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='{entity_code}',
    incremental_strategy='append',
    as_columnstore=false,
    pre_hook=[
      "{{% if is_incremental() %}}
      -- Close existing current records that will be updated
      UPDATE {master_table}
      SET valid_to = GETUTCDATE(), 
          is_current = 0, 
          updated_at = GETUTCDATE(), 
          updated_by = 'dbt'
      WHERE is_current = 1 
        AND business_key IN (
          SELECT business_key 
          FROM {load_table} 
          WHERE is_processed = 0 
            AND operation IN ('UPDATE', 'DELETE', 'INSERT')
            AND business_key IN (SELECT business_key FROM {master_table} WHERE is_current = 1)
        )
      {{% endif %}}"
    ],
    post_hook=[
      "UPDATE {load_table} SET is_processed = 1, processed_at = GETUTCDATE() WHERE is_processed = 0"
    ]
  )
}}}}

{{#
  =====================================================
  MDS Master: {entity['name']}
  =====================================================
  
  Entity Code: {entity_code}
  Generated:   {datetime.now().isoformat()}
  
  Source: {load_table}
  Target: {master_table} (SCD2 historisiert)
  
  Business Key: {business_key}
  Columns: {', '.join(columns)}
  =====================================================
#}}

{{% if is_incremental() %}}

-- Incremental: Nur unverarbeitete Records aus Load-Tabelle
WITH source_data AS (
    SELECT 
        id AS load_id,
        business_key,
        business_key_hash,
        operation,
        {select_columns},
        commit_id,
        source_system,
        source_id,
        created_at
    FROM {load_table}
    WHERE is_processed = 0
),

-- Change Detection
changes AS (
    SELECT 
        s.*,
        t.business_key AS existing_business_key,
        CASE 
            WHEN t.business_key IS NULL THEN 'NEW'
            WHEN s.operation = 'DELETE' THEN 'DELETE'
            WHEN s.operation = 'UPDATE' OR (
                {change_detection}
            ) THEN 'CHANGED'
            ELSE 'NO_CHANGE'
        END AS change_type
    FROM source_data s
    LEFT JOIN {{{{ this }}}} t 
        ON s.business_key = t.business_key 
        AND t.is_current = 1
)

-- Insert new versions
SELECT
    business_key,
    business_key_hash,
    {select_columns},
    created_at AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    commit_id,
    source_system,
    source_id,
    load_id AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM changes
WHERE change_type IN ('NEW', 'CHANGED', 'DELETE')

{{% else %}}

-- Full Refresh: Alle Records
SELECT
    business_key,
    business_key_hash,
    {select_columns},
    created_at AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    commit_id,
    source_system,
    source_id,
    id AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM {load_table}
WHERE is_processed = 0

{{% endif %}}
'''
    
    return model_sql


def write_model_file(entity_code, model_sql):
    """Schreibt das Model in eine .sql Datei"""
    
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    
    filename = f"mds_{entity_code}.sql"
    filepath = MODELS_DIR / filename
    
    with open(filepath, 'w') as f:
        f.write(model_sql)
    
    print(f"  ✓ Generated: {filepath}")
    return filepath


def generate_view_sql(entity, view, attributes):
    """Generiert das dbt Model SQL für eine View"""
    import json
    
    entity_code = entity['code'].lower()
    view_code = view['code'].lower()
    master_table = f"mds_master.{entity_code}"
    
    # Parse column config
    column_config = []
    if view.get('column_config'):
        try:
            column_config = json.loads(view['column_config'])
        except:
            pass
    
    # Generate select columns
    if column_config:
        select_parts = []
        for col in column_config:
            col_code = col.get('code', '')
            alias = col.get('alias', col_code)
            if col_code:
                select_parts.append(f"    {col_code} AS [{alias}]")
        select_columns = ',\n'.join(select_parts)
    else:
        # Use all attributes
        select_parts = [f"    {attr['code']}" for attr in attributes]
        select_columns = ',\n'.join(select_parts)
    
    # Filter condition
    filter_sql = ""
    if view.get('filter_condition'):
        filter_sql = f"\n  AND {view['filter_condition']}"
    
    view_sql = f'''{{{{
  config(
    materialized='view',
    schema='mds_view',
    alias='{view_code}'
  )
}}}}

{{#
  MDS View: {view['name']}
  Entity: {entity['name']} ({entity_code})
  View Type: {view.get('view_type', 'standard')}
  
  Generated: {datetime.now().isoformat()}
  
  Quelle: {master_table} (nur aktuelle Records)
#}}

SELECT
{select_columns}
FROM {master_table}
WHERE is_current = 1
  AND is_deleted = 0{filter_sql}
'''
    
    return view_sql


def write_view_file(view_code, view_sql):
    """Schreibt das View Model in eine .sql Datei"""
    
    VIEWS_DIR.mkdir(parents=True, exist_ok=True)
    
    filename = f"{view_code}.sql"
    filepath = VIEWS_DIR / filename
    
    with open(filepath, 'w') as f:
        f.write(view_sql)
    
    print(f"  ✓ Generated View: {filepath}")
    return filepath


def main():
    parser = argparse.ArgumentParser(description='Generate dbt models for MDS entities')
    parser.add_argument('--entity', '-e', help='Generate model for specific entity code')
    parser.add_argument('--views-only', action='store_true', help='Only generate view models')
    parser.add_argument('--masters-only', action='store_true', help='Only generate master models')
    parser.add_argument('--dry-run', '-n', action='store_true', help='Show what would be generated')
    args = parser.parse_args()
    
    print("=" * 60)
    print("MDS Entity Model Generator")
    print("=" * 60)
    
    try:
        conn = get_connection()
        entities = get_entities(conn, args.entity)
        
        if not entities:
            print("No active entities found.")
            return 1
        
        print(f"\nFound {len(entities)} active entities:\n")
        
        generated_masters = []
        generated_views = []
        
        for entity in entities:
            entity_code = entity['code'].lower()
            print(f"Processing: {entity['name']} ({entity_code})")
            
            attributes = get_attributes(conn, entity['id'])
            
            if not attributes:
                print(f"  ⚠ No attributes found, skipping")
                continue
            
            print(f"  Attributes: {len(attributes)}")
            
            # Generate Master Model
            if not args.views_only:
                model_sql = generate_model_sql(entity, attributes)
                
                if args.dry_run:
                    print(f"  [DRY-RUN] Would generate: models/mds_master/mds_{entity_code}.sql")
                else:
                    filepath = write_model_file(entity_code, model_sql)
                    generated_masters.append(filepath)
            
            # Generate View Models
            if not args.masters_only:
                views = get_entity_views(conn, entity['id'])
                if views:
                    print(f"  Views: {len(views)}")
                    for view in views:
                        view_code = view['code'].lower()
                        view_sql = generate_view_sql(entity, view, attributes)
                        
                        if args.dry_run:
                            print(f"  [DRY-RUN] Would generate: models/mds_view/{view_code}.sql")
                        else:
                            filepath = write_view_file(view_code, view_sql)
                            generated_views.append(filepath)
        
        print("\n" + "=" * 60)
        print(f"Generated {len(generated_masters)} master model(s)")
        print(f"Generated {len(generated_views)} view model(s)")
        print("=" * 60)
        
        if (generated_masters or generated_views) and not args.dry_run:
            print("\nNext steps:")
            if generated_masters:
                print("  1. dbt run --select mds_master")
            if generated_views:
                print("  2. dbt run --select mds_view")
        
        conn.close()
        return 0
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
