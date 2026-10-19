# Dosia – Medikamentenverwaltung (Android, Play-Store-ready)

Persönliche Medikamentenverwaltung. Eigener Code, eigenes Design. Alle Daten bleiben
**lokal auf dem Gerät** (localStorage im eingebetteten WebView) – kein Server, kein Konto, keine Cloud.

- **App-ID:** `de.dominikest.dosia`
- **Version:** 1.0.0 (versionCode 1)
- **minSdk 24** (Android 7+), **targetSdk 36** (erfüllt die aktuelle Play-Anforderung)
- **Stack:** Capacitor 8 · AGP 8.13 · Gradle 8.14.3

## Projektstruktur
```
Dosia/
  www/                     Die eigentliche App (HTML/CSS/JS) – Single Source of Truth
  assets/                  Icon-Quellen (1024px) für die Icon-Generierung
  android/                 Capacitor-Android-Projekt (generiert)
  .github/workflows/       GitHub-Actions-Build (signiertes AAB/APK)
  capacitor.config.json    App-ID, Name, webDir
  package.json             npm-Scripts
  dosia-upload.keystore    Release-Signaturschlüssel  (NICHT im Git)
  keystore.properties      Keystore-Zugangsdaten      (NICHT im Git)
  KEYSTORE-PASSWORT.txt    Passwort-Notiz             (NICHT im Git)
  KEYSTORE-BASE64.txt      Keystore als Base64 fürs CI-Secret (NICHT im Git)
```

## Funktionen
Medikamente (Form/Stärke/Farbe) · Einnahmeplan (täglich · alle X Tage · Wochentage · Zyklus) ·
mehrere Uhrzeiten · Heute-Ansicht mit Abhaken · Erinnerungen · Bestand mit Warnung ·
Messwerte (Blutdruck, Blutzucker, Gewicht …) mit Verlauf · Therapietreue · Backup-Export/Import.

---

## Entwicklung

Web-Teil ändern → in `www/` arbeiten, dann:
```bash
npm install
npx cap copy android
```

Icons neu erzeugen (Quellen in `assets/`):
```bash
npm run icons
```

---

## Release bauen (signiertes AAB für den Play Store)

Der lokale Rechner kann den modernen Build wegen einer Security-Software (blockiert AF_UNIX-Sockets)
nicht ausführen. Daher läuft der Release-Build in **GitHub Actions** auf Linux.

### Einmalig einrichten
1. Dieses Projekt in ein (privates) GitHub-Repo pushen.
2. Im Repo → **Settings → Secrets and variables → Actions** diese Secrets anlegen:
   | Secret | Wert |
   |---|---|
   | `DOSIA_KEYSTORE_BASE64` | kompletter Inhalt von `KEYSTORE-BASE64.txt` |
   | `DOSIA_STORE_PASSWORD` | Passwort aus `KEYSTORE-PASSWORT.txt` |
   | `DOSIA_KEY_PASSWORD` | dasselbe Passwort |
   | `DOSIA_KEY_ALIAS` | `dosia` |

### Neue Version
Die Version steht **nur** in `package.json` (`"version": "1.2.3"`). Daraus ergeben sich automatisch:
- `versionName` 1.2.3 und `versionCode` 10203 im Android-Build (steigt mit jeder Version, wie Play es verlangt)
- die Anzeige in der App (Mehr → ganz unten), über das erzeugte `www/version.js`
- die Dateinamen: `Dosia-1.2.3.apk` / `Dosia-1.2.3.aab`

Also: Version in `package.json` erhöhen, committen, pushen, Build auslösen.

### Build auslösen
- In GitHub → **Actions → „Android Release" → Run workflow**, oder
- einen Tag pushen: `git tag v1.0.0 && git push origin v1.0.0`

Nach dem Lauf unter **Actions → der Lauf → Artifacts**:
- `Dosia-<Version>-aab` → `Dosia-<Version>.aab` (das lädst du in den Play Store hoch)
- `Dosia-<Version>-apk` → `Dosia-<Version>.apk` (zum direkten Testen auf dem Handy)

