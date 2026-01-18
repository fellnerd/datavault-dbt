#!/usr/bin/env python3
"""
Parquet to dbt sources.yml YAML Generator

Reads Parquet file schemas and generates YAML column definitions
for dbt-external-tables sources.yml format.

Usage:
    python parquet_to_yaml.py /stage-fs/jira/sql/*.parquet
    python parquet_to_yaml.py /stage-fs/jira/sql/Agile.Agile_Board_Backlog_Issues_Fields_Labels.parquet
    python parquet_to_yaml.py /stage-fs/jira/sql/ --recursive
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

try:
    import pyarrow.parquet as pq
except ImportError:
    print("Error: pyarrow not installed. Run: pip install pyarrow")
    sys.exit(1)


# Arrow type to SQL Server type mapping
ARROW_TO_SQLSERVER = {
    # Integers
    "int8": "TINYINT",
    "int16": "SMALLINT",
    "int32": "INT",
    "int64": "BIGINT",
    "uint8": "TINYINT",
    "uint16": "INT",
    "uint32": "BIGINT",
    "uint64": "BIGINT",
    
    # Floating point
    "float": "REAL",
    "float16": "REAL",
    "float32": "REAL",
    "float64": "FLOAT",
    "double": "FLOAT",
    
    # Boolean
    "bool": "BIT",
    "boolean": "BIT",
    
    # Strings
    "string": "NVARCHAR(4000)",
    "utf8": "NVARCHAR(4000)",
    "large_string": "NVARCHAR(MAX)",
    "large_utf8": "NVARCHAR(MAX)",
    
    # Binary
    "binary": "VARBINARY(MAX)",
    "large_binary": "VARBINARY(MAX)",
    
    # Date/Time
    "date32": "DATE",
    "date64": "DATE",
    "date32[day]": "DATE",
    "time32[s]": "TIME",
    "time32[ms]": "TIME",
    "time64[us]": "TIME",
    "time64[ns]": "TIME",
    "timestamp[s]": "DATETIME2",
    "timestamp[ms]": "DATETIME2",
    "timestamp[us]": "DATETIME2",
    "timestamp[ns]": "DATETIME2",
    "timestamp[s, tz=UTC]": "DATETIMEOFFSET",
    "timestamp[ms, tz=UTC]": "DATETIMEOFFSET",
    "timestamp[us, tz=UTC]": "DATETIMEOFFSET",
    "timestamp[ns, tz=UTC]": "DATETIMEOFFSET",
    
    # Decimal
    "decimal128": "DECIMAL(38,10)",
    
    # Null
    "null": "NVARCHAR(1)",
}


def arrow_type_to_sql(arrow_type_str: str) -> str:
    """Convert Arrow type string to SQL Server type."""
    type_str = str(arrow_type_str).lower()
    
    # Direct match
    if type_str in ARROW_TO_SQLSERVER:
        return ARROW_TO_SQLSERVER[type_str]
    
    # Handle decimal with precision/scale
    if type_str.startswith("decimal"):
        # e.g., "decimal128(18, 2)" or "decimal(18, 2)"
        import re
        match = re.search(r'decimal\d*\((\d+),\s*(\d+)\)', type_str)
        if match:
            precision, scale = match.groups()
            return f"DECIMAL({precision},{scale})"
        return "DECIMAL(38,10)"
    
    # Handle timestamp with timezone
    if "timestamp" in type_str:
        if "tz=" in type_str:
            return "DATETIMEOFFSET"
        return "DATETIME2"
    
    # Handle list/array types
    if type_str.startswith("list<") or type_str.startswith("large_list<"):
        return "NVARCHAR(MAX)"  # JSON representation
    
    # Handle struct types
    if type_str.startswith("struct<"):
        return "NVARCHAR(MAX)"  # JSON representation
    
    # Handle map types
    if type_str.startswith("map<"):
        return "NVARCHAR(MAX)"  # JSON representation
    
    # Default fallback
    return "NVARCHAR(4000)"


def generate_external_table_name(file_path: Path) -> str:
    """Generate external table name from file path."""
    # Remove .parquet extension
    name = file_path.stem
    # Replace dots with underscores
    name = name.replace(".", "_")
    # Convert to lowercase
    name = name.lower()
    # Add ext_ prefix
    return f"ext_{name}"


def parquet_to_yaml(file_path: Path, indent: int = 10) -> str:
    """
    Read Parquet file and generate YAML column definitions.
    
    Args:
        file_path: Path to the Parquet file
        indent: Number of spaces for indentation (default 10 for sources.yml format)
    
    Returns:
        YAML string with column definitions
    """
    # Read schema without loading data
    parquet_file = pq.ParquetFile(file_path)
    schema = parquet_file.schema_arrow
    
    lines = []
    base_indent = " " * indent
    
    for field in schema:
        name = field.name
        sql_type = arrow_type_to_sql(str(field.type))
        lines.append(f"{base_indent}- name: {name}")
        lines.append(f"{base_indent}  data_type: {sql_type}")
    
    return "\n".join(lines)


def generate_full_source_entry(file_path: Path, location_base: str = "/stage-fs") -> str:
    """
    Generate a complete source table entry for sources.yml.
    
    Args:
        file_path: Path to the Parquet file
        location_base: Base path for the external location
    """
    table_name = generate_external_table_name(file_path)
    relative_path = file_path.relative_to(Path(location_base).parent) if location_base else file_path
    
    # Read schema
    parquet_file = pq.ParquetFile(file_path)
    schema = parquet_file.schema_arrow
    
    lines = [
        f"      - name: {table_name}",
        f"        description: \"Auto-generated from {file_path.name}\"",
        "        external:",
        f"          location: \"/{relative_path}\"",
        "          file_format: parquet",
        "        columns:",
    ]
    
    for field in schema:
        name = field.name
        sql_type = arrow_type_to_sql(str(field.type))
        lines.append(f"          - name: {name}")
        lines.append(f"            data_type: {sql_type}")
    
    return "\n".join(lines)


def process_files(paths: list[Path], recursive: bool = False, full_entry: bool = False) -> None:
    """Process multiple Parquet files."""
    files_to_process = []
    
    for path in paths:
        if path.is_file() and path.suffix == ".parquet":
            files_to_process.append(path)
        elif path.is_dir():
            pattern = "**/*.parquet" if recursive else "*.parquet"
            files_to_process.extend(path.glob(pattern))
    
    if not files_to_process:
        print("No Parquet files found.")
        return
    
    for file_path in sorted(files_to_process):
        print(f"\n# === {file_path.name} ===")
        print(f"# Table: {generate_external_table_name(file_path)}")
        print(f"# Columns: {pq.ParquetFile(file_path).schema_arrow.names.__len__()}")
        print()
        
        if full_entry:
            print(generate_full_source_entry(file_path))
        else:
            print("        columns:")
            print(parquet_to_yaml(file_path, indent=10))


def main():
    parser = argparse.ArgumentParser(
        description="Generate dbt sources.yml YAML from Parquet file schemas",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s /stage-fs/jira/sql/MyFile.parquet
  %(prog)s /stage-fs/jira/sql/*.parquet
  %(prog)s /stage-fs/jira/sql/ --recursive
  %(prog)s /stage-fs/jira/sql/ --full-entry
        """
    )
    parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="Parquet files or directories to process"
    )
    parser.add_argument(
        "-r", "--recursive",
        action="store_true",
        help="Recursively search directories for Parquet files"
    )
    parser.add_argument(
        "-f", "--full-entry",
        action="store_true",
        help="Generate complete source table entry (not just columns)"
    )
    
    args = parser.parse_args()
    process_files(args.paths, recursive=args.recursive, full_entry=args.full_entry)


if __name__ == "__main__":
    main()
