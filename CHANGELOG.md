# Changelog

## 1.5.0 – 20.10.2026
- **Wiederholtes Nachhaken:** Dosia erinnert erneut, bis die Dosis abgehakt oder übersprungen ist – einstellbar alle 5/10/15/30/60/120 Min.
  und 1×, 2×, 3×, 5×, 10× oder „bis abgehakt" (Standard); endet spätestens bei der nächsten Einnahme desselben Medikaments
- Deutlichere Nachhak-Erinnerungen („⏰ Noch nicht genommen … · fällig seit 06:00 · 3. Erinnerung"), je Dosis gebündelt
- Beim Abhaken verschwinden alle Erinnerungen dieser Dosis aus der Benachrichtigungsleiste
- „In 10 Min." pausiert das Nachhaken bis dahin
- Nach Updates wird bei jedem App-Start gesucht

## 1.4.1 – 20.10.2026
- Veraltete Versionen werden nach einer Übergangsfrist nicht mehr unterstützt: Erst erscheint ein Hinweis mit Datum,
  danach bietet Dosia nur noch das Update und einen Backup-Export an (bereits geplante Erinnerungen laufen weiter)
- Der Schalter unter „Mehr → App-Updates" blendet jetzt nur den Hinweis auf neue Versionen aus

## 1.4.0 – 20.10.2026
- **Automatische Updates:** Dosia sucht auf der Homepage nach neuen Versionen, zeigt „Update verfügbar" mit den Neuigkeiten
  und installiert auf Knopfdruck (Download, Prüfung, dann nur noch „Installieren" bestätigen – deine Daten bleiben erhalten)
- Unter „Mehr → App-Updates": installierte und neueste Version, „Nach Updates suchen", automatische Suche abschaltbar
- Die Version aus Google Play aktualisiert sich weiterhin nur über Google Play

## 1.3.0 – 19.10.2026
- Knöpfe **„✓ Genommen"** und **„⏰ In 10 Min."** direkt in der Benachrichtigung
  (die App hakt ab und schließt sich wieder; bei Gewichtserfassung bleibt sie für den Dialog offen)
- **Nachhaken:** erneute Erinnerung, wenn eine Dosis nicht abgehakt wurde (15/30/60/120 Min., abschaltbar)
- Neue Rhythmen **„alle X Wochen"** und **„alle X Monate"** (Monatsende und Schaltjahr berücksichtigt);
  seltene Rhythmen bekommen immer ihre nächste Erinnerung
- **Vorrat:** Reichweite in Tagen, vorausberechnete **Nachkauf-Erinnerung** (einmal pro Knapp-Phase), Hinweis auf „Heute"
- Link zur Datenschutzerklärung unter „Mehr"
- Behoben: Notfall-Kontakt wurde nie angezeigt – jetzt bei Dosen, die seit über 2 Std. offen sind (mit Anruf/SMS)
- Behoben: „Backup exportieren" tat in der App nichts – jetzt über das Android-Teilen-Menü
- Erledigte Erinnerungen verschwinden aus der Benachrichtigungsleiste

## 1.2.0 – 19.10.2026
- **Personen & Tiere:** Medikamente und Messwerte je Person/Tier, Auswahl oben in allen Ansichten
- **Gewicht zum Medikament:** pro Medikament zuschaltbar, Abfrage beim ersten Abhaken des Tages
- Erinnerungen nennen die Person bzw. das Tier
- Behoben: Werte mit Komma („12,5") wurden nicht gespeichert
- Behoben: Medikament ohne Startdatum zählte Tage vor dem Anlegen als „nicht genommen"

## 1.1.1 – 19.10.2026
- Genauere Fehlermeldungen bei der Google-Anmeldung

## 1.1.0 – 19.10.2026
- **Sicherung in Google Drive** (versteckter App-Ordner): verbinden, automatisch sichern, wiederherstellen
- Fehlende Benachrichtigungs-Erlaubnis nach Wiederherstellung auf neuem Handy wird erkannt

## 1.0.2 – 18.10.2026
- Version zentral in `package.json`, Dateinamen mit Versionsnummer, Anzeige in der App

## 1.0.1 – 18.10.2026
- Behoben: Service Worker lieferte in der App veralteten Code aus (Benachrichtigungen ließen sich nicht aktivieren)

## 1.0.0 – 18.10.2026
- Erste Version: Medikamente, Einnahmepläne, native Erinnerungen, Bestand, Messwerte, Verlauf, Backup
