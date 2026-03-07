# Data Vault 2.0 Analyse: AdventureWorks SalesLT

## 📋 Schritt 1: Business Keys identifizieren

> **Regel:** Ein Hub = Ein stabiler Business Key = Eine fachliche Entität

### Identifizierte Entities (Kandidaten für Hubs):

| Entity | Business Key | Grund | Hub-Name |
|--------|--------------|-------|----------|
| **customer** | CustomerID | Eindeutige Kundennummer, stabil | `hub_customer` |
| **address** | AddressID | Eindeutige Adress-ID | `hub_address` |
| **product** | ProductID | Eindeutige Produktnummer | `hub_product` |
| **productcategory** | ProductCategoryID | Kategorien sind stabile Entitäten | `hub_productcategory` |
| **salesorderheader** | SalesOrderID | Bestellnummer = Business Key | `hub_salesorder` |

### ⚠️ Keine Hubs für:

| Entity | Warum KEIN Hub? | Alternative |
|--------|-----------------|-------------|
| **customeraddress** | Composite Key (CustomerID + AddressID), keine eigene Identität | **Link** `link_customer_address` |
| **salesorderdetail** | Composite Key (SalesOrderID + SalesOrderDetailID), Teil einer Order | **Dependent Child** über Link oder **Transaction Link** |
| **productmodel** | Existiert nur als Gruppierung von Produkten, kein eigenständiges Business Object | **Satellite-Attribut** auf `sat_product` |
| **productdescription** | Surrogate Key, keine eigenständige Entity, nur Content | **Multi-Active Satellite** `sat_product_description_ma` (CDK: Culture) |
| **productmodelproductdescription** | M:N Beziehung, Composite Key | Entfällt durch MA Satellite |

---

## 📋 Schritt 2: Beziehungen klassifizieren

### Kategorisierung nach Data Vault Pattern:

#### 🔗 Links (Many-to-Many oder Many-to-One mit eigenen Attributen)

| Beziehung | Typ | Link-Name | Business Key |
|-----------|-----|-----------|--------------|
| customer ↔ address | M:N via customeraddress | `link_customer_address` | CustomerID + AddressID |
| salesorder → customer | M:1 | `link_salesorder_customer` | SalesOrderID + CustomerID |
| salesorder → address (ship) | M:1 | `link_salesorder_address_ship` | SalesOrderID + ShipToAddressID |
| salesorder → address (bill) | M:1 | `link_salesorder_address_bill` | SalesOrderID + BillToAddressID |
| product → productcategory | M:1 | `link_product_category` | ProductID + ProductCategoryID |

#### 🧩 Dependent Children (Entity ohne eigenen stabilen BK)

| Entity | Parent | DCK (Dependent Child Keys) | Pattern |
|--------|--------|----------------------------|---------|
| **salesorderdetail** | salesorderheader | SalesOrderDetailID (Line Number) | DC über Link oder Transaction Link |

**Warum DC?** SalesOrderDetailID ist nur ein Zeilenzähler innerhalb einer Order, kein eigenständiger Business Key.

---

## 📋 Schritt 3: Attribute zu Satellites zuordnen

### Prinzip: **Trennung nach Thema und Änderungsfrequenz**

#### Hub: customer → Satellites

| Satellite | Attribute | Grund |
|-----------|-----------|-------|
| `sat_customer` | FirstName, LastName, MiddleName, Title, Suffix, NameStyle | Stammdaten (selten geändert) |
| `sat_customer_contact` | EmailAddress, Phone | Kontaktdaten (häufiger geändert) |
| `sat_customer_company` | CompanyName, SalesPerson | Unternehmensbezogene Daten |
| `sat_customer_auth` | PasswordHash, PasswordSalt | Sicherheitsrelevant, isoliert |

**🎯 Lernpunkt:** Ein Hub kann **mehrere Satellites** haben, je nach Thema!

#### Hub: address → Satellites

| Satellite | Attribute | Grund |
|-----------|-----------|-------|
| `sat_address` | AddressLine1, AddressLine2, City, StateProvince, CountryRegion, PostalCode | Alle Adressattribute ändern sich gemeinsam |

#### Hub: product → Satellites

| Satellite | Attribute | Grund |
|-----------|-----------|-------|
| `sat_product` | Name, ProductNumber, Color, Size, Weight, ProductModelID, ProductModelName | Produktstammdaten (inkl. Model als Attribut) |
| `sat_product_pricing` | StandardCost, ListPrice | Preise ändern sich häufiger |
| `sat_product_lifecycle` | SellStartDate, SellEndDate, DiscontinuedDate | Lebenszyklus-Tracking |
| `sat_product_media` | ThumbNailPhoto, ThumbnailPhotoFileName | Binärdaten, separat wegen Größe |
| `sat_product_description_ma` | Description (CDK: Culture) | Multi-Active: Mehrsprachige Beschreibungen gleichzeitig gültig |

