-- Test Lambda Vault Virtual Satellite with dynamic dss_is_current
-- Connection: sql-datavault-weu-001.database.windows.net / Vault

-- 1. Check if dss_is_current is correctly calculated
SELECT 
    hk_rechnung,
    name,
    dss_load_date,
    dss_record_source,
    dss_is_current,
    dss_end_date
FROM vault_werkportal.v_sat_rechnung
ORDER BY hk_rechnung, dss_load_date DESC;

-- 2. Count current vs historical records
SELECT 
    dss_is_current,
    COUNT(*) AS record_count
FROM vault_werkportal.v_sat_rechnung
GROUP BY dss_is_current;

-- 3. Verify only ONE current record per entity
SELECT 
    hk_rechnung,
    COUNT(*) AS current_count
FROM vault_werkportal.v_sat_rechnung
WHERE dss_is_current = 'Y'
GROUP BY hk_rechnung
HAVING COUNT(*) > 1;  -- Should return NO rows if working correctly

-- 4. Sample current records
SELECT TOP 10
    object_id,
    name,
    state,
    gross,
    dss_load_date,
    dss_record_source,
    dss_is_current
FROM vault_werkportal.v_sat_rechnung s
JOIN vault_werkportal.v_hub_rechnung h ON s.hk_rechnung = h.hk_rechnung
WHERE s.dss_is_current = 'Y'
ORDER BY s.dss_load_date DESC;
