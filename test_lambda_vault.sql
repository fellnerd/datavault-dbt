-- Test Lambda Vault Virtual Views
-- Run this against Vault database

-- Count rows in v_hub_rechnung
SELECT 'v_hub_rechnung' AS view_name, COUNT(*) AS row_count 
FROM vault_werkportal.v_hub_rechnung;

-- Count rows in v_sat_rechnung  
SELECT 'v_sat_rechnung' AS view_name, COUNT(*) AS row_count 
FROM vault_werkportal.v_sat_rechnung;

-- Sample data from v_hub_rechnung
SELECT TOP 5 
    object_id,
    LEFT(hk_rechnung, 16) + '...' AS hk_short,
    dss_load_date,
    dss_record_source
FROM vault_werkportal.v_hub_rechnung
ORDER BY dss_load_date DESC;

-- Sample data from v_sat_rechnung
SELECT TOP 5
    object_id,
    name,
    state,
    invoice_date,
    gross,
    dss_is_current,
    dss_record_source
FROM vault_werkportal.v_sat_rechnung
WHERE dss_is_current = 'Y'
ORDER BY dss_load_date DESC;
