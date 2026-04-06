{% macro list_parquet_files(folder_path) %}
{#
    HINWEIS: Dieses Macro ist in Azure SQL Database NICHT ausführbar.
    
    Azure SQL DB unterstützt keine Directory-Enumeration über OPENROWSET (nur Synapse
    Serverless SQL Pool), und sp_invoke_external_rest_endpoint unterstützt nur 
    JSON-Responses (Azure Blob List API liefert XML, ADLS DFS API ist geblockt).

    Das Listing wird daher über die VS Code Extension via Azure CLI durchgeführt:
        discoverService.ts → listParquetFiles() → az storage blob list

    Alternativ manuell:
        az storage blob list \
          --account-name analyticsstoraccount001 \
          --container-name stage-fs \
          --prefix ewb/abacus/ \
          --query '[].name' \
          --output json \
          --auth-mode login
#}

{% if execute %}
    {{ log("", info=True) }}
    {{ log("FEHLER: list_parquet_files ist in Azure SQL DB nicht ausführbar.", info=True) }}
    {{ log("Verwende stattdessen die VS Code Extension oder:", info=True) }}
    {{ log("  az storage blob list --account-name analyticsstoraccount001 --container-name stage-fs --prefix " ~ folder_path ~ "/ --query '[].name' --output json --auth-mode login", info=True) }}
    {{ log("", info=True) }}
    {{ exceptions.raise_compiler_error("list_parquet_files ist nicht für Azure SQL DB geeignet. Siehe Macro-Header für Alternative.") }}
{% endif %}

{% endmacro %}

