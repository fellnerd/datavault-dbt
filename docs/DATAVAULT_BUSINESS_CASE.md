# Data Vault 2.1 Analytics Plattform

## Folie 1: Titelblatt

* **Haupttitel:** DATA VAULT ANALYTICS PLATTFORM
* **Untertitel / System:** Data Vault Analytics Plattform (Zentrale Analyse- und Reportingplattform)
* **Präsentationsdatum:** 2026-05-20
* **Dokumenten-ID / Version:** DataVault_Analytics_Plattform_20260520

---

## Folie 2: Bestehende Architektur & Problemstellung (Ist-Zustand)

### System- und Datenbanklandschaft
* Schnittstellen bestehen als direkte Point-to-Point-Verbindungen zwischen den einzelnen Systemen, Applikationen und Datenbanken.

### Auswirkungen redundanter Point-to-Point-Datenschnittstellen

#### Ressourcen / Durchlaufzeit
* Es besteht eine geringe Wiederverwendbarkeit der Schnittstellenfunktionalität.
* Dies führt zu signifikanten Mehraufwänden und Mehrkosten in der Entwicklung und im Betrieb.

#### Entwicklung
* Es entstehen Mehrfachaufwände bei der Definition von Anforderungen (Requirements Engineering).
* Ein breites, fragmentiertes Technologie-Know-how ist über die verschiedenen Quellsysteme hinweg erforderlich.
* Die Erzielung von Skaleneffekten (Economy of Scale) ist stark eingeschränkt.
* Es resultiert eine lange Time-to-Market von der Anforderung bis zur produktiven Bereitstellung.
* Es zeigen sich gravierende, weitreichende Auswirkungen bei strukturellen Quellsystemänderungen.

#### Betrieb (Operations)
* Es liegt eine hohe und schwer zu kontrollierende Schnittstellenanzahl vor.
* Der laufende Betrieb gestaltet sich äußerst komplex.
* Es besteht ein erhöhtes System-Ausfallsrisiko.
* Es entstehen dauerhaft erhöhte Betriebskosten.

#### Data Governance / Qualität
* Die Umsetzung einer strukturierten Data Governance ist extrem komplex.
* Es liegt eine unübersichtliche und komplexe Data Lineage vor.
* Es kommt zu unterschiedlichen Reporting-Ergebnissen in den Fachbereichen (keine gemeinsame Wahrheit).
* Es resultiert eine verringerte Datenqualität, wodurch mehrfache, dezentrale Bereinigungen notwendig werden.
* Es müssen kontinuierlich hohe Mehraufwände zur nachträglichen Verbesserung der Datenqualität aufgewendet werden.

### Visuelles Fallbeispiel für Daten-Inkonsistenz (Inkonsistente Daten / Zeitliche Inkonsistenz)
* **Szenario:** Punkt-zu-Punkt-Verbindungen verteilen Stammdaten (z.B. Kunde: Hr. Maier) asynchron über die Systeme A, B, C und D sowie externe Quellen und DBs.
* **System A / Datenstrom 1 (Zeitstempel: 08:01):** Kontaktdaten, Zählerdaten -> Verbrauch: 1.350 kWh, Telefon: 0463/112233.
* **System A / Datenstrom 2 (Zeitstempel: 13:22):** Kontaktdaten, Zählerdaten -> Verbrauch: 1.450 kWh, Telefon: 0423/112233.
* **Resultat:** Business-User arbeiten auf Basis manueller Schnittstellen (z.B. CSV-Imports) oder automatischer, ungepufferter Schnittstellen mit zeitlich und inhaltlich korrupten Datensätzen.
* **Kostenfaktor:** Hohe finanzielle Aufwände für Entwickler (Development) und den Betrieb (Operations).

---

## Folie 3: Inhalt & Ziele der zentralen Plattform

### Definition der Data Vault Analytics Plattform
* Die Data Vault Analytics Plattform ist die zentrale Datenintegrations- und Analyseplattform für alle dispositiven Datenströme.
* Sie fungiert als das zentrale Core-Data-Warehouse (DWH) innerhalb der gesamten Unternehmensarchitektur.

