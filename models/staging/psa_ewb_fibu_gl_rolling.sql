/*
 * Rolling-Filter View: psa_ewb_fibu_gl_rolling
 *
 * Zweck: Rollendes 2-Jahres-Fenster auf psa_ewb_fibu_gl.
 *        Liefert nur GL-Einträge ab 01.01. des letzten Kalenderjahrs.
 *
 *        Beispiel: am 01.06.2026 → WHERE DATE >= 01.01.2025
 *                  am 01.01.2027 → WHERE DATE >= 01.01.2026
 *
 * Begründung:
 *   ewb_fibu_gl wird als TABLE materialisiert (für Index-Performance auf hk_hauptbuch).
 *   Ohne Filter = 12 Jahresscheiben (E15-E26) = ~673s TABLE-Rebuild pro Run.
 *   Mit 2-Jahres-Filter = ~2 Jahresscheiben = geschätzt ~100-150s.
 *   Vault hat bereits History — incremental laedt nur neue/geaenderte Rows.
 *
 * Risiko / Wartung:
 *   GL-Korrekturen an Eintraegen vor letztem Jahr werden im normalen Run nicht verarbeitet.
 *   Einmal jährlich (Januar): dbt run --full-refresh --select ewb_fibu_gl+ zur vollstaendigen Neubeladung.
 *
 * Source: psa_ewb_fibu_gl (PSA-Tabelle mit allen historischen GL-Zeilen, E15-E26+)
 */

{{ config(
    materialized='view'
) }}

SELECT *
FROM {{ ref('psa_ewb_fibu_gl') }}
WHERE [DATE] >= CAST(DATEFROMPARTS(YEAR(GETDATE()) - 1, 1, 1) AS DATETIME2)
