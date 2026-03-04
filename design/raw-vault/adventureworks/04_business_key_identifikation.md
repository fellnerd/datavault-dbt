# Business Key Identifikation - Leitfaden

## 🎯 Was ist ein Business Key?

### Definition nach Dan Linstedt (Data Vault 2.0):

> **Business Key** = Ein oder mehrere Attribute, die eine Entität **eindeutig** und **stabil** über **Zeit und Systeme hinweg** identifizieren.

### Die 5 Kriterien eines guten Business Keys:

| Kriterium | Beschreibung | Beispiel |
|-----------|--------------|----------|
| **1. Eindeutig** | Keine Duplikate erlaubt | Kundennummer, Produktnummer |
| **2. Stabil** | Ändert sich **niemals** | SSN, Email (schlecht!), Ausweisnummer |
| **3. Fachlich** | Kommt aus Business-Domäne | NICHT: Surrogate Keys wie IDENTITY |
| **4. Minimal** | So wenig Spalten wie möglich | Nicht: alle Attribute zusammen |
| **5. Natürlich** | Vom Quellsystem vergeben | NICHT: vom DWH generiert |

---

## 🔍 Single vs. Composite Business Keys

### Single Business Key (80% der Fälle)

**Definition:** Eine einzige Spalte identifiziert die Entität eindeutig

**Beispiele:**
| Entity | Business Key | Warum? |
|--------|--------------|--------|
| **customer** | CustomerID | System-generiert, stabil, eindeutig |
| **product** | ProductID | Produktnummer aus ERP |
| **employee** | EmployeeID / PersonalNummer | HR-System Key |
| **salesorder** | SalesOrderID / OrderNumber | Bestellnummer |

**Hash-Berechnung:**
```sql
hk_customer = SHA2_256(CustomerID)
```

---

### Composite Business Key (20% der Fälle)

**Definition:** Mehrere Spalten zusammen bilden die eindeutige Identifikation

#### 📌 Wann ist ein Composite Key notwendig?

| Szenario | Beispiel | Business Key |
|----------|----------|--------------|
| **Multi-Tenant System** | Kunde in mehreren Mandanten | `TenantID + CustomerID` |
| **Zeitbasierte IDs** | Order mit Jahr-Prefix | `Year + OrderNumber` |
| **Geografische Aufteilung** | Filial-spezifische Kunden | `BranchID + CustomerID` |
| **Legacy-Systeme** | Alte Systeme ohne zentrale IDs | `Region + CustomerNr` |
| **Source-Übergreifend** | Mehrere Quellen mit eigenen IDs | `SourceSystem + CustomerID` |

#### ⚠️ Wichtig: Composite Keys nur wenn WIRKLICH nötig!

**Schlechte Gründe:**
- ❌ "Zur Sicherheit" alle Spalten nehmen
- ❌ Technische IDs kombinieren (z.B. `CustomerID + ModifiedDate`)
- ❌ Unnötige Redundanz (z.B. `CustomerID + CustomerName`)

**Gute Gründe:**
- ✅ Das Quellsystem nutzt wirklich mehrere Spalten als PK
- ✅ Verschiedene Quellen haben überlappende IDs
- ✅ Multi-Tenant-Architektur erfordert es

---

## 🛠️ Methodik: Business Keys identifizieren

### Schritt 1: Quellsystem analysieren

```sql
-- Prüfe Primary Key in der Quelltabelle
SELECT 
    COLUMN_NAME,
    ORDINAL_POSITION
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'Customer' 
  AND CONSTRAINT_NAME LIKE 'PK_%'
ORDER BY ORDINAL_POSITION;
```

**Ergebnis für AdventureWorks Customer:**
```
COLUMN_NAME      | ORDINAL_POSITION
CustomerID       | 1
```
→ **Single Business Key!**

---

### Schritt 2: Eindeutigkeit prüfen

```sql
-- Prüfe auf Duplikate
SELECT 
    CustomerID,
    COUNT(*) AS cnt
FROM adventureworks.SalesLT.Customer
GROUP BY CustomerID
HAVING COUNT(*) > 1;
```

**Erwartung:** Keine Zeilen → Key ist eindeutig ✅

**Wenn Duplikate:** 
- ⚠️ Ist es wirklich ein Business Key?
- ⚠️ Gibt es eine zweite Spalte, die zusammen eindeutig ist?
- ⚠️ Ist die Quelle korrupt?

---

### Schritt 3: Stabilität prüfen

```sql
-- Prüfe ob Key jemals NULL ist
SELECT COUNT(*)
FROM adventureworks.SalesLT.Customer
WHERE CustomerID IS NULL;
```

**Erwartung:** 0 Zeilen → Key ist immer vorhanden ✅

---

### Schritt 4: Fachliche Bedeutung prüfen

**Frage an Business/Fachbereich:**
- "Wie identifizieren Sie einen Kunden eindeutig?"
- "Kann sich die Kundennummer ändern?"
- "Verwenden Sie diese Nummer auch in anderen Systemen?"

**Wenn Antworten unklar:**
- ⚠️ Dokumentiere die Entscheidung
- ⚠️ Bereite dich auf spätere Änderungen vor
- ✅ Verwende das, was die Quelle als PK nutzt

---

## 📊 AdventureWorks SalesLT: Business Key Analyse

### Customer (Ihr aktueller Fall)

```sql
-- Struktur prüfen
SELECT TOP 5 
    CustomerID,
    FirstName,
    LastName,
    EmailAddress
FROM ext_adventureworks_saleslt_customer;
```