### Technische Kernfunktion
* Bereitstellung einer zentralen Plattform zur Konsolidierung und Optimierung von Schnittstellen und Datenflüssen.
* Aufbau einer einheitlichen Datenbasis für qualitativ hochwertige, konsistente und performante Reports und Analysen.

### Strategischer Nutzen der Plattform (Business Value)
* **Schnittstellen-Optimierung:** Effiziente Optimierung der Datenflüsse durch den gezielten und konsequenten Abbau redundanter Point-to-Point-Schnittstellen.
* **Single Source of Truth (SSoT):** Schaffung einer gemeinsamen datentechnischen Wahrheit und dadurch Gewährleistung konsistenter Reporting-Ergebnisse mit signifikant erhöhter Datenqualität.
* **Data Governance & Operations:** Etablierung einer vereinfachten Data Governance, spürbare Erhöhung des Automatisierungsgrads aller Datenintegrationsprozesse sowie eine Optimierung des Systembetriebs durch niedrigere Komplexität, ein geringeres Ausfallsrisiko und ein effektiveres, zentrales Monitoring.
* **Time-to-Market:** Schnellere Reaktionszeiten von der fachlichen Anforderung bis zur technischen Realisierung durch die durchgängig hohe Wiederverwendbarkeit von Core-Schnittstellen und Information Marts.
* **Zentralisiertes Domänen-Reporting:** Realisierung und Unterstützung eines übergreifenden Enterprise-Reportings unter anderem in den geschäftskritischen Datendomänen:
    * Finanzbuchhaltung (Hauptbuch, Kreditoren, Belege, Budget/Forecast).
    * Projektcontrolling (Projekte, Projektteile, Stundenerfassung, Kostenstellen).
    * Customer Relationship Management (Kundenstammdaten, Verträge, Adressen).
    * Telekommunikation (Mobilverträge, MSISDN/SIM, Call Detail Records, Datenvolumen).
    * Stammdaten-Referenzen (Konto, Kostenstelle, Abteilung, Projektkategorisierung).

### Architektur-Schichten im Überblick (Quellen zu Senken)
1.  **Reporting & Analyse (Frontend):** Power BI als zentrales BI-Frontend (Semantic Model auf den Information Marts).
2.  **Zielsysteme / Cloud-Infrastruktur:** Azure SQL Database, Azure Data Lake Storage Gen2 (ADLS), Azure Data Factory (ADF).
3.  **Integrationsschicht (Core):** Data Vault Analytics Plattform auf Azure SQL, gesteuert über **dbt** (data build tool) als deklaratives ELT-Framework mit Git-Versionierung, automatisiertem Lineage und 589 automatisierten Daten-Tests. Code-Generierung der Vault-Strukturen über das Package **automate_dv**.
4.  **Quellsysteme (Sources):** Abacus ERP (Finanzbuchhaltung, Projektcontrolling, Stammdaten — Parquet-Export via ADF), Compax (CRM / Vertragsmanagement), Telecom-CDR-Plattform (Call Detail Records, Datenvolumen).

---

## Folie 4: Architektur-Zwischentitel
* **Themenbereich:** ARCHITEKTUR
* **Systemkomponente:** Data Vault Analytics Plattform

---

## Folie 5: Data Vault Analytics Plattform — Architektur-Übersicht (Schichtenmodell)

### Grundprinzip
* Die Data Vault Analytics Plattform ist eine zentrale Plattform, die Daten aus verschiedenen Quellen systematisch sammelt, integriert und für konsumierende Systeme bereitstellt.
* Er ist streng in einem Schichtmodell organisiert, wobei jede einzelne Schicht einem dedizierten technischen Zweck folgt und einen spezifischen architektonischen Nutzen stiftet.

