# Dosia – Medikamente im Griff

Android-App zur Medikamentenverwaltung für dich, Angehörige und Haustiere – mit zuverlässigen
Erinnerungen, Vorratsübersicht und Messwerten. Alle Daten bleiben **auf dem Gerät**; optional
Sicherung im eigenen Google Drive. Kein eigener Server, kein Konto, keine Werbung.

- **Homepage & Download:** https://www.dosia24.de
- **Aktuelle Version:** siehe `version` in [package.json](package.json) · Änderungen im [CHANGELOG](CHANGELOG.md)
- **App-ID:** `de.dominikest.dosia` · **minSdk 24** (Android 7+) · **targetSdk 36**
- **Stack:** Capacitor 8 (WebView-App aus `www/`) · AGP 8.13 · Gradle 8.14.3

## Funktionen
- **Personen & Tiere:** Medikamente getrennt für dich, Angehörige, Hund, Katze, Kaninchen, Vogel, Pferd …
- **Einnahmepläne:** täglich, bestimmte Wochentage, alle X Tage / Wochen / Monate, Zyklus (an/aus), mehrere Uhrzeiten, Start/Ende
- **Erinnerungen:** native Android-Benachrichtigungen, auch bei geschlossener App und nach Neustart;
  Knöpfe **„✓ Genommen"** und **„⏰ In 10 Min."** direkt in der Benachrichtigung; wiederholtes **Nachhaken**, bis abgehakt (Abstand und Anzahl einstellbar)
- **Heute-Ansicht:** abhaken / überspringen, Tagesfortschritt, Hinweise auf fälliges Gewicht und knappen Vorrat
- **Vorrat:** Bestand wird beim Abhaken abgezogen, Reichweite in Tagen, **Nachkauf-Erinnerung**
- **Gewicht zum Medikament:** pro Medikament zuschaltbar – Abfrage beim ersten Abhaken des Tages
- **Messwerte** mit Verlauf: Gewicht, Blutdruck, Blutzucker, Puls, Temperatur, eigene Werte – je Person/Tier
- **Verlauf & Therapietreue** (7/30 Tage, letzte 14 Tage)
- **Notfall-Kontakt:** bei Dosen > 2 Std. offen mit Anruf-/SMS-Knopf
- **Sicherung:** automatisch in Google Drive (versteckter App-Ordner) und Backup-Datei über das Teilen-Menü
- **Selbst-Update** (nur Homepage-Variante): sucht nach neuen Versionen, installiert auf Knopfdruck, alte Versionen können gesperrt werden

## Projektstruktur
```
Dosia/
  www/                    Die App (HTML/CSS/JS): app.js, gdrive.js, update.js, index.html; version.js wird erzeugt
  android/                Capacitor-Android-Projekt
    app/src/main/java/…   MainActivity, GoogleDrivePlugin (Drive-Anmeldung), AppUpdatePlugin (Selbst-Update)
    app/src/direct/       Manifest-Ergänzung nur für die Homepage-Variante (Berechtigung „Apps installieren")
  assets/                 Icon-Quellen (1024 px) für die Icon-Generierung
  scripts/                write-version.mjs: Version und URLs aus package.json -> www/version.js
  .github/workflows/      Release-Build in GitHub Actions (signiertes AAB + APK)
  package.json            Version, dosia.privacyUrl, dosia.updateUrl, npm-Scripts
```
Nicht im Repo (lokal, siehe `.gitignore`): Signaturschlüssel und Zugangsdaten, die Homepage, Build-Ergebnisse.

## Entwicklung
In `www/` arbeiten, dann ins Android-Projekt übernehmen:
```bash
npm install
npm run sync
```
`npm run sync` schreibt `www/version.js` und führt `cap sync android` aus. Icons neu erzeugen (Quellen in `assets/`): `npm run icons`

## Zwei Varianten (Gradle-Flavors)
| Variante | Datei | Selbst-Update | Wofür |
|---|---|---|---|
| `direct` | `Dosia-x.y.z.apk` | ja (`REQUEST_INSTALL_PACKAGES`, `AppUpdatePlugin`) | Download von der Homepage |
| `play` | `Dosia-x.y.z.aab` | nein – Updates nur über Google Play (Play-Richtlinie) | Google Play |

