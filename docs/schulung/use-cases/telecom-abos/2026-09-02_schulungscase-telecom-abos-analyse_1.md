# Analyse: Schulungs-Case «Telecom-Abos» (Roger, 02.09.2026)

> Bezug: Mail Roger, 02.09.2026, Betreff «Telecom-Abos». Screenshots Qlik-App
> «Abos 2.0» (Stream «Rii Seez Net»), Blatt «Sales Auswertung (INT/VOI/IPT/MOB)».
> Entspricht **UC3** aus `docs/SCHULUNGSPLAN_EWB.md` («IDMS Telekom-Abos Abos 2.0» —
> vollständiger Architektur-Durchstich, Block C).

## 1. Zusammenfassung der Anforderung

| Aspekt | Inhalt laut Roger |
|---|---|
| **Quelle heute** | IDMS |
| **Quelle später** | AAX4-Plattform von Compax (Projekt BSS/OSS, Marco Prosch) |
| **Provider** | Rii Seez Net |
| **Grundstruktur Abo** | Abo/Abo-Bezeichnung; Abo gültig von/bis (DD/MM/YYYY); Abo Business JA/NEIN |
| **Preise** | Verknüpfung über externe Excel-Dateien, für Umsatzberechnung |
| **Zähllogik** | «Netto» je Stichtag (z.B. 31.01.26, 28.02.26 …) — nur im gewählten Zeitraum aktive Abos |
| **Bisheriges Reporting** | Qlik, Stream «Rii Seez Net», App «Abos 2.0», 13 Arbeitsblätter/Berichte:<br>1. Gesamtübersicht mit Verlauf als Balkendiagramm pro Produkt (Internet/Festnetz/IPTV/Mobile)<br>2. Gesamtübersicht Gesamt (Kombi-Abos zählen als 1 Abo) inkl. Jahresumsatz-Hochrechnung anhand Abopreis<br>3. Auswertung Internet<br>4. Auswertung Festnetz<br>5. Auswertung IPTV<br>6. Auswertung Mobile<br>7. Prozentuale Veränderung über alle Produkte pro KNP<br>8. Prozentuale Veränderung pro Produkt und KNP<br>9. Abos pro KNP<br>10. Abo-Veränderung zur Vorperiode (Umsatz)<br>11. Abos/Kunden pro Abo-Typ und KNP<br>12. Kundenlisten *(laut Roger «heikel», da für jeden zugänglich)*<br>13. Verschiedene Geoview-Darstellungen |
| **KNP (Kabelnetzpartner)** | 20 fixe Partner (Altstätten, Bad Ragaz, Buchs, Diepoldsau, Fläsch, Flums, Flumserberg, Gams, Grabs, Maienfeld, Marbach, Mels, Oberriet, Pfäfers, Rebstein, Sargans, Sevelen, Walenstadt, Wartau, Widnau) |
| **KNP-Zuordnung** | über PLZ, in Excel-Datei abgelegt |
| **Neue fachliche Anforderung (Sales & Partnermanagement)** | Zusätzlich zum Netto-Bestand: monatliche **Bewegungen** auswerten (Kündigungen, Neukunden/neue Abos) |
| **Parallelspur** | Christian Bigger (Leiter Networks & Technologies, Telecom) baut bereits eigene Reportings dazu in Power BI |
| **Auftrag an Daniel** | Daten anschauen, für Schulung Freitag prüfen |
| **Auftrag an Roger** | Geht parallel mit Spezifikation auf den Fachbereich zu, um Auswertungsbedarf/Darstellung klar zu definieren |

## 2. Abgleich mit dem bestehenden Projektstand

Was im `datavault-dbt`-Repo bereits existiert, und was für diesen Case fehlt:

- **IDMS ist erst teilweise angebunden.** Es gibt aktuell nur `idms_address_main` →
  `hub_adresse`/`sat_adresse__idms` und `idms_internet_service_main` →
  `hub_internet_service`/`sat_internet_service__idms`. Beides deckt nicht die von
  Roger beschriebene generische «Abo»-Struktur (Abo-Typ, gültig von/bis, Business-Flag)
  über alle vier Produkte (Internet/Festnetz/IPTV/Mobile) ab — das internet_service-Satellite
  hat z.B. kein Business-Flag und keine Produktkategorie.
