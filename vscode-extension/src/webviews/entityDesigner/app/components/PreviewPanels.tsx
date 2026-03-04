import React, { useMemo } from 'react';
import { Panels } from 'vscrui';
import type { DesignerColumnDefinition } from '../../../../types';

interface PreviewPanelsProps {
  entityName: string;
  concept: string;
  businessKeys: DesignerColumnDefinition[];
  attributes: DesignerColumnDefinition[];
  foreignKeys: DesignerColumnDefinition[];
}

/**
 * Preview panels showing generated SQL structure
 */
export const PreviewPanels: React.FC<PreviewPanelsProps> = ({
  entityName,
  concept,
  businessKeys,
  attributes,
  foreignKeys
}) => {
  const hubPreview = useMemo(() => {
    if (businessKeys.length === 0) {
      return '-- No business keys selected --';
    }
    
    const bkNames = businessKeys.map(bk => bk.name).join(', ');
    return `-- Hub: hub_${entityName}
-- Schema: vault_${concept}

SELECT DISTINCT
    hk_${entityName},           -- Hash Key (PK)
    ${bkNames},                 -- Business Key(s)
    dss_load_date,
    dss_record_source
FROM {{ ref('${concept}_${entityName}') }}
WHERE hk_${entityName} IS NOT NULL

-- Ghost Record included from seed`;
  }, [entityName, concept, businessKeys]);

  const satellitePreview = useMemo(() => {
    if (attributes.length === 0) {
      return '-- No attributes selected --';
    }
    
    const attrNames = attributes.map(a => a.name).join(',\n    ');
    const hashDiffCols = attributes
      .filter(a => a.includeInHashDiff)
      .map(a => a.name);
    
    return `-- Satellite: sat_${entityName}
-- Schema: vault_${concept}

SELECT DISTINCT
    hk_${entityName},           -- FK to Hub
    hd_${entityName},           -- Hash Diff (${hashDiffCols.length} columns)
    ${attrNames},
    dss_load_date,
    dss_record_source
FROM {{ ref('${concept}_${entityName}') }}

-- Incremental: Only new hash diffs`;
  }, [entityName, concept, attributes]);

  const linksPreview = useMemo(() => {
    if (foreignKeys.length === 0) {
      return '-- No foreign keys selected --';
    }
    
    return foreignKeys.map(fk => {
      const targetHub = fk.foreignKeyTarget || 'hub_???';
      const targetEntity = targetHub.replace('hub_', '');
      return `-- Link: link_${entityName}_${targetEntity}_${fk.name}
-- Schema: vault_${concept}
-- FK Column: ${fk.name} → ${targetHub}

SELECT DISTINCT
    hk_link_${entityName}_${targetEntity},  -- Link Hash Key
    hk_${entityName},                       -- FK to source Hub
    hk_${targetEntity},                     -- FK to target Hub
    ${fk.name},                             -- Driving Key
    dss_load_date,
    dss_record_source
FROM {{ ref('${concept}_${entityName}') }}
WHERE ${fk.name} IS NOT NULL`;
    }).join('\n\n---\n\n');
  }, [entityName, concept, foreignKeys]);

  const tabs = [
    { id: 'hub', label: `Hub (${businessKeys.length} BK)` },
    { id: 'satellite', label: `Satellite (${attributes.length} attrs)` },
    { id: 'links', label: `Links (${foreignKeys.length})` }
  ];

  const views = [
    { id: 'hub', content: <pre>{hubPreview}</pre> },
    { id: 'satellite', content: <pre>{satellitePreview}</pre> },
    { id: 'links', content: <pre>{linksPreview}</pre> }
  ];

  return (
    <div className="preview-section">
      <h3>Preview</h3>
      <Panels tabs={tabs} views={views} activeTab="hub" />
    </div>
  );
};
