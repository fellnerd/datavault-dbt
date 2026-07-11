/*
 * Test: keine Tier-1-Spalten in Mart-Schemas
 *
 * Tier-1-Daten (streng vertraulich: AHV-Nummer, ZEMIS-Nummer, Badge-ID)
 * werden per Design durch NICHT-EXPOSITION geschuetzt: sie duerfen nur im
 * vault-Schema liegen (null Business-Grants), nie in einem mart*-Schema.
 *
 * Schlaegt fehl, sobald eine Tier-1-Spalte in einem Mart-Objekt auftaucht
 * (z.B. durch ein unbedachtes SELECT * in einem neuen Mart-Model).
 *
 * Tier-Definition: docs/ext-features/datavault-security-architecture.md, Kap. 7
 */

SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA LIKE 'mart%'
  AND UPPER(COLUMN_NAME) IN (
        'SOC_INSURANCE_NR',   -- AHV-Nummer
        'ZEMIS_NR',           -- Auslaenderregister-Nr.
        'BADGE_ID'            -- Zutrittsausweis
  )