### Modellierungs- und Speicherstrukturen
* Innerhalb der Plattform befinden sich verschiedene, aufeinander abgestimmte Datenmodelle und Datenstrukturen.
* **Core:** Ein physischer Data Vault Core.
* **Marts:** Ein nachgelagertes Data Warehouse (DWH), das sowohl virtuell als auch persistent einer klassischen dimensionalen Modellierung folgt (Sternschemen / Star-Schemas).

### Datenverteilungs-Hub
* Er dient als zentraler Anlaufpunkt für die gesamte Verwaltung, Historisierung und Verteilung von Daten im Unternehmen.
* Durch seine Verwendung können Daten effizient, performant und absolut sicher verwaltet und an nachgelagerte Systeme konsistent und datenqualitativ hochwertig verteilt werden.

---

## Folie 6: Spezifikation der Architektur-Schichten

### 1. Staging-Schicht (Loading Data Layer)
* In der Staging-Schicht werden die Rohdaten aus den verschiedenen Quellsystemen für die kontrollierte Beladung in die nachgelagerte DWH-Kernschicht aufbereitet.
* Die Quellsysteme liefern ihre Daten als **Parquet-Files** in den Azure Data Lake Storage (ADLS), die Beladung erfolgt über **Azure Data Factory (ADF)** Pipelines (delta-basiert, inkrementell).
* Auf den Parquet-Files werden **External Tables** in Azure SQL definiert (`stg.ext_*`) — die Daten bleiben physisch im Data Lake, werden aber wie reguläre Tabellen abfragbar.
* Darauf aufbauend werden **dbt Staging-Views** (`stg.*`) bereitgestellt, die quellnah modellieren und um technische Metadaten (Hash-Keys, Hash-Diffs, Load-Timestamps, Record-Source) ergänzen — die direkte, transiente Vorbereitungsschicht für die Beladung des Raw Vaults.
* Es werden ausschliesslich technisch notwendige Transformationen vorgenommen (Datentyp-Anpassungen, Auflösen komplexer Strukturen) — keine fachliche Logik.

### 2. Data Vault Schicht (DWH Core)
* Im Data Vault bilden der Raw Vault bzw. der Business Vault den unumstößlichen *Single Point of Facts* in der Gesamtarchitektur.
* Hier werden alle Daten in einer vollständig konsolidierten, leicht erweiterbaren und lückenlos historisierten Form gespeichert.
* Diese Schicht wird konsequent nach der Data Vault 2.0/2.1-Methodik (Dan Lindstedt) modelliert, um maximale Agilität und Skalierbarkeit zu gewährleisten.

#### Raw Vault
* Im Raw Vault werden die Daten strukturell ähnlich den Vorsystemstrukturen in ein standardisiertes Data Vault Datenmodell (Hubs, Links, Satelliten) integriert.
* Es werden ausschließlich *Hard Rules* angewendet.
* Es werden Datentyp-Anpassungen vorgenommen, notwendige (De-)Normalisierungen durchgeführt, Systemfelder hinzugefügt und die Daten exakt nach der modellierten Kern-Struktur aufgeteilt, um eine systemübergreifende Datenintegration zu ermöglichen.

#### Business Vault
* Im Business Vault werden die sogenannten *Soft Rules* umgesetzt. Dies sind Regeln, welche Daten inhaltlich verändern oder fachlich interpretieren.
* Durch die gezielte Implementierung von Business-Logik werden rohe Daten strukturiert in werthaltige Informationen transformiert.
* Typische Aufgaben in dieser Schicht: Zusammenführung korrespondierender Felder, Standardisierung von Formaten (z.B. Adressdaten), Durchführung komplexer Berechnungen, Ersetzung oder Veränderung von Werten sowie die systemübergreifende Datenkonsolidierung.

### 4. Data Vault Analytics Plattform — Zugriffsschicht (Persistent und Virtuell)

#### Mart-Vorbereitungsschicht
* Persistente Hilfsobjekte (z.B. PIT/Bridge-Tabellen oder Current-Views `sat_*_current_v`) zur optimalen, performanten Beladung der finalen Information Marts.