- **Ein Telecom-Concept existiert bereits**, aber auf Compax/RSN-Mobile-Basis, nicht
  IDMS: `hub_msisdn`, `hub_sim`, `link_vertrag_msisdn`, `link_vertrag_sim`,
  `link_vertrag_kunde`, `sat_vertrag_eff__compax`, `sat_kunde__compax`,
  `sat_vertrag_optionen_ma__compax`, `sat_cdr_event__compax` (Mart: `dim_mobilkunde_v`,
  `dim_mobilvertrag_v`, `dim_sim_v`, `fakt_anrufe`, `fakt_cdr_v`, `fakt_datenvolumen`).
  Das deckt nur **Mobile** ab, und die Quelle ist bereits Compax — nicht IDMS. Für
  Internet/Festnetz/IPTV gibt es noch kein Vertragsmodell.
- **Kein KNP-Objekt.** Es gibt weder eine Hub/Ref-Tabelle für Kabelnetzpartner noch
  eine PLZ→KNP-Zuordnung im Projekt (`masterdata/`, `seeds/`). Die von Roger erwähnte
  Excel-Zuordnung liegt bislang ausserhalb des Projekts.
- **Keine Preis-Referenz.** Die externe Preis-Excel für die Umsatzhochrechnung ist
  ebenfalls noch nicht als Quelle/Seed im Projekt vorhanden.
- Der Case ist im Schulungskonzept bereits als **UC3** grob geschätzt: IDMS-Onboarding
  2–3 Tage, Telecom-Concept-Erweiterung 1–2 Tage, Mart-Views 1–2 Tage — als Termine
  Block C1–C4 vorgesehen (ADF/IDMS-Quelle → Staging/Raw Vault → Mart → Reporting/Qlik-Vergleich).

**Einordnung:** Rogers Mail ist im Kern die fachliche Spezifikation, die für den
UC3-Durchstich gebraucht wird — mit einer Erweiterung (Bewegungsauswertung), die im
Schulungskonzept noch nicht explizit vorgesehen war.

## 3. Offene Fragen

### Datenstruktur IDMS
1. Welche IDMS-Tabelle(n)/Parquet-Pfad(e) bilden «Abo» ab — eine gemeinsame
   Subscription-Tabelle für alle vier Produkte, oder je Produkt eine eigene (analog
   `internet_service.Main`)? Für Festnetz/IPTV/Mobile fehlt aktuell die Quelle.
2. Wie ist «Abo Business JA/NEIN» technisch codiert (eigenes Flag-Feld, abgeleitet aus
   Kundentyp, oder aus dem Abo-Typ selbst)?
3. Wie sind **Kombi-Abos** in den Rohdaten erkennbar (gemeinsame Kunden-/Vertrags­referenz,
   Bündel-Kennzeichen)? Relevant für «Gesamtübersicht Gesamt», wo Kombi-Abos als 1 gezählt werden.

### KNP / PLZ-Zuordnung
4. Wo liegt die PLZ→KNP-Excel, wie oft ändert sie sich, und soll sie als Seed/Masterdata
   ins Projekt übernommen werden (analog anderer Referenztabellen) oder bleibt sie eine
   manuell gepflegte externe Quelle?
5. Sind die 20 KNP eine feste, geschlossene Liste, oder muss das Modell künftige Erweiterungen einplanen?

### Preisverknüpfung
6. Struktur/Format der externen Preis-Excel(s): Schlüssel zum Abo (Abo-Typ? Abo-ID?),
   Gültigkeitszeitraum der Preise (historisiert oder nur aktueller Preis?), Update-Rhythmus.

### Business-Regel «Netto»-Zählung
7. Exakte Aktiv-Bedingung je Stichtag — vermutlich `gültig_von <= Stichtag AND (gültig_bis IS NULL OR gültig_bis >= Stichtag)`, aber zu verifizieren (inkl. Umgang mit Abo-Wechsel am Stichtag selbst).
8. Nach welcher Regel zählt ein Kombi-Abo als «1» in der Gesamtübersicht (gleicher Kunde
   + überlappender Zeitraum, oder ein technisches Bündel-Merkmal)?

