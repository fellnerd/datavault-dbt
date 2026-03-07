---
description: Zeige Beispieldaten aus einer Parquet-Datei
---

# Parquet-Daten anzeigen

Liest Beispieldaten aus einer Parquet-Datei in ADLS Gen2.

## Parameter

- `folder_path` (required): Pfad zum Ordner in ADLS
- `file_name` (required): Name der Parquet-Datei
- `limit` (optional): Anzahl der Zeilen (Standard: 5, Max: 100)

## Beispiel

```
Zeige 3 Beispielzeilen aus Platform.Api_Project.parquet in jira/sql
```

## Nützlich für

- Datenqualität prüfen
- Business Keys identifizieren
- Beziehungen zu anderen Tabellen erkennen
- NULL-Werte und Datenformate verstehen