#### Information Marts
* Dient als zentrale, hochperformante Zugriffsschicht für nachgelagerte BI-Systeme und Endanwender (Power BI Semantic Model).
* Beinhaltet die fachlich geschnittenen Information Marts, welche die dedizierte Business-Information halten.
* Diese werden standardmäßig dimensional als performante Sternschemen (Star-Schemas) modelliert.
* Ausnahmen von der dimensionalen Struktur bilden hochspezialisierte, rein virtuelle Zugriffsobjekte (Views), die für Echtzeitanalysen direkt auf den Data Vault Core zugreifen.

---

## Folie 7: Warum Data Vault 2.0 / 2.1? (Evaluierung & Best Practices)

### Definition
* Unter Data Vault 2.0/2.1 versteht man eine moderne Datenintegrations- und Datenmodellierungstechnik, die speziell für den Aufbau hochgradig skalierbarer und agiler Data Warehouses (DWH) entwickelt wurde.

### Wann wird eine Data Vault Modellierung dringend empfohlen?
* In BI-Projekten mit sehr hoher Agilität und Dynamik.
* Bei großen, unternehmensweiten Enterprise-DWH-Projekten.
* Wenn eine kontinuierlich hohe Anzahl an dezentralen Datenmodell-Erweiterungen zu erwarten ist.
* Bei Data Warehouses, die Daten aus vielen heterogenen Quellsystemen konsolidieren müssen.
* Bei sich stetig verändernden und wechselnden Benutzeranforderungen im Reporting.
* **Wichtige Grundvoraussetzung:** Die gemeinsame, stringente Implementierung eines DWH-Automatisierungstools bzw. eines ELT-Code-Generators, um den manuellen Entwicklungsaufwand zu eliminieren — in dieser Plattform: **dbt** (data build tool) mit dem Package **automate_dv** für die Generierung der Vault-Strukturen (Hubs, Satellites, Links), Git-Versionierung und automatisiertem Lineage-Graph.

### Modellierungs-Strategien im Vergleich

#### Datengetriebene Modellierung (Data Vault 2.1 Bevorzugt)
* Das Core-Datenmodell wird primär aus den Strukturen der Quellsysteme abgeleitet.
* Wird erfolgreich eingesetzt, wenn die konkreten analytischen Anforderungen der Fachbereiche an das DWH initial noch unklar oder nur iterativ/ansatzweise vorhanden sind.
* Die fachlichen Anforderungen können flexibel und agil Schritt für Schritt aufgenommen und im Modell umgesetzt werden.
* *Nachteil bei rein datengetriebener Strategie:* Das Core-Modell muss additiv erweitert werden, sobald sich ein Quellsystem strukturell ändert. Die DV2.1-Methodik ist jedoch genau darauf ausgelegt.

#### Anforderungsgetriebene Modellierung (Klassisch)
* Das Datenmodell wird direkt aus den bekannten analytischen Fachbereichs-Anforderungen abgeleitet (z.B. Relational nach Inmon oder Dimensional nach Kimball).

### Stärken & Mehrwert von Data Vault
* **Agilität:** Die Fähigkeit, extrem schnell auf sich ändernde Geschäftsanforderungen zu reagieren (einfache, regressionsfreie Erweiterbarkeit des Modells).
* **Quellsystem-Integration:** Nahtlose und problemlose Integration vollkommen unterschiedlicher Datenquellen.
* **Performance & ETL:** Ermöglicht das performante, parallele Laden von Daten aus verschiedenen Quellen über stark vereinfachte ETL-Muster.
* **Skalierbarkeit:** Hervorragende Fähigkeit, das Modell volumen- und strukturseitig beliebig zu skalieren.
* **Wartbarkeit:** Äußerst leichte Wartbarkeit der Plattform, da im Core standardmäßig nur neue Funktionen und Tabellen hinzugefügt, bestehende Strukturen jedoch niemals verändert werden müssen.
* **Testing:** Ermöglicht die Durchführung einfacher, automatisierbarer Regressionstests.
* **Historie:** Gewährleistet eine vollständige, lückenlose Historisierung aller Attribute über die Zeit.

