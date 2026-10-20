# Dosia – Medikamente im Griff

Android-App zur Medikamentenverwaltung für dich, Angehörige und Haustiere – mit zuverlässigen
Erinnerungen, Vorratsübersicht und Messwerten. Alle Daten bleiben **auf dem Gerät**; optional
Sicherung im eigenen Google Drive. Kein eigener Server, kein Konto, keine Werbung.

- **Homepage & Download:** https://dosia.iamdomi.de
- **Aktuelle Version:** siehe `version` in [package.json](package.json) · Änderungen im [CHANGELOG](CHANGELOG.md)
- **App-ID:** `de.dominikest.dosia` · **minSdk 24** (Android 7+) · **targetSdk 36**
- **Stack:** Capacitor 8 (WebView-App aus `www/`) · AGP 8.13 · Gradle 8.14.3

## Funktionen
- **Personen & Tiere:** Medikamente getrennt für dich, Angehörige, Hund, Katze, Kaninchen, Vogel, Pferd …
- **Einnahmepläne:** täglich, bestimmte Wochentage, alle X Tage / Wochen / Monate, Zyklus (an/aus), mehrere Uhrzeiten, Start/Ende
- **Erinnerungen:** native Android-Benachrichtigungen, auch bei geschlossener App und nach Neustart;
  Knöpfe **„✓ Genommen"** und **„⏰ In 10 Min."** direkt in der Benachrichtigung; **Nachhaken**, wenn nicht abgehakt
- **Heute-Ansicht:** abhaken / überspringen, Tagesfortschritt, Hinweise auf fälliges Gewicht und knappen Vorrat
- **Vorrat:** Bestand wird beim Abhaken abgezogen, Reichweite in Tagen, **Nachkauf-Erinnerung**
- **Gewicht zum Medikament:** pro Medikament zuschaltbar – Abfrage beim ersten Abhaken des Tages
- **Messwerte** mit Verlauf: Gewicht, Blutdruck, Blutzucker, Puls, Temperatur, eigene Werte – je Person/Tier
- **Verlauf & Therapietreue** (7/30 Tage, letzte 14 Tage)
- **Notfall-Kontakt:** bei Dosen > 2 Std. offen mit Anruf-/SMS-Knopf
- **Sicherung:** automatisch in Google Drive (versteckter App-Ordner) und Backup-Datei über das Teilen-Menü
- **Selbst-Update** (nur Homepage-Variante): sucht auf der Homepage nach neuen Versionen und installiert sie auf Knopfdruck

## Zwei Varianten (Gradle-Flavors)
| Variante | Datei | Selbst-Update | Wofür |
|---|---|---|---|
| `direct` | `Dosia-x.y.z.apk` | ja (`REQUEST_INSTALL_PACKAGES`, `AppUpdatePlugin`) | Homepage-Download |
| `play` | `Dosia-x.y.z.aab` | nein – Updates nur über Google Play (Play-Richtlinie) | Google Play |

Die App fragt `dosia.updateUrl` aus `package.json` ab (`website/version.php`): Version, HTTPS-URL, SHA-256, Neuigkeiten.
Vor der Installation prüft sie Prüfsumme, Paketname und Versionsnummer; Android verlangt zusätzlich dieselbe Signatur.

## Projektstruktur
```
Dosia/
  www/                    Die App (HTML/CSS/JS) – app.js, gdrive.js, index.html; version.js wird erzeugt
  android/                Capacitor-Android-Projekt (u. a. GoogleDrivePlugin.java, Signatur-Konfiguration)
  assets/                 Icon-Quellen (1024 px) für die Icon-Generierung
  scripts/                write-version.mjs (Version + Datenschutz-URL aus package.json -> www/version.js)
  website/                Homepage (PHP): Präsentation, Download der neuesten APK, Impressum, Datenschutz
  .github/workflows/      Release-Build in GitHub Actions (signiertes AAB + APK)
  package.json            Version, Datenschutz-URL (dosia.privacyUrl), npm-Scripts

Nicht im Git (lokal sichern!): dosia-upload.keystore, keystore.properties, KEYSTORE-*.txt,
website/config.php, release/, *.apk/*.aab
```

## Entwicklung
In `www/` arbeiten, dann ins Android-Projekt übernehmen:
```bash
npm install
npm run sync
```
`npm run sync` schreibt `www/version.js` und führt `cap sync android` aus.
Icons neu erzeugen (Quellen in `assets/`): `npm run icons`