#### Link: link_customer_address → Link Satellite

| Link Satellite | Attribute | Grund |
|----------------|-----------|-------|
| `lsat_customer_address` | AddressType | Kontext der Beziehung (Main, Shipping, Billing) |

#### Hub: salesorderheader → Satellites

| Satellite | Attribute | Grund |
|-----------|-----------|-------|
| `sat_salesorder` | RevisionNumber, OrderDate, DueDate, ShipDate, Status, OnlineOrderFlag, SalesOrderNumber, PurchaseOrderNumber, AccountNumber, ShipMethod | Bestellattribute |
| `sat_salesorder_payment` | CreditCardApprovalCode | Zahlungsinformationen |
| `sat_salesorder_totals` | SubTotal, TaxAmt, Freight, TotalDue | Berechnete Summen |
| `sat_salesorder_comment` | Comment | Frei-Text, kann NULL sein |

---

## 📋 Schritt 4: Hierarchien & Self-References

### productcategory: Selbstreferenzierende Hierarchie

| Entity | Business Key | Hierarchie | Pattern |
|--------|--------------|------------|---------|
| productcategory | ProductCategoryID | ParentProductCategoryID | **Same-As Link** |

**Lösung:** `link_productcategory_parent`

```
hub_productcategory
       ↓
link_productcategory_parent (hk_category_child + hk_category_parent)
```

---

## 📋 Schritt 5: Reference Tables

### Kandidaten für Reference Tables:

| Kandidat | Warum? | Lösung |
|----------|--------|--------|
| **Status-Werte** | Enum-artige Werte (z.B. salesorderheader.Status: 1-5) | `ref_salesorder_status` |
| **AddressType** | Main, Shipping, Billing | `ref_address_type` |
| **Culture** | en-US, de-DE etc. | `ref_culture` |

**⚠️ Nicht als Hub!** Reference Tables haben keine Historie und sind stabile Lookup-Werte.

---

## 🎯 Zusammenfassung: Zu erstellende Data Vault Objekte

### Hubs (5)
- ✅ `hub_customer`
- ✅ `hub_address`
- ✅ `hub_product`
- ✅ `hub_productcategory`
- ✅ `hub_salesorder`

### Links (6)
- ✅ `link_customer_address`
- ✅ `link_salesorder_customer`
- ✅ `link_salesorder_address_ship`
- ✅ `link_salesorder_address_bill`
- ✅ `link_product_category`
- ✅ `link_productcategory_parent` (Same-As Link)

### Satellites (13)
- ✅ `sat_customer`
- ✅ `sat_customer_contact`
- ✅ `sat_customer_company`
- ✅ `sat_customer_auth`
- ✅ `sat_address`
- ✅ `sat_product` (inkl. ProductModelID als Attribut)
- ✅ `sat_product_pricing`
- ✅ `sat_product_lifecycle`
- ✅ `sat_product_media`
- ✅ `sat_product_description_ma` (Multi-Active: Culture als CDK)
- ✅ `sat_productcategory`
- ✅ `sat_salesorder`
- ✅ `sat_salesorder_payment`
- ✅ `sat_salesorder_totals`
- ✅ `sat_salesorder_comment`

### Link Satellites (1)
- ✅ `lsat_customer_address`

### Dependent Child (1)
- ✅ `link_salesorderdetail` + `sat_salesorderdetail_dc`

### Reference Tables (3)
- ✅ `ref_salesorder_status`
- ✅ `ref_address_type`
- ✅ `ref_culture`

---

## 📚 Nächste Schritte

1. ✅ **Phase 1: Analyse** (dieses Dokument)
2. ⏭️ **Phase 2: Priorisierung** → Welche Objekte zuerst?
3. ⏭️ **Phase 3: Staging vorbereiten** → Hash-Berechnungen
4. ⏭️ **Phase 4: Raw Vault implementieren** → dbt Models
5. ⏭️ **Phase 5: Tests & Validierung**

---

## 🎓 Lernziele erreicht?

- ☑️ Business Keys identifiziert
- ☑️ Links vs. Hubs unterschieden
- ☑️ Dependent Children erkannt
- ☑️ Satellites thematisch gruppiert
- ☑️ Reference Tables erkannt
- ☑️ Hierarchien modelliert

**Bereit für Phase 2?** → Priorisierung & Implementierungsplan