### Schwächen & Nachteile (und deren architektonische Kompensation)
* **Komplexität im Core:** Es entsteht ein komplexes Datenmodell mit einer technisch sehr hohen Anzahl an Datenbankobjekten (Tabellen, Views, Stored Procedures).
* **Architektur-Overhead:** Generell komplexere Architektur im Vergleich zu zweistufigen Systemen.
* **Modellierungsaufwand:** Generell höherer initialer Modellierungsaufwand.
* **Übersicht:** Ohne automatisierte Werkzeuge ist es schwierig, manuell den vollständigen Überblick über alle Entitäten zu behalten.
* **Join-Overhead & Query-Performance:** Es sind deutlich mehr Joins zur Datenabfrage erforderlich, woraus eine geringere Abfrageleistung direkt auf dem Core-Modell resultiert.
* *Gegenmaßnahme / Empfehlung:* Direkte Abfragen auf den Core verhindern! Zur Datenbereitstellung müssen zwingend vordefinierte Ableitungen, optimierte Hilfstabellen (PIT-Tabellen) bzw. dimensionale Information Marts genutzt werden.

---

## Folie 8: Praxisbeispiel Abacus FIBU – Ingestion (Staging)

### Quellsysteme / Source-Ebene
* Als operatives System dient die **Abacus ERP**-Finanzbuchhaltung. Die Daten werden vom Quellsystem als **Parquet-Dateien** in das **Azure Data Lake Storage Gen2 (ADLS)** exportiert.
* **Extrahierte Parquet-Dateien (Auszug):**
    * `FIBU.FHE.Main.*.parquet` (Buchungskopf / Hauptbuch-Einträge)
    * `FIBU.KSA.Main.*.parquet` (Kontensaldo / Konten-Stammdaten)
    * `KRED.KBL.Main.*.parquet` (Kreditorenbelege)
    * `KRED.ZAH.Main.*.parquet` (Zahlungen)
    * `PROJ.NSA.Main.*.parquet` (Projekte und Projektstrukturen)
    * `PROJ.KSA.Main.*.parquet` (Projekt-Sachkontenbezug)

### Staging-Verarbeitung
1.  **External Tables:** Auf den Parquet-Files werden External Tables (`stg.ext_ewb_*`) in Azure SQL definiert — die Daten bleiben physisch im Data Lake, sind aber wie reguläre Tabellen abfragbar.
2.  **dbt Staging-Views:** Über das `automate_dv.stage()`-Macro werden Staging-Views (`stg.ewb_*`) generiert, die die Daten quellnah modellieren. Technische Metadaten (Hash-Keys, Hash-Diffs, Load-Timestamps, Record-Source) werden hier berechnet.
3.  **ADF Pipeline:** Die Beladung läuft über **Azure Data Factory** Pipelines (delta-basiert, inkrementell — täglicher Lauf).

---

## Folie 9: Praxisbeispiel Abacus FIBU – Core-Modellierung (Data Vault)

### Raw Vault (Strikte Trennung nach Entitätstypen)

#### Hubs (Zentrale Geschäftsschlüssel / Business Keys)
* `hub_hauptbuch`: Hält die eindeutigen Hauptbuch-Buchungsschlüssel.
* `hub_buchungskopf`: Hält die eindeutigen Buchungskopf-Schlüssel (Belegnummern).
* `hub_konto`: Hält die eindeutigen Konten-Schlüssel (Kontenplan).
* `hub_kreditor`: Hält die eindeutigen Kreditoren-Schlüssel.
* `hub_kreditorenbeleg`: Hält die eindeutigen Kreditorenbeleg-Nummern.
* `hub_kostenstelle`: Hält die eindeutigen Kostenstellen-Schlüssel.
* `hub_projekt`, `hub_projektteil`, `hub_projektsachkonto`: Hält die Projekt-Strukturschlüssel.
* `hub_zahlung`: Hält die eindeutigen Zahlungsschlüssel.