### Neue Anforderung: Kündigungen / Neukunden
9. Reicht ein reines **Netto-Delta** zwischen zwei Stichtagen (Bestand Periode n − Bestand
   Periode n-1), oder werden echte **Bewegungsarten** gebraucht (Storno, Neuanlage,
   Produktwechsel/Upgrade)? Das entscheidet, ob dafür ein Transaction Link nötig ist oder
   ob es sich aus der Satellite-Historie (SCD2 über gültig-von/-bis) ableiten lässt.

### Verhältnis zur Power-BI-Parallelspur (Christian Bigger)
10. Ist das bereits von Christian Bigger gebaute Power-BI-Reporting eine Vorstufe/ein
    Vorläufer für die AAX4-Migration, eine parallele Lösung ausserhalb des DV-Projekts,
    oder soll es ins geplante Data-Vault-Mart-Reporting einfliessen? Wichtig, um
    Doppelarbeit zu vermeiden und ggf. dessen Berechnungslogik als Referenz zu nutzen.

### Datenschutz / Zugriff
11. Die Kundenlisten-Sheets sind laut Roger «heikel, da für jeden zugänglich» — braucht
    das neue Modell eine RLS-Einschränkung (analog Finance-Rollen im bestehenden Projekt)?

### Migration Richtung Compax/AAX4
12. Soll das Vault-Modell so gebaut werden, dass IDMS und später AAX4/Compax als
    **Multi-Source in denselben Hub** einlaufen (Pattern wie bei `hub_adresse` mit IDMS +
    Abacus), oder bleiben es bis zur Migration zwei getrennte Modelle?

### Geoview
13. Welche Geodaten stehen zur Verfügung (Koordinaten, Gemeindegrenzen)? Ist das Teil
    des Scopes für Freitag oder ein späterer Ausbauschritt?

### Zugriff für die Vorbereitung
14. **Qlik-Zugriff (App «Abos 2.0», Stream «Rii Seez Net») ist nötig — aber nicht als
    Datenquelle für das Staging**, sondern um das **Ladeskript** zu lesen: Qlik zapft
    heute direkt IDMS an, das Skript zeigt also, welche IDMS-Tabellen/Felder die
    Abo-Struktur, das Business-Flag, die Preise und die KNP-Zuordnung tatsächlich liefern
    — der schnellste Weg, die richtigen IDMS-Quelltabellen zu identifizieren, statt das
    IDMS-Schema blind zu durchsuchen. Das eigentliche Staging (External Table → Staging
    View) baut später direkt auf den IDMS-Parquet-Dateien auf, nicht auf Qlik-Exporten.
    Zusätzlich nötig: die PLZ-KNP-Excel und ein Beispiel der Preis-Excel.
15. Zugriff auf das Power-BI-Reporting von Christian Bigger ist demgegenüber eher zur
    Vermeidung von Doppelarbeit / zum Logik-Vergleich relevant (siehe Frage 10), nicht
    zur Quellidentifikation — vermutlich dieselbe oder eine abgeleitete Quelle.

## 4. Empfehlung für Freitag

Angesichts des Umfangs (UC3 = vollständiger Architektur-Durchstich, laut Schulungsplan
2–3 Tage allein für IDMS-Onboarding) ist am Freitag realistischerweise die
**Analyse-/Verständnisebene** dran (Schritt «Vault-Modell planen» aus
`SCHULUNG_NEUES_BUSINESS_OBJEKT.md`, Abschnitt 3.5) — nicht die Implementierung:

- Qlik-Ladeskript/Datenmodell von «Abos 2.0» sichten, um die Netto- und
  Kombi-Abo-Logik zu verstehen (Fragen 7–8).
- IDMS-Schema für Abo-relevante Tabellen sichten (Frage 1), analog Schritt 1–2 aus dem
  Schulungsleitfaden (`get_parquet_schema`).
- Die offenen Fragen 1–14 oben mit Roger/Fachbereich klären, bevor Staging/Vault gebaut wird.