> ⚠️ **Keystore sichern!** `dosia-upload.keystore` + Passwort sind für **alle** zukünftigen
> Updates nötig. Gehen sie verloren, kannst du die App im Play Store nicht mehr aktualisieren.
> In einem Passwortmanager und einem separaten Backup aufbewahren.

---

## Google-Drive-Sicherung – Einrichtung bei Google (einmalig)

Dosia sichert die Daten in den versteckten App-Ordner im Google Drive des Nutzers
(Scope `drive.appdata` – kein Zugriff auf andere Dateien). Damit die Anmeldung funktioniert,
muss die App in der Google Cloud Console registriert sein:

1. https://console.cloud.google.com → neues Projekt **„Dosia"**
2. **APIs & Dienste → Bibliothek → „Google Drive API" → Aktivieren**
3. **Google Auth Platform** (früher „OAuth-Zustimmungsbildschirm") → Erste Schritte:
   App-Name „Dosia", Support-E-Mail, Zielgruppe **Extern**
4. **Datenzugriff → Bereiche hinzufügen** → `https://www.googleapis.com/auth/drive.appdata`
5. **Zielgruppe → Testnutzer** → eigene Gmail-Adresse eintragen
   (solange die App im Status „Testen" ist, können sich nur Testnutzer anmelden)
6. **Clients → Client erstellen → Typ „Android"**
   - Paketname: `de.dominikest.dosia`
   - SHA-1 (Upload-Key, für die APKs aus GitHub Actions):
     `14:D7:58:F0:28:90:AA:9A:50:97:13:EC:46:FD:B4:86:DD:66:FD:82`
7. **Nach dem ersten Play-Upload:** Play Console → *App-Integrität* → SHA-1 des
   **App-Signaturschlüssels** kopieren und einen **zweiten** Android-Client mit diesem SHA-1 anlegen.
   Sonst funktioniert die Anmeldung in der Play-Version nicht.
8. Vor der Veröffentlichung: in der Google Auth Platform die App von „Testen" auf **„In Produktion"** stellen.

Fehler in der App „…noch nicht freigeschaltet" (Code API_10) = Client fehlt oder SHA-1/Paketname passt nicht
(nach dem Anlegen manchmal ein paar Minuten warten).

**Datenschutz/Play:** Mit der Drive-Sicherung verlassen Daten (auf Wunsch des Nutzers) das Gerät –
Datenschutzerklärung und Data-Safety-Angaben entsprechend formulieren.

---

## Play-Store-Einreichung – Checkliste

**Technisch – erledigt:**
- [x] Eigene App-ID, Name, Version, targetSdk 36
- [x] Launcher-Icons inkl. adaptive icons + Play-Store-Icon (512px in `assets/`)
- [x] Release-Signatur konfiguriert
- [x] AAB-Build (GitHub Actions)

**Noch von dir zu erledigen (im Play Console-Konto):**
- [ ] Google-Play-Entwicklerkonto (einmalig 25 USD)
- [ ] App anlegen, `app-release.aab` als internen Test hochladen
- [ ] **Datenschutzerklärung** (URL) – Pflicht. Da Dosia nur lokal speichert, genügt eine kurze Seite,
      die sagt: keine Datenerhebung, keine Übertragung an Server/Dritte.
- [ ] **Data-Safety-Formular**: „Es werden keine Daten erfasst/geteilt" (trifft hier zu).
- [ ] Store-Eintrag: Kurz-/Vollbeschreibung, mind. 2 Screenshots (Telefon), Feature-Grafik 1024×500.
- [ ] Inhaltsbewertung (Fragebogen), Zielgruppe/Alter.
- [ ] **Gesundheits-App-Erklärung:** Play fragt bei Medikamenten-/Gesundheits-Apps ggf. nach. Dosia ist
      ein reines Erinnerungs-/Tracking-Tool ohne medizinische Beratung – das so angeben.

**Wichtiger Hinweis in der App-Beschreibung empfohlen:** Dosia ersetzt keine ärztliche/pharmazeutische
Beratung; Erinnerungen können bei geschlossener App nicht garantiert werden.

---

## Datensicherung für Nutzer
Die App-Daten liegen nur im Gerät. In der App unter **Mehr → Backup exportieren** sichern.