#### Links (Abbildung von Beziehungen)
* `link_hauptbuch_buchungskopf`: Verknüpft Hauptbuch-Buchungen mit ihrem Buchungskopf.
* `link_hauptbuch_konto`: Verknüpft Hauptbuch-Buchungen mit dem bebuchten Konto.
* `link_hauptbuch_kreditor`: Verknüpft Hauptbuch-Buchungen mit dem zugehörigen Kreditor.
* `link_hauptbuch_kostenstelle`: Verknüpft Hauptbuch-Buchungen mit der Kostenstelle.
* `link_hauptbuch_projekt`: Verknüpft Hauptbuch-Buchungen mit Projekten (Cross-Domain: Finance ↔ Projekt).
* `link_kreditorenbeleg_kreditor`: Verknüpft Belege mit ihren Kreditoren.
* `link_kreditorenbeleg_zahlung`: Verknüpft Belege mit Zahlungen.
* `link_projektteil_projekt`, `link_projektsachkonto_projekt`: Bildet die Projekt-Strukturhierarchie ab.

#### Satelliten (Deskriptive Kontexte & Historisierung)
* `sat_hauptbuch__abacus` (Buchungsdetails: Betrag, Buchungsdatum, Buchungstext).
* `sat_buchungskopf__abacus` (Belegkopf-Attribute: Belegart, Erfassungsdatum, Status).
* `sat_kreditor__abacus` (Kreditoren-Stammdaten: Name, Zahlungskonditionen).
* `sat_kreditorenbeleg__abacus` (Belegattribute: Betrag, Fälligkeit, Belegart).
* `sat_zahlung__abacus` (Zahlungsattribute: Zahlungsdatum, Zahlungsmethode).
* `sat_projekt__abacus`, `sat_projektteil__abacus`, `sat_projektsachkonto__abacus` (Projekt-Stammdaten).

#### Reference Tables (stabile Lookup-Werte)
* `ref_konto_v`, `ref_kostenstelle_v`, `ref_abteilung_v`, `ref_projektkategorie_v`, `ref_projektkategorisierung_v`, `ref_projektstatus_v`, `ref_kred_buchungsstatus_v`, `ref_actual_forecast_v`, `ref_leistungsart_v`.

### Business Vault (Erweiterte Logikschicht)
* Current-Views (`sat_*_current_v`): Vereinfachen den Zugriff auf den jeweils aktuellen Stand jeder Satellite-Historie und werden direkt von den Mart-Objekten konsumiert.
* Bei Bedarf werden hier Soft-Rules angewendet (Berechnungen, Standardisierung von Formaten, systemübergreifende Konsolidierung).

---

## Folie 10: Praxisbeispiel Abacus FIBU – Information Mart Schicht (DWH / IMS)

Aus den Beziehungen des Data Vaults werden über dbt vollautomatisiert performante Zugriffsobjekte (Views) im klassischen Star-Schema generiert:

### Dimensionstabellen (Stammdaten)
* `dim_date_v`: Zentrale Kalenderdimension.
* `dim_konto_v`: Harmonisierte Konten-Stammdaten (Kontenplan).
* `dim_kreditor_v`: Kreditoren-Stammdaten.
* `dim_kostenstelle_v`: Kostenstellen-Stammdaten.
* `dim_buchungsstatus_v`: Status-Klassifikation der Buchungen.
* `dim_projekt_v`: Projekt-Stammdaten (geteilt mit Projekt-Mart).
* `dim_abteilung_v`, `dim_leistungsart_v`: Organisatorische Dimensionen.