**Analyse:**
| Spalte | Wert | Eindeutig? | Stabil? | Fachlich? |
|--------|------|------------|---------|-----------|
| CustomerID | INT (1-847) | ✅ JA | ✅ JA | ✅ JA |
| EmailAddress | String | ⚠️ Kann doppelt sein | ❌ NEIN | ❌ NEIN |
| FirstName + LastName | String | ❌ NEIN | ❌ NEIN | ❌ NEIN |

**✅ Entscheidung: CustomerID = Business Key**

**Hash-Berechnung:**
```sql
hk_customer = SHA2_256(CAST(CustomerID AS NVARCHAR(MAX)))
```

---

### Address (Nächster Hub)

**Analyse:**
```sql
SELECT TOP 5 
    AddressID,
    AddressLine1,
    City,
    PostalCode
FROM ext_adventureworks_saleslt_address;
```

**Kandidaten:**
| Option | Bewertung |
|--------|-----------|
| AddressID | ✅ **Business Key** (System-generiert, eindeutig, stabil) |
| AddressLine1 + City + PostalCode | ❌ NEIN (Duplikate möglich, nicht stabil) |

**✅ Entscheidung: AddressID = Business Key**

---

### Product (Komplexer Fall)

**Analyse:**
```sql
SELECT TOP 5 
    ProductID,
    ProductNumber,
    Name
FROM ext_adventureworks_saleslt_product;
```

**Kandidaten:**
| Option | Bewertung |
|--------|-----------|
| ProductID | ✅ Technisch eindeutig |
| ProductNumber | ✅ **Fachlich besser!** (z.B. "FR-R92B-58") |
| Name | ❌ NEIN (kann sich ändern, Duplikate möglich) |

**💡 Best Practice Entscheidung:**

**Wenn beides vorhanden (ID + Number):**

**Option A: ProductID verwenden**
- ✅ Einfacher (nur eine Spalte)
- ✅ Eindeutig garantiert
- ❌ Weniger fachlich

**Option B: ProductNumber verwenden**
- ✅ Fachlich (wird in Katalogen verwendet)
- ✅ System-übergreifend wiedererkennbar
- ⚠️ Muss eindeutig sein (prüfen!)

**Empfehlung für AdventureWorks:** **ProductNumber** (falls eindeutig, sonst ProductID)

**Prüfung:**
```sql
-- Sind ProductNumbers eindeutig?
SELECT ProductNumber, COUNT(*)
FROM ext_adventureworks_saleslt_product
GROUP BY ProductNumber
HAVING COUNT(*) > 1;
```

Wenn **keine Duplikate** → ProductNumber verwenden ✅

---

## 🎓 Composite Key Beispiel: CustomerAddress

### Analyse der Brücken-Tabelle

```sql
SELECT TOP 5 
    CustomerID,
    AddressID,
    AddressType
FROM ext_adventureworks_saleslt_customeraddress;
```

**Frage:** Was ist der Business Key?

**Antwort:** **Composite Key = CustomerID + AddressID**

**Warum?**
- ✅ Zusammen eindeutig (ein Kunde kann dieselbe Adresse nur einmal haben)
- ✅ Beide Spalten notwendig zur Identifikation
- ✅ Bildet M:N Beziehung ab

**Hash-Berechnung für Link:**
```sql
-- Einzelne Hub-Keys
hk_customer = SHA2_256(CustomerID)
hk_address = SHA2_256(AddressID)

-- Link Key (Composite)
hk_link_customer_address = SHA2_256(
    hk_customer + '||' + hk_address
)
```

**⚠️ Wichtig:** Im Link hashen wir **die Hub-Keys**, nicht die Business Keys direkt!

---

## 🎯 Praktische Checkliste: Business Key identifizieren

### Für jeden Hub:

- [ ] **1. Primary Key im Quellsystem finden**
  ```sql
  SELECT * FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = '...'
  ```

- [ ] **2. Eindeutigkeit prüfen**
  ```sql
  SELECT <key>, COUNT(*) FROM <table> GROUP BY <key> HAVING COUNT(*) > 1
  ```

- [ ] **3. NULL-Check**
  ```sql
  SELECT COUNT(*) FROM <table> WHERE <key> IS NULL
  ```

- [ ] **4. Fachliche Validierung**
  - Frage: "Wie identifiziert das Business diese Entität?"
  - Dokumentiere die Entscheidung im YAML

- [ ] **5. Multi-Source Check** (falls mehrere Quellen)
  - Gibt es überlappende IDs zwischen Systemen?
  - Dann: `SourceSystem + BusinessKey`

---

## 💡 Zusammenfassung für Ihren hub_customer

### Ihr Fall: AdventureWorks Customer

**Business Key:** `CustomerID` (INT)

**Begründung:**
- ✅ Primary Key im Quellsystem
- ✅ Eindeutig (keine Duplikate)
- ✅ Nie NULL
- ✅ Stabil (ändert sich nicht)
- ✅ System-generiert, aber fachlich akzeptiert

**Hash-Berechnung in Staging:**
```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    ISNULL(CAST(CustomerID AS NVARCHAR(MAX)), '')
), 2) AS hk_customer
```

**Composite Key:** ❌ NICHT notwendig, da CustomerID eindeutig

---

## 🚀 Nächster Schritt

Bereit, die **Staging View** zu erstellen?

Ich zeige Ihnen jetzt:
1. ✅ External Table prüfen
2. ✅ Staging View mit Hash-Keys erstellen
3. ✅ Validierung der Hash-Berechnung

**Fortfahren?** 🎯
