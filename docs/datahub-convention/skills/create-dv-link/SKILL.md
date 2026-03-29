# Create Data Vault Link

Creates a Link model connecting two or more Hubs, including the staging hash calculations, link model, optional link satellite, and documentation updates.

## When to Use

- Modeling a **relationship** between two or more business objects (Hubs)
- Creating a Dependent Child (DC) Link for entities without their own Business Key
- Creating a Hierarchy Link (parent-child within one Hub)
- Creating a Same-as Link (mapping identical entities from different sources)

## Prerequisites

- At least 2 Hubs already exist (except DC Link: only 1 parent Hub)
- Business Key columns of all participating Hubs are known
- Relationship cardinality is understood (always n:m in Data Vault)
- Source table containing the relationship is identified

## Step-by-Step Workflow

### 1. Determine Link Type

| Type | Use Case | Min. Hubs | Example |
|------|----------|-----------|---------|
| Standard | Relationship between entities | 2+ | `link_mitarbeiter_organisationseinheit` |
| DC Link | Entity without own BK | 1 (parent) | `link_contact_contractor` |
| Hierarchy | Parent-child same entity | 1 (self) | `link_organisationseinheit_hierarchy` |
| Same-as | Map identical entities | 1 (self) | `link_kunde_sameas` |

### 2. Update Staging View

Add link hash calculations to the existing staging view:

```yaml
hashed_columns:
  # Existing entity hash
  hk_<entity>:
    - <BK1>
  
  # NEW: Link Hash Key (all BKs from both hubs)
  hk_link_<hub1>_<hub2>:
    - <BK_HUB1_COL1>
    - <BK_HUB2_COL1>
  
  # NEW: FK to second Hub (if not already present)
  hk_<hub2>:
    - <BK_HUB2_COL1>
```

For DC Links:
```yaml
hashed_columns:
  hk_<parent>:
    - <PARENT_BK>
  hk_link_<dc>_<parent>:
    - <PARENT_BK>
    - <DCK_COL1>
    - <DCK_COL2>
  hd_<dc>_<parent>_dc:
    is_hashdiff: true
    columns:
      - <DCK_COL1>
      - <DCK_COL2>
      - <ADDITIONAL_ATTRS>
```

### 3. Create Link Model

File: `models/raw_vault/<concept>/links/link_<hub1>_<hub2>.sql`

**Standard Link:**
```sql
{%- set src_pk = 'hk_link_<hub1>_<hub2>' -%}
{%- set src_fk = ['hk_<hub1>', 'hk_<hub2>'] -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.link(src_pk=src_pk,
                    src_fk=src_fk,
                    src_ldts=src_ldts,
                    src_source=src_source,
                    source_model='<concept>_<entity>') }}
```

**DC Link (1 FK only):**
```sql
{%- set src_pk = 'hk_link_<dc>_<parent>' -%}
{%- set src_fk = 'hk_<parent>' -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.link(src_pk=src_pk,
                    src_fk=src_fk,
                    src_ldts=src_ldts,
                    src_source=src_source,
                    source_model='<concept>_<entity>') }}
```

### 4. Create Link Satellite (if needed)

For DC Links, create a DC Satellite with payload:
```sql
{%- set src_pk = 'hk_link_<dc>_<parent>' -%}
{%- set src_hashdiff = {
    'source_column': 'hd_<dc>_<parent>_dc',
    'alias': 'HASHDIFF'
} -%}
{%- set src_payload = ['<dck_col1>', '<attr1>'] -%}
{%- set src_extra_columns = ['dss_create_datetime'] -%}

{{ automate_dv.sat(src_pk=src_pk,
                   src_hashdiff=src_hashdiff,
                   src_payload=src_payload,
                   src_extra_columns=src_extra_columns,
                   src_ldts='dss_load_date',
                   src_source='dss_record_source',
                   source_model='<concept>_<entity>') }}
```

### 5. Update Documentation

- Schema YAML with tests (unique on LK HK, relationships on FKs)
- ER Diagram with relationship lines

## Validation Checklist

- [ ] Link connects at least 2 Hubs (except DC: 1)
- [ ] No Link-on-Link structures
- [ ] All FK hash keys calculated in staging
- [ ] Link HK includes ALL participating BK columns
- [ ] NULL FKs → Zero Key ('-1')
- [ ] Schema YAML with relationship tests
- [ ] ER Diagram updated

## Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Link HK not unique | Missing BK in hash | Alle BK-Spalten beider Hubs im Link HK |
| FK relationship test fails | Hub not yet loaded | Dependencies prüfen (+) |
| DC Link: 2 FKs | Falscher Link-Typ | DC Link hat nur 1 FK (parent) |

## References

- Confluence ITDATAH §2.2 (Link), §14 (Link-Modellierung)
- `references/link-types.md` - Link-Typen Übersicht
- `templates/link.sql` - Standard Link Template

---
name: create-dv-link
description: 'Creates Data Vault Link models connecting Hubs including staging updates, link satellite, and documentation. Use when modeling relationships between business objects. Keywords: link relationship dependent child hierarchy same-as automate_dv'
---