## Release bauen
Gebaut wird in **GitHub Actions** (Workflow „Android Release (AAB + APK)").
1. `version` in `package.json` erhöhen (z. B. `1.4.1` → `1.5.0`). Daraus folgen automatisch
   `versionName`, `versionCode` (1.5.0 → 10500), die Anzeige in der App und die Dateinamen.
2. Abschnitt im [CHANGELOG](CHANGELOG.md) ergänzen (`## 1.5.0 – TT.MM.JJJJ`), committen, pushen.
3. **Actions → „Android Release (AAB + APK)" → Run workflow** (nicht „Re-run" eines alten Laufs – das baut den alten Stand).
   Alternativ einen Tag `v1.5.0` pushen.
4. Ergebnis unter **Artifacts**: `Dosia-<Version>.apk` (Homepage) und `Dosia-<Version>.aab` (Google Play).

**Signatur:** GitHub-Secrets `DOSIA_KEYSTORE_BASE64`, `DOSIA_STORE_PASSWORD`, `DOSIA_KEY_PASSWORD`, `DOSIA_KEY_ALIAS`.
Lokal liest `android/app/build.gradle` stattdessen `keystore.properties` (nicht im Repo).

**Automatisch auf die Homepage:** Sind die Secrets `DOSIA_DEPLOY_URL` (`sftp://host` oder `ftp://host` – FTP nur
TLS-verschlüsselt), `DOSIA_DEPLOY_USER`, `DOSIA_DEPLOY_PASSWORD` und `DOSIA_DEPLOY_PATH` gesetzt, lädt der Build
`Dosia-<Version>.apk` nach `download/` und das `CHANGELOG.md` in den Homepage-Ordner (erst unter Zwischennamen, dann
umbenannt) und prüft danach über die Update-Info, ob Version und SHA-256 stimmen. Beim manuellen Start lässt sich
das Hochladen mit „veroeffentlichen" abwählen (z. B. für Testbuilds); ohne Secrets wird es übersprungen.

## Schnittstellen zur Homepage
Die Homepage selbst liegt nicht in diesem Repo. Die App erwartet dort:

**Datenschutzerklärung** – URL in `package.json` → `dosia.privacyUrl`, verlinkt unter „Mehr".

**Update-Info** – URL in `package.json` → `dosia.updateUrl`. Die App ruft sie mit `?v=<installierte Version>` auf und erwartet JSON:
```json
{
  "version": "1.4.1",
  "url": "https://…/Dosia-1.4.1.apk",
  "sha256": "…",
  "size": 4423625,
  "notes": ["Neuigkeit 1", "Neuigkeit 2"],
  "support": { "status": "ok | warning | blocked", "blockedFrom": "2026-10-23", "message": "" }
}
```
- Ist `version` höher als die installierte, bietet die App das Update an. Vor der Installation prüft sie
  SHA-256, Paketname und Versionsnummer; Android verlangt zusätzlich dieselbe Signatur.
- `support` steuert die Versionssperre: `warning` zeigt einen Hinweis mit Datum, `blocked` (oder ein abgelaufenes
  `blockedFrom`) lässt nur noch Update und Backup-Export zu. Geplante Erinnerungen laufen aus Sicherheitsgründen weiter.
  Die Sperre gilt nur für die gemeldete Version, bleibt auch offline bestehen und verfällt nach einem Update.
- Nur die `direct`-Variante fragt die Update-Info ab.

## Google-Drive-Sicherung
Scope `drive.appdata` – die App sieht nur ihren versteckten App-Ordner im Drive des Nutzers, keine anderen Dateien.
Voraussetzung in der Google Cloud Console: Drive-API aktiviert, Google Auth Platform eingerichtet und ein
Android-OAuth-Client mit Paketname `de.dominikest.dosia` und dem SHA-1 des jeweiligen Signaturzertifikats
(für die Play-Version zusätzlich der SHA-1 des Play-App-Signaturschlüssels).
Fehlercode `API_10` in der App = Client fehlt oder SHA-1/Paketname passt nicht.

---
Dosia ersetzt keine ärztliche, tierärztliche oder pharmazeutische Beratung.