> Hinweis: Auf dem Entwicklungsrechner blockiert eine Security-Software AF_UNIX-Sockets und bricht HTTPS auf;
> der Android-Build (AGP 8) läuft dort nicht. Gebaut wird deshalb in GitHub Actions.

## Neue Version veröffentlichen
1. `version` in `package.json` erhöhen (z. B. `1.3.0` → `1.4.0`). Daraus folgen automatisch
   `versionName`, `versionCode` (1.4.0 → 10400), die Anzeige in der App und die Dateinamen.
2. Eintrag im [CHANGELOG](CHANGELOG.md) ergänzen, committen, pushen.
3. GitHub → **Actions → „Android Release (AAB + APK)" → Run workflow**
   (nicht „Re-run" bei einem alten Lauf – das baut den alten Stand).
4. Unter dem Lauf → **Artifacts**: `Dosia-<Version>.aab` (Play Store) und `Dosia-<Version>.apk` (direkt installieren).
5. Für die Homepage die APK nach `website/download/` legen und zusammen mit `website/CHANGELOG.md` hochladen.
   Die Seite bietet automatisch die höchste Version an – und installierte Apps (ab 1.4.0) melden das Update von selbst.

### Signatur (einmalig eingerichtet)
GitHub-Secrets: `DOSIA_KEYSTORE_BASE64`, `DOSIA_STORE_PASSWORD`, `DOSIA_KEY_PASSWORD`, `DOSIA_KEY_ALIAS` (= `dosia`).

> ⚠️ **Keystore sichern!** `dosia-upload.keystore` + Passwort sind für **alle** künftigen Updates nötig.
> Ohne sie kann die App (auch im Play Store) nicht mehr aktualisiert werden. Passwortmanager + separates Backup.

## Google-Drive-Sicherung (Google Cloud, Projekt „Dosia")
Scope `drive.appdata` (nur versteckter App-Ordner). Eingerichtet: Drive-API aktiviert, Google Auth Platform
(Extern, Status „Testen"), Testnutzer, Android-Client mit Paketname `de.dominikest.dosia` und
SHA-1 des Upload-Keys `14:D7:58:F0:28:90:AA:9A:50:97:13:EC:46:FD:B4:86:DD:66:FD:82`.

**Für den Play Store noch nötig:**
- Zweiter Android-Client mit dem SHA-1 des **App-Signaturschlüssels** aus der Play Console (*App-Integrität*)
- App in der Google Auth Platform von „Testen" auf **„In Produktion"** stellen

Fehlercode `API_10` in der App = Client fehlt oder SHA-1/Paketname passt nicht.

## Homepage (`website/`)
- `index.php` – Präsentation + Download der neuesten `download/Dosia-x.y.z.apk` + Kasten „Neu in Version …"
- `neuigkeiten.php` – alle Versionen aus `CHANGELOG.md` (`npm run sync` kopiert es nach `website/CHANGELOG.md` – mit hochladen)
- `impressum.php`, `datenschutz.php` (Website), `datenschutz-app.php` (App, für Play Console und In-App-Link)
- Persönliche Angaben nur in `website/config.php` (Vorlage: `config.example.php`), E-Mail wird spamgeschützt ausgegeben
- Die URL der App-Datenschutzerklärung steht in `package.json` unter `dosia.privacyUrl`

## Play-Store-Checkliste
**Erledigt:** App-ID, targetSdk 36, Icons, Release-Signatur, AAB-Build, Datenschutzerklärung (Website + App, In-App-Link)

**Offen (Play Console):**
- [ ] Entwicklerkonto; bei neuen privaten Konten: geschlossener Test mit mind. 12 Testern über 14 Tage
- [ ] AAB hochladen, Play App Signing aktivieren, danach zweiten OAuth-Client anlegen (siehe oben)
- [ ] Datensicherheit: Daten bleiben auf dem Gerät; optionale Sicherung in Google Drive des Nutzers
- [ ] Gesundheits-App-Erklärung, Begründung für exakte Alarme (zeitgenaue Einnahme-Erinnerungen)
- [ ] Store-Eintrag: Texte, mind. 2 Screenshots, Feature-Grafik 1024×500, Altersfreigabe

Dosia ersetzt keine ärztliche, tierärztliche oder pharmazeutische Beratung.
