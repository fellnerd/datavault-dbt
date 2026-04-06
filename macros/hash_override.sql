/*
 * Cast Binary Override für SQL Server
 * 
 * Überschreibt automate_dv's cast_binary, das standardmässig BINARY(32) produziert.
 * Wir brauchen CHAR(64) für SHA-256 (hex-encoded), damit die Hash Keys
 * lesbar und mit unseren bestehenden Vault-Tabellen kompatibel sind.
 *
 * automate_dv Default:  CONVERT(BINARY(32), HASHBYTES(...), 2)
 * Unser Override:       CONVERT(CHAR(64),   HASHBYTES(...), 2)
 */

{%- macro sqlserver__cast_binary(column_str, alias, quote) -%}

    {%- set selected_hash = var('hash', 'MD5') | lower -%}

    {%- if selected_hash == 'md5' -%}
        {%- set hash_size = 32 -%}
    {%- elif selected_hash == 'sha' -%}
        {%- set hash_size = 64 -%}
    {%- else -%}
        {%- set hash_size = 32 -%}
    {%- endif -%}

    {%- if quote -%}
        CONVERT(CHAR({{ hash_size }}), '{{ column_str }}', 2)
    {%- else -%}
        CONVERT(CHAR({{ hash_size }}), {{ column_str }}, 2)
    {%- endif -%}

    {%- if alias %} AS {{ alias }} {%- endif %}

{%- endmacro -%}


/*
 * Type String Override für SQL Server
 *
 * automate_dv Default:  VARCHAR  (single-byte, kann Unicode verlieren)
 * Unser Override:       NVARCHAR (Unicode-safe für CH-Daten mit Umlauten)
 *
 * Wichtig: HASHBYTES('SHA2_256', NVARCHAR) ≠ HASHBYTES('SHA2_256', VARCHAR)
 * → Full-Refresh erforderlich nach Migration.
 */

{%- macro sqlserver__type_string(is_hash, char_length) -%}
    NVARCHAR
{%- endmacro -%}
