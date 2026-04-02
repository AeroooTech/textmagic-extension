# ⚡ SnapText – Text Expander Browser-Extension

Eine leistungsstarke, kostenlose Alternative zu Magical Text Expander – ohne Abo, ohne Cloud-Zwang, 100% lokal.

---

## 🚀 Installation (Chrome / Edge / Brave)

1. Lade den `snaptext-extension` Ordner herunter und entpacke ihn
2. Öffne Chrome und gehe zu: `chrome://extensions`
3. Aktiviere oben rechts den **Entwicklermodus**
4. Klicke auf **"Entpackte Erweiterung laden"**
5. Wähle den `snaptext-extension` Ordner aus
6. Fertig! Das ⚡-Icon erscheint in der Toolbar

---

## ✨ Features

### Kern-Features (wie Magical)
- **Text-Expansion** – Trigger wie `/mfg` → expandiert zu vollem Text
- **Autocomplete-Dropdown** – Vorschläge während du tippst
- **Snippet-Verwaltung** – Erstellen, Bearbeiten, Löschen per Popup
- **Kategorien** – Snippets nach Themen organisieren
- **Funktioniert überall** – Gmail, Notion, LinkedIn, Slack, jede Website

### Extra-Features (besser als Magical)
- **Dynamische Variablen:**
  - `{{date}}` – Heutiges Datum (TT.MM.JJJJ)
  - `{{time}}` – Aktuelle Uhrzeit
  - `{{datetime}}` – Datum + Uhrzeit
  - `{{weekday}}` – Wochentag
  - `{{month}}` – Monatsname
  - `{{year}}` – Aktuelles Jahr
  - `{{clipboard}}` – Inhalt der Zwischenablage
  - `{{cursor}}` – Cursor-Position nach Expansion
  - `{{url}}` – URL der aktuellen Seite
  - `{{title}}` – Seitentitel
- **Toast-Benachrichtigungen** – Kurzes Feedback nach Expansion
- **Verwendungsstatistiken** – Zählt wie oft jedes Snippet genutzt wird
- **Zeitersparnis-Tracker** – Schätzt gesparte Minuten
- **Top-Snippets-Ranking** – Meistgenutzte Snippets auf einen Blick
- **Context-Menu-Integration** – Text markieren → rechtsklick → "Als Snippet speichern"
- **JSON Import/Export** – Backups und Geräte-Sync
- **CSV Export** – Für Tabellen-Analyse
- **Vollständige Options-Seite** – Professionelle Verwaltungsoberfläche
- **100% lokal** – Keine Cloud, keine Anmeldung, keine Kosten
- **Kein Abo** – Für immer kostenlos

---

## 📝 Nutzung

### Snippet erstellen
1. Klicke das ⚡-Icon in der Toolbar
2. Klicke **＋**
3. Gib einen Trigger ein (muss mit `/` beginnen, z.B. `/mfg`)
4. Gib den Inhalt ein (mit Variablen wie `{{date}}`)
5. Klicke **Speichern**

### Snippet verwenden
1. Klicke in ein Textfeld auf einer Website
2. Tippe deinen Trigger (z.B. `/mfg`)
3. Ein Dropdown erscheint mit passenden Snippets
4. Wähle ein Snippet oder drücke **Leertaste / Tab** für automatische Expansion

### Variablen nutzen
```
/mfg → Mit freundlichen Grüßen,
       [Name] ← Cursor steht hier ({{cursor}})

/datum → 02.04.2026 ({{date}})

/ticket → Betreff: {{title}}
          URL: {{url}}
          Datum: {{date}} {{time}}
          Beschreibung: {{cursor}}
```

---

## 🗂 Dateistruktur

```
snaptext-extension/
├── manifest.json          – Extension-Konfiguration
├── background/
│   └── service_worker.js  – Hintergrundprozess
├── content/
│   └── content.js         – Text-Expansion auf Webseiten
├── popup/
│   ├── popup.html         – Toolbar-Popup UI
│   └── popup.js           – Popup-Logik
├── options/
│   ├── options.html       – Vollständige Einstellungsseite
│   └── options.js         – Options-Logik
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🔒 Datenschutz

- **Keine Serververbindung** – Alles läuft lokal im Browser
- **Keine Anmeldung** – Kein Account notwendig
- **Keine Tracking** – Keine Nutzungsdaten werden gesammelt
- Snippets werden im `chrome.storage.local` gespeichert

---

Entwickelt als Open-Source Alternative zu Magical Text Expander.