### Faktentabellen (Bewegungsdaten & Kennzahlen)
* `fakt_buchungen_v`: Zentrale Faktenbasis für alle Hauptbuch-Buchungen (Betrag, Datum, Konto, Kostenstelle, Projekt-Bezug).
* `fakt_belege_v`: Kreditorenbelege mit Status, Fälligkeit, Zahlungsbezug.
* `fakt_budget_v`: Budget-Werte pro Konto/Kostenstelle/Projekt.
* `fakt_forecast_v`: Forecast-Werte zur Budget-vs-Ist-Analyse.

### Domänenübergreifende Marts (Cross-Domain-Stärke der Plattform)
* `fakt_stunden_v` (Projekt-Mart): Stundenbuchungen mit Bezug zu Projekt, Person und Leistungsart — kombinierbar mit `fakt_buchungen_v` über `hub_projekt`.
* `fakt_cdr_v`, `fakt_anrufe_v`, `fakt_datenvolumen_v` (Telecom-Mart): Telekommunikationsfakten — kombinierbar mit Kunden-/Vertragsdimensionen über die gemeinsamen Hubs.

---

## Folie 11: Praxisbeispiel Abacus FIBU – Power BI Central Semantic Model (CSM)

* **Zweck:** Visuelle Darstellung des im BI-Server physikalisch abgebildeten Datenmodells auf Basis der Information Marts.
* **Struktur:** Die zentrale Faktentabelle `fakt_buchungen_v` bildet den Mittelpunkt des Sternschemas. Alle umliegenden Dimensionen (`dim_date_v`, `dim_konto_v`, `dim_kreditor_v`, `dim_kostenstelle_v`, `dim_projekt_v`, `dim_buchungsstatus_v`) sind über saubere, performante 1:n-Beziehungen mit den entsprechenden Fremdschlüsseln (Foreign Keys) der Faktentabelle verknüpft.
* **Erweiterung:** Die Fakttabellen `fakt_belege_v`, `fakt_budget_v` und `fakt_forecast_v` sind über die gemeinsamen Dimensionen (Konto, Kostenstelle, Projekt, Datum) angebunden und ermöglichen so kombinierte Auswertungen (z.B. Budget-vs-Ist, Belege-vs-Buchungen).

---

## Folie 12: Praxisbeispiel Finance – Dashboard (Business Frontend Showcase)

Ein praktisches Beispiel für ein produktives Analyse-Frontend, das vollständig auf den standardisierten Datenstrukturen der Data Vault Analytics Plattform aufsetzt:

### Technische Metadaten des Berichts
* **Name des Berichts:** Finance Cockpit – Buchungen, Belege, Budget vs. Ist
* **Business Concept:** Finance (Abacus FIBU/KRED/PROJ)
* **Daten-Aktualität (Latest Data):** Täglich aktualisiert via ADF + dbt (Stand T-1)
* **Status:** In Pilotbetrieb / Testphase
* **Rolle / Ersteller:** PPMC Business Intelligence

### Visualisierte Key Performance Indicators (KPIs)
* **Buchungsvolumen YTD:** Summe aller Hauptbuch-Buchungen im laufenden Geschäftsjahr.
* **Offene Kreditorenbelege:** Anzahl und Summe der noch nicht beglichenen Kreditorenbelege (Status-Filter über `dim_buchungsstatus_v`).
* **Budget vs. Ist:** Soll-Ist-Abweichung pro Kostenstelle/Projekt aus `fakt_budget_v` und `fakt_buchungen_v`.
* **Forecast-Genauigkeit:** Vergleich Forecast (`fakt_forecast_v`) gegen Ist über Zeit.

### Integrierte Filter- und Slicing-Strukturen
* **Zeithorizont:** Jahres- und Monatsfilter über `dim_date_v` inklusive einer globalen Schaltfläche "Filter reset".
* **Organisations-Struktur:** Kaskadierende Filter für Kostenstelle, Abteilung und Projekt.
* **Analytische Dimensionen:** Flexible Slicer für Konto, Kreditor und Buchungsstatus.

