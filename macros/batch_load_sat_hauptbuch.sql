{% macro batch_load_sat_hauptbuch(target_name=target.name) %}
{#
    Batch-Load für sat_hauptbuch__abacus.

    Grund: Azure SQL TCP-Gateway-Timeout (~430s) verhindert einen einzelnen
    Full-Refresh für 944k Zeilen × 178 Spalten. Stattdessen wird der Load
    in 12 Batches aufgeteilt — je eine GL-Quelldatei (E15–E26).

    Verwendung:
        dbt run-operation batch_load_sat_hauptbuch --target ewb-test
        dbt run-operation batch_load_sat_hauptbuch --vars '{"sat_batch_truncate": false}'

    Parameter:
        sat_batch_truncate (bool, default true): TRUNCATE vor dem Load.
            False = nur neue Dateien nachladen (bei partiellen Loads).
#}

{% set do_truncate = var('sat_batch_truncate', true) %}

{% set gl_files = ['E15','E16','E17','E18','E19','E20','E21','E22','E23','E24','E25','E26'] %}

{% set cols %}
    hk_hauptbuch, HASHDIFF,
    kto, dkbelegnummer, belnr, betrag, code, company, [date], division,
    dkkundennummer, dkposnummer, fbetr, frw, fwauto, gkto, iso,
    kst, kst2, mandant, mwstbetr, mwstcode, mwstincl, mwstjahr,
    mwstkto, mwstland, mwstmeth, mwstmonat, mwstsatz, mwsttyp,
    proj, projebene, sam, samnr, sh, [text], text2, waehr,
    dss_create_datetime, dss_load_date, dss_record_source,
    dss_is_current, dss_end_date
{% endset %}

{% set src_cols %}
    hk_hauptbuch, hd_hauptbuch AS HASHDIFF,
    kto, dkbelegnummer, belnr, betrag, code, company, [date], division,
    dkkundennummer, dkposnummer, fbetr, frw, fwauto, gkto, iso,
    kst, kst2, mandant, mwstbetr, mwstcode, mwstincl, mwstjahr,
    mwstkto, mwstland, mwstmeth, mwstmonat, mwstsatz, mwsttyp,
    proj, projebene, sam, samnr, sh, [text], text2, waehr,
    dss_create_datetime, dss_load_date, dss_record_source,
    'Y', NULL
{% endset %}

{% if do_truncate %}
    {% set truncate_sql %}TRUNCATE TABLE vault.sat_hauptbuch__abacus{% endset %}
    {% do run_query(truncate_sql) %}
    {% do log("sat_hauptbuch__abacus: TRUNCATE abgeschlossen", info=true) %}
{% endif %}

{% for file in gl_files %}
    {% set insert_sql %}
        INSERT INTO vault.sat_hauptbuch__abacus ({{ cols }})
        SELECT {{ src_cols }}
        FROM stg.ewb_fibu_gl
        WHERE dss_source_file_name = '{{ file }}.parquet'
          AND hk_hauptbuch IS NOT NULL
    {% endset %}

    {% do run_query(insert_sql) %}
    {% do log("sat_hauptbuch__abacus: Batch " ~ file ~ ".parquet eingefügt", info=true) %}
{% endfor %}

{% do log("sat_hauptbuch__abacus: Alle 12 Batches abgeschlossen.", info=true) %}

{% set flag_sql %}
    UPDATE vault.sat_hauptbuch__abacus
    SET dss_is_current = 'Y', dss_end_date = NULL
{% endset %}
{% do run_query(flag_sql) %}
{% do log("sat_hauptbuch__abacus: dss_is_current gesetzt.", info=true) %}

{% endmacro %}
