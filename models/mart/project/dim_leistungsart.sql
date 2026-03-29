/*
 * Dimension: dim_leistungsart
 * Schema: mart_project
 *
 * Leistungsarten (Service Types) fuer Projektsachkonten.
 * Abgeleitet aus ref_leistungsart (PROJ.NTR).
 *
 * Surrogate Key: LeistungsartNr (INT) = NTR.NUMBER
 *
 * Quell-Vault-Objekte:
 *   - ref_leistungsart (PROJ.NTR — 29 distinkte Leistungsarten)
 *
 * Beispiele: "Normalzeit", "Ueberzeit ohne Zuschlag", "Bezug Ferien"
 * Mart-Bezug: fakt_stunden.LeistungsartNr → dim_leistungsart.LeistungsartNr
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['dimension'],
    post_hook=[
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_leistungsart_pk' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_leistungsart_pk ON {{ this }} (LeistungsartNr)"
    ]
) }}

SELECT
    CAST(ref_la.number AS INT)            AS LeistungsartNr,
    ref_la.description                    AS Beschreibung,
    ref_la.type                           AS Typ,
    CAST(ref_la.inaktiv AS INT)           AS Inaktiv
FROM {{ ref('ref_leistungsart') }} ref_la
