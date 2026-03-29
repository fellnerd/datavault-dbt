# Link Types Reference (Confluence ITDATAH §2.2)

## Standard Link

**Verbindet 2+ Hubs** mit einer n:m Beziehung.

```
hub_A ──┐
        ├── link_A_B
hub_B ──┘
```

| Eigenschaft | Wert |
|-------------|------|
| Min. Hubs | 2 |
| Kardinalität | n:m |
| Hash Key | `HASH(BK_A || BK_B)` |
| FKs | `hk_A`, `hk_B` |
| Naming | `link_{hub1}_{hub2}` |

## Dependent Child (DC) Link

**Entity ohne eigenen Business Key** – identifiziert über Parent + DCK-Spalten.

```
hub_parent ──── link_dc_parent ──── sat_dc_parent_dc
                (HK = parent_BK + DCK)  (DCK + Attribute)
```

| Eigenschaft | Wert |
|-------------|------|
| Min. Hubs | 1 (nur Parent) |
| Hash Key | `HASH(parent_BK || dck1 || dck2)` |
| FKs | nur `hk_parent` |
| Satellite | PFLICHT – enthält DCK-Spalten |
| Naming | `link_{dc}_{parent}` |

**Wann DC verwenden:**
- Entity hat keinen stabilen eigenen Business Key
- Entity ist nur im Kontext des Parents sinnvoll
- Beispiele: Kontaktpersonen eines Unternehmens, Positionen einer Bestellung

## Hierarchy Link

**Parent-Child Beziehung** innerhalb eines Hubs.

```
hub_orgeinheit ──┐
                 ├── link_orgeinheit_hierarchy
hub_orgeinheit ──┘   (parent + child FK)
```

| Eigenschaft | Wert |
|-------------|------|
| Beteiligte Hubs | 1 (Self-Join) |
| FKs | `hk_<entity>_parent`, `hk_<entity>_child` |
| Hash Key | `HASH(parent_BK || child_BK)` |
| Naming | `link_{hub}_hierarchy` |

**Staging:**
```yaml
hashed_columns:
  hk_<entity>_parent:
    - <PARENT_BK_COL>
  hk_<entity>_child:
    - <CHILD_BK_COL>
  hk_link_<entity>_hierarchy:
    - <PARENT_BK_COL>
    - <CHILD_BK_COL>
```

## Same-as Link

**Verknüpft gleiche Geschäftsobjekte** aus verschiedenen Quellen (Key-Mapping).

```
hub_kunde ──┐
            ├── link_kunde_sameas
hub_kunde ──┘   (source1_BK ↔ source2_BK)
```

| Eigenschaft | Wert |
|-------------|------|
| Beteiligte Hubs | 1 (Self-Join, verschiedene Quellen) |
| Hash Key | `HASH(master_BK || duplicate_BK)` |
| Naming | `link_{hub}_sameas` |
| Satellite | Optional – kann Konfidenz-Score enthalten |

## Vergleichstabelle

| Aspekt | Standard | DC | Hierarchy | Same-as |
|--------|----------|-----|-----------|---------|
| Min. Hubs | 2+ | 1 | 1 (self) | 1 (self) |
| Macro | `link()` | `link()` | `link()` | `link()` |
| src_fk | Array (2+) | String (1) | Array (2) | Array (2) |
| Satellite | Optional | PFLICHT | Optional | Optional |
| Use Case | Beziehung | Kein eigener BK | Parent-Child | Key-Mapping |