### Dashboard-Charts & Auswertungsstrukturen
* **Buchungen nach Konto:** Balkendiagramm der Buchungssummen je Hauptkonto.
* **Top-Kreditoren nach Volumen:** Ranking der Kreditoren mit dem höchsten Belegvolumen.
* **Budget vs. Ist pro Kostenstelle:** Vergleichsdiagramm mit Soll-, Ist- und Abweichungswerten.
* **Cross-Domain-Auswertung Projekt-Buchungen:** Hauptbuch-Buchungen pro Projekt (`link_hauptbuch_projekt`) — verknüpft mit Stundenbuchungen aus dem Projekt-Mart (`fakt_stunden_v`), um die Wirtschaftlichkeit pro Projekt End-to-End darzustellen.

---

## Folie 13: DATA VAULT ANALYTICS PLATTFORM SECURITY – Datenschutz-Mechanismen

Folgende Schutzmechanismen sind in der Data Vault Analytics Plattform konsequent datenbankseitig implementiert, um höchste Datensicherheit und Compliance zu gewährleisten:

### 1. Object Level Security (OLS)
* **Definition:** Object Level Security steuert den Zugriff auf komplette Datenbankobjekte.
* **Implementierung:** Die Berechtigungen für den Zugriff auf die einzelnen Datenbankobjekte (wie z.B. Tabellen und Views) werden stringent und zentral mittels Active Directory (AD) Gruppen gesteuert. Nicht autorisierte Benutzer können das Objekt weder abfragen noch dessen Existenz sehen.

### 2. Row Level Security (RLS)
* **Definition:** Row Level Security ist die zeilenweise Einschränkung von Dateninhalten innerhalb von zu besichernden Views bzw. Tabellen.
* **Implementierung:** Die Filterung erfolgt dynamisch basierend auf der Identität und den spezifischen Berechtigungen des angemeldeten Benutzers. Benutzer können pro Security-Kontext vollkommen unterschiedliche Rechte besitzen.
* **Best Practice:** In der Plattform-Architektur ist fest vorgegeben, dass RLS primär auf Ebene der finalen Zugriffsschicht (Views) angewendet wird, um die Performance der Core-Datenbankschichten nicht zu beeinträchtigen.

### 3. Column Level Security (CLS)
* **Definition:** Column Level Security ist die spaltenweise Einschränkung von Dateninhalten.
* **Implementierung:** Ermöglicht es, den Zugriff auf sensitive Tabellen- oder Viewspalten basierend auf den Berechtigungen der Benutzer gezielt zu beschränken.
* **Flexibilität:** Benutzer können pro Security-Context unterschiedliche Rechte auf unterschiedlichen Views bzw. deren Spalten haben (z.B. Ausblendung von Gehaltsdaten für reguläre Analysten in einer ansonsten freigegebenen Mitarbeiter-View).

### 4. Column Level Encryption (CLE) – Kryptografischer End-to-End-Schutz
* **Definition:** Column Level Encryption bietet die Möglichkeit, genau definierte, hochkritische Tabellenspalten Ende-zu-Ende kryptografisch zu verschlüsseln.
* **Verarbeitungs-Workflow:**
    1.  Die Dateninhalte werden unmittelbar zum Zeitpunkt der Beladung aus dem Quellsystem in die jeweilige Tabelle der Staging-Schicht verschlüsselt.
    2.  Die Informationen werden in der kompletten Data Vault Analytics Plattform, das heißt über alle Architekturschichten hinweg (Staging, Raw Vault, Business Vault, Marts), konsequent in verschlüsselter Form persistiert (Storage Security).
    3.  Die physische Entschlüsselung (Decryption) erfolgt strikt erst im Moment des konkreten Datenzugriffs (On-the-Fly) durch den jeweiligen Endanwender / AD-User.
* **Schlüssel-Management:** Das jeweilige Entschlüsselungs-Zertifikat und der zugehörige symmetrische Schlüssel können entweder direkt einem einzelnen AD-User oder einer AD-Gruppe zugeordnet werden. Die Zuordnung zu einer dedizierten AD-Gruppe ist hierbei der definierte, zu bevorzugende Standardweg.