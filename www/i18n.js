/* Dosia – Sprache (Deutsch / Englisch).
   Texte stehen im Code auf Deutsch; t('…') liefert bei Englisch die Übersetzung.
   Platzhalter: t('Noch {n} übrig', {n:3}). Fehlt eine Übersetzung, bleibt der deutsche Text.
   Die Sprache ist eine Geräte-Einstellung (nicht Teil des Backups). Wird VOR allen anderen Skripten geladen. */
'use strict';

const I18N = (() => {
  const KEY = 'dosia.lang';
  const pref = () => { try{ return localStorage.getItem(KEY) || 'auto'; }catch{ return 'auto'; } };
  const detect = () => /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
  let lang = pref() === 'auto' ? detect() : pref();

  const EN = {
    // Allgemein / Navigation
    'Heute':'Today', 'Medikamente':'Medication', 'Werte':'Readings', 'Verlauf':'History', 'Mehr':'More',
    'Hinzufügen':'Add', 'Schließen':'Close', 'Speichern':'Save', 'Löschen':'Delete', 'Bearbeiten':'Edit', 'Alle':'All',
    'Abbrechen':'Cancel', 'Bitte warten …':'Please wait …', 'Später':'Later', 'Erneut versuchen':'Try again',
    'Dosia – Medikamente':'Dosia – Medication',
    // Formen
    'Tablette':'Tablet', 'Kapsel':'Capsule', 'Tropfen':'Drops', 'Spritze/Injektion':'Syringe/Injection', 'Inhalator':'Inhaler',
    'Salbe/Creme':'Ointment/Cream', 'Saft':'Syrup', 'Pflaster':'Patch', 'Sonstige':'Other',
    // Profile
    'Ich':'Me', 'Person':'Person', 'Hund':'Dog', 'Katze':'Cat', 'Kaninchen':'Rabbit', 'Vogel':'Bird', 'Pferd':'Horse', 'Anderes Tier':'Other animal',
    // Wochentage (kurz, 0 = Sonntag)
    'So':'Sun', 'Mo':'Mon', 'Di':'Tue', 'Mi':'Wed', 'Do':'Thu', 'Fr':'Fri', 'Sa':'Sat',
    // Heute
    'Heute · {n} Dosis':'Today · {n} dose', 'Heute · {n} Dosen':'Today · {n} doses',
    'Gewicht':'Weight', 'Heute noch nicht erfasst':'Not recorded yet today', 'Erfassen':'Record',
    'Nachkaufen: {name}':'Restock: {name}', 'noch {n}':'{n} left', 'Bestand':'Stock',
    'Seit über 2 Std. offen':'Open for more than 2 hours', 'Notfall-Kontakt:':'Emergency contact:', '📞 Anrufen':'📞 Call', '💬 SMS':'💬 Text',
    'Für heute sind keine Einnahmen geplant.':'No doses planned for today.', 'Lege unter „Medikamente" etwas an.':'Add something under “Medication”.',
    'Fortschritt heute':'Progress today', '{a} von {b} genommen':'{a} of {b} taken',
    'fällig':'due', 'geplant':'planned', 'erledigt':'done', 'offen':'open', '{a} von {b}':'{a} of {b}', 'übersprungen':'skipped', 'genommen':'taken', 'Genommen':'Taken', 'Überspringen':'Skip',
    // Vorrat
    'heute leer':'empty today', 'reicht ~1 Tag':'lasts ~1 day', 'reicht ~{n} Tage':'lasts ~{n} days',
    // Medikamente
    'Medikamente · {n}':'Medication · {n}', 'Noch keine Medikamente.':'No medication yet.', 'Tippe auf „+", um eines anzulegen.':'Tap “+” to add one.',
    'Bestand: {n}':'Stock: {n}', 'nachkaufen':'restock', '⚠ Wechselwirkung':'⚠ Interaction', '⚖️ Gewicht':'⚖️ Weight', '⏰ Wecker':'⏰ Alarm',
    'kein Plan':'no schedule', 'täglich {t}':'daily {t}', 'alle {n} Tage {t}':'every {n} days {t}', 'wöchentlich':'weekly', 'alle {n} Wochen':'every {n} weeks',
    'monatlich':'monthly', 'alle {n} Monate':'every {n} months', '{a} an / {b} aus · {t}':'{a} on / {b} off · {t}',
    // Messwerte
    'Blutdruck':'Blood pressure', 'Blutzucker':'Blood sugar', 'Puls':'Pulse', 'Temperatur':'Temperature', 'Eigener Wert':'Custom value',
    'Systolisch':'Systolic', 'Diastolisch':'Diastolic', 'Messwerte':'Readings', 'Noch keine Messwerte.':'No readings yet.',
    '„+" erfasst Blutdruck, Blutzucker, Gewicht …':'“+” records blood pressure, blood sugar, weight …', 'zuletzt:':'latest:',
    '(zu wenig Daten für Verlauf)':'(not enough data for a chart)',
    // Verlauf
    'Verlauf &amp; Therapietreue':'History &amp; adherence', '7 Tage':'7 days', '30 Tage':'30 days', 'Dosen (7 T.)':'Doses (7 d)', 'Letzte 14 Tage':'Last 14 days',
    // Mehr
    'Personen &amp; Tiere':'People &amp; pets', 'Für wen sind die Medikamente? Lege z. B. ein Familienmitglied oder dein Haustier an.':'Who is the medication for? Add e.g. a family member or your pet.',
    '{n} Medikament':'{n} medication', '{n} Medikamente':'{n} medications', '+ Person oder Tier hinzufügen':'+ Add person or pet',
    'Erinnerungen':'Reminders', 'Geplante Benachrichtigungen zu den Einnahmezeiten – auch bei geschlossener App.':'Scheduled notifications at dose times – even when the app is closed.',
    'Benachrichtigungen, solange Dosia geöffnet ist (Browser-Version).':'Notifications while Dosia is open (browser version).',
    'Erinnerungen aktivieren':'Enable reminders', 'Nachhaken, solange nicht abgehakt':'Keep reminding until checked off',
    '{n} Minuten':'{n} minutes', '1 Stunde':'1 hour', '2 Stunden':'2 hours', 'Wie oft':'How often', 'bis abgehakt':'until checked off',
    'Nachgehakt wird höchstens bis zur nächsten Einnahme desselben Medikaments (spätestens nach 24 Std.). In der Benachrichtigung kannst du direkt auf „✓ Genommen" oder „⏰ In 10 Min." tippen.':
      'Follow-ups stop at the next dose of the same medication (after 24 hours at the latest). In the notification you can tap “✓ Taken” or “⏰ In 10 min” directly.',
    'Falls keine Erinnerungen ankommen: In den Android-Einstellungen unter <b>Apps → Dosia → Benachrichtigungen</b> erlauben und bei <b>Akku</b> „nicht optimiert/uneingeschränkt" wählen, damit Android die App nicht einschläfert.':
      'If reminders don’t arrive: allow notifications under <b>Apps → Dosia → Notifications</b> in the Android settings and set <b>Battery</b> to “unrestricted”, so Android doesn’t put the app to sleep.',
    '⚠ In der Browser-Version können Erinnerungen bei geschlossener Seite nicht garantiert werden. Für zuverlässige Erinnerungen die installierte App nutzen.':
      '⚠ The browser version can’t guarantee reminders while the page is closed. Use the installed app for reliable reminders.',
    'Darstellung':'Appearance', 'Automatisch':'Automatic', 'Hell':'Light', 'Dunkel':'Dark', 'Sprache':'Language',
    'Notfall-Kontakt (MedFriend)':'Emergency contact (MedFriend)',
    'Nur auf diesem Gerät gespeichert. Ist eine Dosis seit über 2 Stunden offen, zeigt „Heute" den Kontakt mit Knöpfen zum Anrufen und für eine SMS.':
      'Stored on this device only. If a dose has been open for more than 2 hours, “Today” shows the contact with buttons to call or text.',
    'Name / Telefon':'Name / phone', 'z. B. Anna · 0170 …':'e.g. Anna · +44 7700 …',
    'Datensicherung':'Backup', 'Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig.':'All data is stored on this device only. Back it up regularly.',
    '⤓ Backup exportieren':'⤓ Export backup', '⤒ Backup importieren':'⤒ Import backup', 'Installieren':'Install',
    'Im Browser-Menü „Zum Startbildschirm hinzufügen" wählen – dann läuft Dosia wie eine App, offline.':'Choose “Add to Home screen” in the browser menu – Dosia then runs like an app, offline.',
    'App installieren':'Install app', 'Alle Daten löschen':'Delete all data',
    'Dosia ersetzt keine ärztliche oder pharmazeutische Beratung. Prüfe Dosierungen und Wechselwirkungen immer mit Arzt oder Apotheke.':
      'Dosia does not replace medical or pharmaceutical advice. Always check doses and interactions with your doctor or pharmacist.',
    'Datenschutzerklärung':'Privacy policy (German)', 'App':'App', 'Browser':'Browser', 'Benachrichtigungs-Plugin fehlt':'notification plugin missing',
    // Formular Medikament
    'Medikament bearbeiten':'Edit medication', 'Neues Medikament':'New medication', 'Für':'For', '＋ Neue Person / neues Tier …':'＋ New person / pet …',
    'Name':'Name', 'Art':'Type', 'z. B. Bello':'e.g. Buddy', 'Medikament':'Medication','z. B. Ramipril':'e.g. Ramipril', 'Form':'Form',
    'Stärke / Dosis':'Strength / dose', 'z. B. 5 mg':'e.g. 5 mg', 'Farbe':'Colour', 'Einnahmeplan':'Schedule', 'Rhythmus':'Frequency',
    'Täglich':'Daily', 'Alle X Tage':'Every X days', 'Bestimmte Wochentage':'Specific weekdays', 'Alle X Wochen':'Every X weeks',
    'Alle X Monate':'Every X months', 'Zyklus (X Tage an / Y aus)':'Cycle (X days on / Y off)', 'Uhrzeiten':'Times', '+ Uhrzeit':'+ Time',
    'Start (optional)':'Start (optional)', 'Ende (optional)':'End (optional)', 'Aktueller Bestand':'Current stock', 'Nachkauf-Erinnerung ab (Stück)':'Restock reminder at (units)',
    'z. B. 30':'e.g. 30', 'z. B. 7':'e.g. 7',
    'Dosia zieht jede abgehakte Einnahme ab, zeigt an, wie viele Tage der Vorrat reicht, und erinnert rechtzeitig ans Nachkaufen. Nach dem Kauf hier den neuen Bestand eintragen.':
      'Dosia subtracts every dose you check off, shows how many days your supply lasts and reminds you in time to restock. After buying, enter the new stock here.',
    '⚖️ Gewicht mit erfassen':'⚖️ Also record weight',
    'Solange das Medikament läuft (Start bis Ende), fragt Dosia beim ersten Abhaken am Tag nach dem Gewicht – höchstens einmal täglich.':
      'While the medication is running (start to end), Dosia asks for the weight at the first check-off of the day – at most once a day.',
    'Wecker-Modus':'Alarm mode', '⏰ Wie ein Wecker klingeln':'⏰ Ring like an alarm clock',
    'Für besonders wichtige Medikamente: Die Erinnerung klingelt bildschirmfüllend mit Wecker-Ton – auch bei gesperrtem Handy –, bis du „Genommen" oder „Später" tippst.':
      'For especially important medication: the reminder rings full-screen with an alarm sound – even on a locked phone – until you tap “Taken” or “Later”.',
    '⚠ Wechselwirkung/Hinweis markieren':'⚠ Mark interaction/note', 'Notizen (Einnahmehinweise, Wechselwirkungen …)':'Notes (how to take, interactions …)',
    'z. B. nüchtern einnehmen; nicht mit Grapefruit':'e.g. take on an empty stomach; not with grapefruit',
    'Alle wie viele Tage?':'Every how many days?', 'Alle wie viele Wochen?':'Every how many weeks?', 'Alle wie viele Monate?':'Every how many months?',
    'Gerechnet ab dem Startdatum unten – ohne Startdatum ab heute.':'Counted from the start date below – without a start date from today.',
    ' Gibt es den Tag in einem Monat nicht (z. B. 31.), dann am Monatsletzten.':' If a month doesn’t have that day (e.g. the 31st), the last day of the month is used.',
    'Wochentage':'Weekdays', 'Tage „an"':'Days “on”', 'Tage „aus"':'Days “off”', 'Zyklus-Start':'Cycle start',
    // Formular Messwert / Gewicht / Profil
    'Messwert erfassen':'Add reading', 'Notiz (optional)':'Note (optional)', 'z. B. nach dem Essen':'e.g. after a meal', 'Wert':'Value', 'Einheit':'Unit', 'z. B. mg/l':'e.g. mg/l',
    'Zuletzt: <b>{v} kg</b> am {d}':'Last: <b>{v} kg</b> on {d}', 'Noch kein Gewicht erfasst.':'No weight recorded yet.', 'Gewicht (kg)':'Weight (kg)',
    'z. B. 12,5':'e.g. 12.5', 'Heute nicht':'Not today', 'Person oder Tier hinzufügen':'Add person or pet', 'z. B. Mama, Bello, Minka':'e.g. Mum, Buddy, Luna',
    'zu {name}':'with {name}',
    // Meldungen
    'Speichern fehlgeschlagen – evtl. ist der Speicher voll.':'Saving failed – the storage may be full.',
    'Bitte einen Namen für das Medikament eingeben.':'Please enter a name for the medication.',
    'Bitte einen Namen für die neue Person bzw. das Tier eingeben.':'Please enter a name for the new person or pet.',
    'Dieses Medikament löschen? Der Verlauf bleibt erhalten.':'Delete this medication? The history is kept.',
    'Bitte einen gültigen Wert eingeben.':'Please enter a valid value.', 'Bitte beide Werte eingeben.':'Please enter both values.', 'Messwert löschen?':'Delete this reading?',
    'Bitte ein gültiges Gewicht eingeben, z. B. 12,5':'Please enter a valid weight, e.g. 12.5', 'Bitte einen Namen eingeben.':'Please enter a name.',
    '„{p}" löschen?\n\nDabei werden auch {n} Medikament(e) und {w} Messwert(e) von {p} gelöscht.':'Delete “{p}”?\n\nThis also deletes {n} medication(s) and {w} reading(s) of {p}.',
    'Benachrichtigungen werden auf diesem Gerät nicht unterstützt.':'Notifications are not supported on this device.',
    'Bitte erlaube Benachrichtigungen für Dosia in den Android-Einstellungen.':'Please allow notifications for Dosia in the Android settings.',
    'Dieser Browser unterstützt keine Benachrichtigungen.':'This browser does not support notifications.', 'Benachrichtigungen wurden nicht erlaubt.':'Notifications were not allowed.',
    'Dosia-Backup':'Dosia backup', 'Dosia-Backup vom {d}':'Dosia backup from {d}', 'Backup speichern oder teilen':'Save or share backup',
    'Backup konnte nicht exportiert werden: ':'Backup could not be exported: ', 'Backup einspielen? Aktuelle Daten werden ersetzt.':'Restore backup? Current data will be replaced.',
    'Backup eingespielt.':'Backup restored.', 'Ungültige Backup-Datei.':'Invalid backup file.', 'Wirklich ALLE Daten unwiderruflich löschen?':'Really delete ALL data permanently?',
    'Erinnerungen wurden ausgeschaltet, weil Android keine Benachrichtigungen für Dosia erlaubt. Du kannst sie unter „Mehr" wieder aktivieren.':
      'Reminders were turned off because Android doesn’t allow notifications for Dosia. You can turn them back on under “More”.',
    // Benachrichtigungen
    'Zeit für die Einnahme':'Time to take it', 'Gewicht erfassen':'Record weight', '🛒 Nachkaufen: {name}':'🛒 Restock: {name}',
    'Noch etwa {n} übrig':'About {n} left', 'für {name}':'for {name}', 'gestern {t}':'yesterday {t}', '⏰ Noch nicht genommen: {name}':'⏰ Not taken yet: {name}',
    'fällig seit {t}':'due since {t}', '{n}. Erinnerung':'reminder {n}', '✓ Genommen':'✓ Taken', '⏰ In {n} Min.':'⏰ In {n} min',
    'Einnahme-Erinnerungen':'Dose reminders', 'Erinnert an die Medikamenten-Einnahme':'Reminds you to take your medication',
    // Zuverlässigkeits-Check
    'Zuverlässigkeit der Erinnerungen':'Reminder reliability', 'Prüfen':'Check', 'Alles in Ordnung – deine Erinnerungen kommen zuverlässig an.':'All good – your reminders will arrive reliably.',
    'Erinnerungen könnten ausfallen':'Reminders may fail', 'Bitte prüfen: {n} Einstellung(en) gefährden deine Erinnerungen.':'Please check: {n} setting(s) put your reminders at risk.',
    'Jetzt prüfen':'Check now', 'Ausblenden':'Hide', 'Beheben':'Fix', 'Einstellungen öffnen':'Open settings',
    'Erinnerungen in Dosia eingeschaltet':'Reminders turned on in Dosia', 'Erinnerungen sind in Dosia ausgeschaltet.':'Reminders are turned off in Dosia.', 'Einschalten':'Turn on',
    'Benachrichtigungen erlaubt':'Notifications allowed', 'Android blockiert alle Benachrichtigungen von Dosia.':'Android is blocking all notifications from Dosia.',
    'Erinnerungs-Kanal aktiv':'Reminder channel active', 'Der Kanal „Einnahme-Erinnerungen" ist abgeschaltet.':'The “Dose reminders” channel is turned off.',
    'Der Kanal „Einnahme-Erinnerungen" ist auf lautlos gestellt – Erinnerungen erscheinen ohne Ton und Pop-up.':'The “Dose reminders” channel is set to silent – reminders appear without sound or pop-up.',
    'Pünktliche Erinnerungen (exakte Wecker)':'On-time reminders (exact alarms)', 'Android erlaubt keine exakten Wecker – Erinnerungen können sich verspäten.':'Android doesn’t allow exact alarms – reminders may be late.',
    'Akku-Optimierung aus':'Battery optimisation off',
    'Android darf Dosia zum Akkusparen einschränken. Besonders auf Samsung, Xiaomi und Huawei kommen Erinnerungen dann verspätet oder gar nicht.':
      'Android may restrict Dosia to save battery. Especially on Samsung, Xiaomi and Huawei, reminders may then arrive late or not at all.',
    'Hintergrund nicht eingeschränkt':'Background not restricted', 'Die Hintergrundaktivität von Dosia ist eingeschränkt.':'Dosia’s background activity is restricted.',
    'App nicht im Tiefschlaf':'App not in deep sleep', 'Android hat Dosia als selten genutzt eingestuft. Öffne Dosia regelmäßig oder schalte die Akku-Optimierung aus.':
      'Android has classed Dosia as rarely used. Open Dosia regularly or turn off battery optimisation.',
    'Wecker bildschirmfüllend erlaubt':'Full-screen alarms allowed', 'Android erlaubt Dosia keine bildschirmfüllenden Wecker. Der Wecker klingelt trotzdem, erscheint aber nur als Benachrichtigung.':
      'Android doesn’t allow Dosia to show full-screen alarms. The alarm still rings, but only appears as a notification.',
    'Wecker-Kanal aktiv':'Alarm channel active', 'Der Kanal „Wecker für wichtige Medikamente" ist abgeschaltet oder lautlos.':'The “Alarms for important medication” channel is turned off or silent.',
    '„Nicht stören" ist an':'“Do not disturb” is on', 'Normale Erinnerungen kommen gerade ohne Ton. Wecker klingeln, wenn in „Nicht stören" Wecker erlaubt sind.':
      'Normal reminders currently arrive without sound. Alarms ring if alarms are allowed in “Do not disturb”.',
    'Samsung: „Schlafende Apps"':'Samsung: “Sleeping apps”',
    'Prüfe unter Einstellungen → Akku → Hintergrundnutzungslimits, dass Dosia nicht bei „Schlafende Apps" oder „Apps im Tiefschlaf" steht.':
      'Check under Settings → Battery → Background usage limits that Dosia is not listed under “Sleeping apps” or “Deeply sleeping apps”.',
    'Test-Erinnerung':'Test reminder', 'Test-Erinnerung in 10 Sek.':'Test reminder in 10 s', 'Test-Wecker in 10 Sek.':'Test alarm in 10 s',
    'Dosia · Test':'Dosia · Test', 'So sieht deine Erinnerung aus. Alles funktioniert!':'This is what your reminder looks like. Everything works!',
    'Sperre das Handy jetzt – in 10 Sekunden kommt die Test-Erinnerung.':'Lock your phone now – the test reminder arrives in 10 seconds.',
    'Prüft die Android-Einstellungen, die Erinnerungen verhindern oder verzögern können.':'Checks the Android settings that can block or delay reminders.',
    'Nur in der Android-App verfügbar.':'Only available in the Android app.',
    'Nach dem Ändern einer Einstellung kehre zu Dosia zurück – die Prüfung aktualisiert sich automatisch.':'After changing a setting, return to Dosia – the check updates automatically.',
    // Sprache
    'Systemsprache':'System language',
    // Einstellungen ("Mehr") – neu strukturiert
    'Beispiel: Einnahme um 08:00, nicht abgehakt → weitere Erinnerungen um {list}{more}':'Example: dose at 08:00, not checked off → further reminders at {list}{more}',
    '(insgesamt {n}×).':'({n}× in total).', '(so lange, bis du abhakst).':'(until you check it off).',
    '<b>An:</b> Dosia meldet sich zu jeder Einnahmezeit mit einer Benachrichtigung – auch wenn die App geschlossen ist. <b>Aus:</b> keine Benachrichtigungen; fällige Dosen siehst du nur, wenn du Dosia öffnest.':
      '<b>On:</b> Dosia sends a notification at every dose time – even when the app is closed. <b>Off:</b> no notifications; you only see due doses when you open Dosia.',
    '<b>An:</b> Benachrichtigungen, solange Dosia im Browser geöffnet ist. Für zuverlässige Erinnerungen bei geschlossener App die Android-App nutzen.':
      '<b>On:</b> notifications while Dosia is open in the browser. For reliable reminders when the app is closed, use the Android app.',
    'Erneut erinnern, bis abgehakt':'Remind again until checked off',
    '<b>An:</b> Hast du eine Dosis nicht mit ✓ bestätigt oder übersprungen, erinnert Dosia im gewählten Abstand noch einmal. Spätestens bei der nächsten Einnahme desselben Medikaments (höchstens 24 Std.) ist Schluss. <b>Aus:</b> nur eine Erinnerung pro Einnahme.':
      '<b>On:</b> if you haven’t confirmed a dose with ✓ or skipped it, Dosia reminds you again at the chosen interval – until the next dose of the same medication at the latest (max. 24 h). <b>Off:</b> only one reminder per dose.',
    '{n} Min.':'{n} min', '1 Std.':'1 h', '2 Std.':'2 h',
    'Abstand':'Interval', 'alle {x}':'every {x}', 'Wie oft höchstens':'At most',
    'In jeder Benachrichtigung: <b>„✓ Genommen“</b> hakt die Dosis ab, <b>„⏰ In 10 Min.“</b> erinnert dich zehn Minuten später noch einmal. Den <b>Wecker-Modus</b> (klingelt bildschirmfüllend) schaltest du beim einzelnen Medikament ein.':
      'In every notification: <b>“✓ Taken”</b> checks off the dose, <b>“⏰ In 10 min”</b> reminds you again ten minutes later. <b>Alarm mode</b> (rings full-screen) is turned on per medication.',
    'Verwaltest du Medikamente für mehrere – z. B. ein Kind, die Eltern oder dein Haustier –, lege hier je eine Person oder ein Tier an. Medikamente und Messwerte werden dann getrennt geführt, oben in jeder Ansicht kannst du filtern, und die Erinnerung sagt, für wen die Dosis ist.':
      'If you manage medication for several people or pets – e.g. a child, your parents or your dog – add each one here. Medication and readings are then kept separately, you can filter at the top of every view, and the reminder tells you who the dose is for.',
    'Notfall-Kontakt':'Emergency contact',
    'Ist eine Dosis seit über 2 Stunden nicht abgehakt, zeigt „Heute“ diesen Kontakt mit Knöpfen zum <b>Anrufen</b> und für eine <b>SMS</b> – z. B. eine Angehörige, die nachschauen kann. Dosia schickt <b>nichts automatisch</b>; der Kontakt ist nur auf diesem Gerät gespeichert. Leer lassen, wenn du das nicht brauchst.':
      'If a dose hasn’t been checked off for more than 2 hours, “Today” shows this contact with buttons to <b>call</b> or <b>text</b> – e.g. a relative who can check in. Dosia sends <b>nothing automatically</b>; the contact is stored on this device only. Leave empty if you don’t need it.',
    'Name und Telefonnummer':'Name and phone number', 'Sicherung':'Backup', 'Backup-Datei':'Backup file',
    'Alle Daten liegen nur auf diesem Handy. <b>Exportieren</b> speichert sie als Datei (z. B. in deinen Downloads, per Mail oder in einer Cloud deiner Wahl). <b>Importieren</b> spielt so eine Datei wieder ein – dabei werden die aktuellen Daten in Dosia ersetzt.':
      'All data is stored on this phone only. <b>Export</b> saves it as a file (e.g. to your downloads, by email or to a cloud of your choice). <b>Import</b> restores such a file – this replaces the current data in Dosia.',
    'Über Dosia':'About Dosia', 'Daten löschen':'Delete data',
    'Löscht <b>alle</b> Medikamente, Einnahmen, Messwerte, Personen und Einstellungen auf diesem Handy und stoppt alle Erinnerungen. Lässt sich nicht rückgängig machen – exportiere vorher ein Backup. Eine Sicherung in Google Drive bleibt erhalten.':
      'Deletes <b>all</b> medication, doses, readings, people and settings on this phone and stops all reminders. This cannot be undone – export a backup first. A Google Drive backup is kept.',
    'Kommen meine Erinnerungen an?':'Will my reminders arrive?',
    'Android und manche Hersteller (z. B. Samsung) können Erinnerungen verzögern oder unterdrücken, etwa durch Akkusparen. Dosia prüft die wichtigsten Einstellungen und führt dich bei Bedarf direkt hin.':
      'Android and some manufacturers (e.g. Samsung) can delay or suppress reminders, for example to save battery. Dosia checks the most important settings and takes you straight there if needed.',
    '{n} Einstellung(en) prüfen':'Check {n} setting(s)', 'Alles in Ordnung':'All good', 'Einzelheiten anzeigen':'Show details',
    'Ausprobieren: Tippe auf einen Test, sperre das Handy und warte 10 Sekunden.':'Try it: tap a test, lock your phone and wait 10 seconds.',
    'Test-Wecker':'Test alarm', 'Wie das Handy':'Same as phone',
    '„Wie das Handy“ richtet sich nach der Systemsprache. Die Erinnerungstexte wechseln mit.':'“Same as phone” follows the system language. Reminder texts change too.',
    '„Wie das Handy“ wechselt automatisch zwischen hell und dunkel, passend zur Einstellung deines Handys.':'“Same as phone” switches between light and dark automatically, matching your phone’s setting.',
    'zuletzt geprüft {d}':'last checked {d}',
    'Dosia sucht bei jedem Start und beim Zurückkehren in die App (höchstens stündlich) auf dosia24.de nach einer neuen Version. Installiert wird nur, wenn du auf „Aktualisieren“ tippst – deine Daten bleiben dabei erhalten.':
      'Dosia checks dosia24.de for a new version on every start and when you return to the app (at most hourly). It only installs when you tap “Update” – your data is kept.',
    'Jetzt nach Updates suchen':'Check for updates now', 'Hinweis auf „Heute“':'Notice on “Today”',
    '<b>An:</b> Gibt es eine neue Version, erscheint oben auf „Heute“ eine Karte mit „Jetzt aktualisieren“. <b>Aus:</b> keine Karte – neue Versionen siehst du nur hier. Wird deine Version nicht mehr unterstützt, erscheint der Hinweis trotzdem.':
      '<b>On:</b> when a new version is available, a card with “Update now” appears at the top of “Today”. <b>Off:</b> no card – you only see new versions here. If your version is no longer supported, the notice appears anyway.',
    'Anonym mitzählen':'Count anonymously',
    '<b>An:</b> Bei der Update-Suche wird höchstens einmal am Tag „heute aktiv“ mitgeschickt. So sehe ich, wie viele Dosia nutzen – ohne Geräte-Kennung, ohne Medikamente oder andere Daten. <b>Aus:</b> nichts davon; die Update-Suche funktioniert genauso.':
      '<b>On:</b> when checking for updates, “active today” is sent at most once a day. This shows me how many people use Dosia – without any device ID, medication or other data. <b>Off:</b> none of this; update checks work the same.',
    'Automatisch sichern':'Back up automatically',
    '<b>An:</b> Wenige Sekunden nach jeder Änderung und mindestens einmal am Tag wird die Sicherung in Google Drive aktualisiert. <b>Aus:</b> nur, wenn du auf „Jetzt sichern“ tippst.':
      '<b>On:</b> the Google Drive backup is updated a few seconds after every change and at least once a day. <b>Off:</b> only when you tap “Back up now”.',
    '<b>Wiederherstellen</b> ersetzt die Daten auf diesem Handy durch die Sicherung (z. B. nach einem Handywechsel). <b>Trennen</b> beendet die Verbindung, die Sicherung bleibt in deinem Google Drive. Es ist eine Sicherung, kein Live-Abgleich zwischen zwei Handys.':
      '<b>Restore</b> replaces the data on this phone with the backup (e.g. after switching phones). <b>Disconnect</b> ends the connection; the backup stays in your Google Drive. It’s a backup, not a live sync between two phones.',
    // Updates
    'Damit Dosia Updates installieren kann, muss Android das einmalig erlauben.\n\nTippe gleich bei „Dosia" auf „Aus dieser Quelle zulassen", kehre dann zurück und tippe erneut auf „Jetzt aktualisieren".':
      'To install updates, Android needs to allow this once for Dosia.\n\nTap “Allow from this source” for “Dosia”, then come back and tap “Update now” again.',
    'Die Datei kam beschädigt an. Bitte noch einmal versuchen.':'The file arrived damaged. Please try again.',
    'Die Datei auf der Homepage passt nicht zu dieser App.':'The file on the website doesn’t match this app.',
    'Keine Internetverbindung.':'No internet connection.', 'Das Update ist fehlgeschlagen.':'The update failed.',
    'Update auf {v}':'Update to {v}',
    'Android fragt jetzt, ob das Update installiert werden soll – tippe auf <b>„Installieren"</b>. Deine Daten bleiben erhalten.':
      'Android now asks whether to install the update – tap <b>“Install”</b>. Your data is kept.',
    'Wird heruntergeladen und geprüft …':'Downloading and verifying …', 'Update nicht möglich':'Update not possible',
    'Diese Version wird nicht mehr unterstützt':'This version is no longer supported',
    'Installiert ist Dosia <b>{v}</b>. Bitte aktualisiere auf die neueste Version{n}, um Dosia weiter zu nutzen. Deine Daten bleiben dabei erhalten.':
      'Dosia <b>{v}</b> is installed. Please update to the latest version{n} to keep using Dosia. Your data is kept.',
    'Jetzt aktualisieren':'Update now',
    'Gerade ist keine neuere Version zum Herunterladen verfügbar. Bitte versuche es später noch einmal.':'No newer version is available for download right now. Please try again later.',
    'Erneut prüfen':'Check again', 'Backup exportieren':'Export backup', 'Bereits geplante Erinnerungen laufen vorerst weiter.':'Reminders that are already scheduled keep running for now.',
    'Bitte aktualisieren':'Please update', 'Dosia {v} funktioniert nur noch bis <b>{d}</b>.':'Dosia {v} only works until <b>{d}</b>.', 'Neu: {v}.':'New: {v}.',
    'Update verfügbar: Dosia {v}':'Update available: Dosia {v}', 'Installiert: {v}':'Installed: {v}', 'App-Updates':'App updates', 'Neueste: {v}':'Latest: {v}', 'geprüft':'checked',
    'Auf „Heute" auf neue Versionen hinweisen':'Show new versions on “Today”',
    'Anonym mitzählen, wie viele Dosia nutzen':'Anonymously count how many people use Dosia',
    'Bei der Update-Suche wird höchstens einmal am Tag „heute aktiv" mitgeschickt – ohne Geräte-Kennung oder persönliche Daten.':
      'When checking for updates, “active today” is sent at most once a day – without any device ID or personal data.', 'Auf {v} aktualisieren':'Update to {v}', 'Nach Updates suchen':'Check for updates',
    'Dosia {v} ist verfügbar.':'Dosia {v} is available.', 'Du hast die neueste Version ({v}).':'You have the latest version ({v}).',
    'Keine Verbindung zum Update-Server. Bitte später noch einmal versuchen.':'No connection to the update server. Please try again later.',
    // Google Drive
    'Google-Anmeldung ist für diese App noch nicht freigeschaltet (OAuth-Client in der Google Cloud Console fehlt oder der SHA-1-Fingerabdruck passt nicht).':
      'Google sign-in is not enabled for this app yet (OAuth client missing in the Google Cloud Console or SHA-1 fingerprint doesn’t match).',
    'Anmeldung abgebrochen.':'Sign-in cancelled.',
    'Anmeldung abgebrochen. Falls du nicht selbst abgebrochen hast: Die App ist bei Google noch nicht vollständig eingerichtet (Testnutzer eingetragen? Android-Client mit Paketname und SHA-1 angelegt?).':
      'Sign-in cancelled. If you didn’t cancel it yourself: the app is not fully set up with Google yet (test user added? Android client with package name and SHA-1 created?).',
    'Google-Anmeldung fehlgeschlagen (Code {c}):':'Google sign-in failed (code {c}):',
    'Automatische Sicherung fehlgeschlagen: Google möchte den Zugriff neu bestätigt haben. Tippe auf „Jetzt sichern".':
      'Automatic backup failed: Google wants you to confirm access again. Tap “Back up now”.',
    'Zugriff abgelaufen. Bitte erneut mit Google verbinden.':'Access expired. Please connect to Google again.',
    'Google Drive hat den Zugriff verweigert (ist die Drive-API im Cloud-Projekt aktiviert?).':'Google Drive denied access (is the Drive API enabled in the Cloud project?).',
    'Unbekannter Fehler.':'Unknown error.', 'Google Drive meldet Fehler {n}.':'Google Drive reports error {n}.',
    'Die Sicherung in Google Drive ist ungültig.':'The backup in Google Drive is invalid.',
    'In Google Drive gibt es eine Sicherung vom {d}.\n\nJetzt wiederherstellen?':'There is a backup from {d} in Google Drive.\n\nRestore it now?',
    'In Google Drive gibt es bereits eine Sicherung vom {d}.\n\nOK = Sicherung wiederherstellen (ersetzt die Daten auf diesem Gerät)\nAbbrechen = Daten dieses Geräts behalten – sie ersetzen dann die Sicherung.':
      'There is already a backup from {d} in Google Drive.\n\nOK = restore the backup (replaces the data on this device)\nCancel = keep this device’s data – it then replaces the backup.',
    'In Google Drive wurde noch keine Sicherung gefunden.':'No backup found in Google Drive yet.',
    'Sicherung vom {d} wiederherstellen?\n\nDie Daten auf diesem Gerät werden dabei ersetzt.':'Restore the backup from {d}?\n\nThe data on this device will be replaced.',
    'Sicherung in Google Drive':'Google Drive backup',
    'Nur in der Android-App verfügbar. In der Browser-Version kannst du unten ein Backup exportieren.':'Only available in the Android app. In the browser version you can export a backup below.',
    'In dieser App-Version nicht verfügbar.':'Not available in this app version.',
    'Sichert deine Dosia-Daten in einem versteckten App-Ordner in <b>deinem</b> Google Drive. Dosia sieht dort nur die eigene Sicherung, nicht deine anderen Dateien. So kannst du nach einem Handywechsel alles wiederherstellen.':
      'Backs up your Dosia data to a hidden app folder in <b>your</b> Google Drive. Dosia only sees its own backup there, not your other files. This lets you restore everything after switching phones.',
    'Mit Google verbinden':'Connect with Google', 'Verbunden mit {e}.':'Connected with {e}.', 'Verbunden.':'Connected.', 'Letzte Sicherung:':'Last backup:', 'noch keine':'none yet',
    'Nach Änderungen automatisch sichern':'Back up automatically after changes', 'Jetzt sichern':'Back up now', 'Wiederherstellen':'Restore', 'Trennen':'Disconnect',
    'Sicherung, kein Live-Abgleich: Nutzt du Dosia auf zwei Geräten, gilt jeweils die zuletzt gespeicherte Sicherung.':'Backup, not live sync: if you use Dosia on two devices, the most recently saved backup applies.',
    'Sicherung wiederhergestellt.':'Backup restored.',
    'Verbunden. Die vorhandene Sicherung in Google Drive bleibt unverändert, bis du hier Daten einträgst.':'Connected. The existing backup in Google Drive stays unchanged until you enter data here.',
    'Verbunden. Deine Daten wurden in Google Drive gesichert.':'Connected. Your data was backed up to Google Drive.',
    'Es wurde nichts gesichert: Die App enthält noch keine Daten und eine vorhandene Sicherung soll nicht überschrieben werden.':'Nothing was backed up: the app has no data yet and an existing backup should not be overwritten.',
    'In Google Drive gesichert.':'Backed up to Google Drive.',
    'Verbindung zu Google trennen?\n\nDie letzte Sicherung bleibt in deinem Google Drive erhalten.':'Disconnect from Google?\n\nThe last backup stays in your Google Drive.',
    'Verbindung getrennt.':'Disconnected.',
    // 1.7.0 – Arten, Dauer, Abschluss
    'Mittel':'Meds & more', 'Mittel · {n}':'Meds & more · {n}', '1 Mittel':'1 item', '{n} Mittel':'{n} items',
    'Brausetablette':'Effervescent tablet', 'Lutschtablette':'Lozenge', 'Kautablette/Gummi':'Chewable/Gummy', 'Pulver/Granulat':'Powder/Granules',
    'Trinkampulle':'Drinking ampoule', 'Tee':'Tea', 'Spray':'Spray', 'Zäpfchen':'Suppository', 'Anwendung':'Application',
    'Vitamin & Nahrungsergänzung':'Vitamin & supplement', 'Hausmittel & Anwendung':'Home remedy & routine', 'Sonstiges':'Other',
    'Tabletten, Tropfen, Spritzen …':'Tablets, drops, injections …', 'z. B. Vitamin C, Zink, Magnesium':'e.g. vitamin C, zinc, magnesium',
    'z. B. Tee, Inhalieren, Gurgeln':'e.g. tea, inhaling, gargling', 'Alles, woran Dosia erinnern soll':'Anything Dosia should remind you of',
    'z. B. Vitamin C':'e.g. vitamin C', 'z. B. Salbeitee, Inhalieren':'e.g. sage tea, inhaling', 'z. B. Wasser trinken':'e.g. drink water',
    'Neue Nahrungsergänzung':'New supplement', 'Nahrungsergänzung bearbeiten':'Edit supplement',
    'Neues Hausmittel':'New home remedy', 'Hausmittel bearbeiten':'Edit home remedy',
    'Neue Erinnerung':'New reminder', 'Erinnerung bearbeiten':'Edit reminder',
    'Was möchtest du anlegen?':'What would you like to add?', 'Zuletzt beendet':'Recently finished',
    '1 Tag':'1 day', '{n} Tage':'{n} days', 'Tag {x} von {y}':'Day {x} of {y}',
    '{name} abgeschlossen':'{name} finished', 'Wiederholen':'Repeat', '+7 Tage':'+7 days', 'OK':'OK',
    'es fehlen {n}':'{n} short', 'Lege unter „Mittel“ etwas an.':'Add something under “Meds & more”.',
    'Noch nichts angelegt.':'Nothing added yet.',
    'Tippe auf „+“ – für Medikamente, Vitamine, Hausmittel oder andere Erinnerungen.':'Tap “+” – for medication, vitamins, home remedies or other reminders.',
    'startet {d}':'starts {d}', 'endet heute':'ends today', 'noch {n} Tage':'{n} days left', 'reicht bis zum Ende ✓':'lasts until the end ✓',
    'Abgeschlossen · {n}':'Finished · {n}', 'bis {d}':'until {d}',
    'Wie lange?':'How long?', 'Dauerhaft':'Ongoing', 'Andere …':'Other …', 'z. B. 3':'e.g. 3',
    'Tage':'Days', 'Wochen':'Weeks', 'bis Datum':'until date', 'Ab':'From', 'Morgen':'Tomorrow', 'Datum …':'Date …',
    'Weitere Optionen (Vorrat, Gewicht, Wecker …)':'More options (supply, weight, alarm …)',
    'Bitte eine Dauer eingeben.':'Please enter a duration.', 'Das Ende liegt vor dem Start.':'The end is before the start.',
    'Heute sind alle Uhrzeiten schon vorbei – Start ab morgen.':'All times have passed for today – starting tomorrow.',
    'Ab {d} · dauerhaft':'From {d} · ongoing', '1 Einnahme':'1 dose', '{n} Einnahmen':'{n} doses',
    'Das Ende liegt in der Vergangenheit – der Eintrag zählt dann als abgeschlossen.':'The end is in the past – the entry will count as finished.',
    'Vorrat reicht bis zum Ende ✓':'Supply lasts until the end ✓', 'Vorrat reicht nicht – es fehlen {n}':'Supply won’t last – {n} short',
    'Gerechnet ab dem Starttag (unten bei „Ab“).':'Counted from the start day (below at “From”).',
    '„{name}“ löschen? Der Verlauf bleibt erhalten.':'Delete “{name}”? The history is kept.',
    '„{p}" löschen?\n\nDabei werden auch {n} Mittel und {w} Messwert(e) von {p} gelöscht.':'Delete “{p}”?\n\nThis also deletes {n} item(s) and {w} reading(s) of {p}.',
    'letzte Einnahme':'last dose', 'Erinnert an deine Einnahmen':'Reminds you of your doses',
    'Solange der Plan läuft (Start bis Ende), fragt Dosia beim ersten Abhaken am Tag nach dem Gewicht – höchstens einmal täglich.':
      'While the plan is running (start to end), Dosia asks for the weight at the first check-off of the day – at most once a day.',
    'Für besonders wichtige Einnahmen: Die Erinnerung klingelt bildschirmfüllend mit Wecker-Ton – auch bei gesperrtem Handy –, bis du „Genommen" oder „Später" tippst.':
      'For especially important doses: the reminder rings full-screen with an alarm sound – even on a locked phone – until you tap “Taken” or “Later”.',
    '<b>An:</b> Hast du eine Dosis nicht mit ✓ bestätigt oder übersprungen, erinnert Dosia im gewählten Abstand noch einmal. Spätestens bei der nächsten Einnahme desselben Mittels (höchstens 24 Std.) ist Schluss. <b>Aus:</b> nur eine Erinnerung pro Einnahme.':
      '<b>On:</b> if you haven’t confirmed a dose with ✓ or skipped it, Dosia reminds you again at the chosen interval – until the next dose of the same item at the latest (max. 24 h). <b>Off:</b> only one reminder per dose.',
    'In jeder Benachrichtigung: <b>„✓ Genommen“</b> hakt die Dosis ab, <b>„⏰ In 10 Min.“</b> erinnert dich zehn Minuten später noch einmal. Den <b>Wecker-Modus</b> (klingelt bildschirmfüllend) schaltest du beim einzelnen Eintrag ein.':
      'In every notification: <b>“✓ Taken”</b> checks off the dose, <b>“⏰ In 10 min”</b> reminds you again ten minutes later. <b>Alarm mode</b> (rings full-screen) is turned on per entry.',
    'Verwaltest du Erinnerungen für mehrere – z. B. ein Kind, die Eltern oder dein Haustier –, lege hier je eine Person oder ein Tier an. Mittel und Messwerte werden dann getrennt geführt, oben in jeder Ansicht kannst du filtern, und die Erinnerung sagt, für wen die Dosis ist.':
      'If you manage reminders for several people or pets – e.g. a child, your parents or your dog – add each one here. Items and readings are then kept separately, you can filter at the top of every view, and the reminder tells you who the dose is for.',
    'Löscht <b>alle</b> Einträge, Einnahmen, Messwerte, Personen und Einstellungen auf diesem Handy und stoppt alle Erinnerungen. Lässt sich nicht rückgängig machen – exportiere vorher ein Backup. Eine Sicherung in Google Drive bleibt erhalten.':
      'Deletes <b>all</b> entries, doses, readings, people and settings on this phone and stops all reminders. This cannot be undone – export a backup first. A Google Drive backup is kept.',
    // 1.7.1 – Uhrzeiten schnell ausfüllen
    'Schnell ausfüllen: mehrmals täglich oder alle X Stunden':'Quick fill: several times a day or every X hours',
    'Wie oft am Tag?':'How often a day?', '… oder in festem Abstand':'… or at a fixed interval',
    'alle {h} Std.':'every {h} h', 'Erste Einnahme':'First dose', 'Letzte spätestens':'Last dose by',
    'Auch nachts (rund um die Uhr)':'Also at night (around the clock)',
    'Tippe an, wie oft. Die Uhrzeiten werden zwischen erster und letzter Einnahme verteilt und unten eingetragen – dort kannst du jede noch einzeln ändern.':
      'Tap how often. The times are spread between the first and last dose and filled in below – you can still change each one there.',
    '1 Einnahme am Tag':'1 dose a day', '{n} Einnahmen am Tag':'{n} doses a day',
    'Auch nachts – du wirst rund um die Uhr erinnert.':'Also at night – you will be reminded around the clock.',
    'Nach {last} kommt nichts mehr, weiter geht es am nächsten Morgen um {first}.':'Nothing after {last}; it continues the next morning at {first}.',
    'Gleichmäßig verteilt von {first} bis {last}.':'Evenly spread from {first} to {last}.',

  };

  function t(s, vars){
    let r = lang === 'en' && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s;
    if(vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return r;
  }
  return {
    t,
    get lang(){ return lang; },
    get pref(){ return pref(); },
    get locale(){ return lang === 'en' ? 'en-GB' : 'de-DE'; },
    set(v){ try{ localStorage.setItem(KEY, v); }catch{} lang = v === 'auto' ? detect() : v; document.documentElement.lang = lang; },
  };
})();
const t = I18N.t;
document.documentElement.lang = I18N.lang;
