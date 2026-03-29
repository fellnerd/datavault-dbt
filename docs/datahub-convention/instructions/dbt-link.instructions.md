---
applyTo: '**/links/**'
---
# Link Models – dbt Data Vault (Confluence ITDATAH §2.2)

> Diese Regeln gelten automatisch für alle Dateien unter `**/links/`.

## Zweck
Ein Link beschreibt **Beziehungen** zwischen Geschäftsobjekten. Er verbindet mindestens 2 Hubs.

## Standard Link – automate_dv.link()

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

## Link-Regeln (Confluence §2.2)

1. Verbindet **mindestens 2 Hubs** (keine "peg-leg links")
2. Immer **n:m Beziehungen** (flexibel erweiterbar)
3. **Keine Links zwischen Links** (kein Link-on-Link)
4. Optional: **Dependent Child** Spalten zur Erweiterung
5. **Insert-Only** – keine Updates

## Link-Typen (Confluence §2.2)

| Typ | Pattern | Beschreibung |
|-----|---------|-------------|
| Standard Link | `link_{hub1}_{hub2}` | Beziehung zwischen 2+ Hubs |
| Same-as Link | `link_{hub}_sameas` | Verknüpft gleiche Geschäftsobjekte (Mapping) |
| Hierarchy Link | `link_{hub}_hierarchy` | Parent-Child innerhalb eines Hubs |
| DC Link | `link_{dc}_{parent}` | Dependent Child – nur 1 FK (parent Hub) |
| Business Link | `link_{hub1}_{hub2}` | Wie Raw Link, in Business Vault |

### DC Link Pattern (nur 1 FK)

```sql
{%- set src_pk = 'hk_link_<dc>_<parent>' -%}
{%- set src_fk = 'hk_<parent>' -%}       {# Nur parent FK, kein zweiter Hub #}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}
{# KEIN src_payload für DC Links! #}
```

### Hierarchy Link Pattern

```sql
{%- set src_pk = 'hk_link_<entity>_hierarchy' -%}
{%- set src_fk = ['hk_<entity>_parent', 'hk_<entity>_child'] -%}
```

## Aufbau (Confluence §2.2 + §6)

```
hk_{link}            CHAR(64)       - Link Hash Key (PK)
hk_{hub_1}           CHAR(64)       - FK zum Hub 1
...
hk_{hub_n}           CHAR(64)       - FK zum Hub n
[dependent_child]                    - Optional: DC-Spalten
dss_load_date        DATETIME2(7)   - Beladungs-Timestamp
dss_record_source    NVARCHAR(255)  - Quellenidentifikation
```

## Staging-Voraussetzungen

Alle Link-Hashes müssen in der **Staging View** berechnet werden:

```yaml
hashed_columns:
  hk_link_<hub1>_<hub2>:       # Link Hash Key
    - <BK_HUB1_COL1>
    - <BK_HUB2_COL1>
  hk_<hub1>:                    # FK Hub 1
    - <BK_HUB1_COL1>
  hk_<hub2>:                    # FK Hub 2
    - <BK_HUB2_COL1>
```

## Naming (Confluence §5)

| Typ | Pattern | Beispiel |
|-----|---------|---------|
| Standard | `link_{hub1}_{hub2}` | `link_mitarbeiter_organisationseinheit` |
| Hierarchy | `link_{hub}_hierarchy` | `link_organisationseinheit_hierarchy` |
| Same-as | `link_{hub}_sameas` | `link_kunde_sameas` |

## NULL Business Keys → Zero Key

Wenn ein FK in einer Link-Beziehung NULL ist:
- Hash Key → Zero Key (`'-1'`)
- Referenziert den Ghost Record im Hub

## Modellierung-Checkliste (Confluence §14)

1. ☐ Beziehungen im Vorsystem identifiziert (SME hinzuziehen)
2. ☐ Kardinalität festgestellt
3. ☐ NULL Business Keys → Zero Key behandelt
4. ☐ Dependent Child Keys bei Bedarf definiert
5. ☐ Mindestens 2 Geschäftsobjekte im Link
6. ☐ Keine Link-on-Link Strukturen
7. ☐ DISTINCT statt neuer Link wenn weniger Objekte nötig
