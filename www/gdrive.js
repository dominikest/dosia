/* Dosia – Sicherung in Google Drive.
   Die Daten liegen als eine Datei im versteckten App-Ordner ("appDataFolder") im
   Google Drive des Nutzers. Dosia hat nur Zugriff auf diesen Ordner (Scope drive.appdata),
   nicht auf andere Drive-Dateien. Es gibt keinen eigenen Server.
   Wird VOR app.js geladen; greift erst zur Laufzeit auf DB/render/... aus app.js zu. */
'use strict';

const GDrive = (() => {
  const STATE_KEY = 'dosia.gdrive.v1';
  const FILE_NAME = 'dosia-backup.json';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const AUTO_DELAY_MS = 8000;      // nach der letzten Aenderung so lange warten, dann sichern
  const DAILY_MS = 24 * 3600 * 1000;

  const defaults = () => ({ connected:false, email:'', lastBackup:0, auto:true, fileId:'', error:'' });
  let state = loadState();
  let busy = false;
  let autoTimer = null;

  function loadState(){
    try{ return Object.assign(defaults(), JSON.parse(localStorage.getItem(STATE_KEY) || '{}')); }
    catch{ return defaults(); }
  }
  function saveState(){ try{ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }catch{} }

  const plugin = () => { const C = window.Capacitor; return (C && C.Plugins && C.Plugins.GoogleDrive) || null; };
  const isApp = () => !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  const available = () => isApp() && !!plugin();

  // Verstaendliche Fehlermeldungen
  function message(e){
    const code = (e && e.code) || '';
    if(code === 'API_10') return 'Google-Anmeldung ist für diese App noch nicht freigeschaltet (OAuth-Client in der Google Cloud Console fehlt oder der SHA-1-Fingerabdruck passt nicht).';
    if(code === 'API_7' || /network|Failed to fetch|Unable to resolve/i.test(e && e.message || '')) return 'Keine Internetverbindung.';
    if(code === 'CANCELED') return 'Anmeldung abgebrochen.';
    if(code === 'CONSENT_REQUIRED') return 'Automatische Sicherung fehlgeschlagen: Google möchte den Zugriff neu bestätigt haben. Tippe auf „Jetzt sichern".';
    if(e && e.status === 401) return 'Zugriff abgelaufen. Bitte erneut mit Google verbinden.';
    if(e && e.status === 403) return 'Google Drive hat den Zugriff verweigert (ist die Drive-API im Cloud-Projekt aktiviert?).';
    return (e && e.message) ? e.message : 'Unbekannter Fehler.';
  }

  async function getToken(interactive){
    const r = await plugin().authorize({ interactive });
    return r.accessToken;
  }

  async function call(method, url, token, body, contentType){
    const headers = { Authorization: 'Bearer ' + token };
    if(contentType) headers['Content-Type'] = contentType;
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    if(!res.ok){
      const err = new Error('Google Drive meldet Fehler ' + res.status + '.');
      err.status = res.status; err.detail = text.slice(0, 300);
      throw err;
    }
    if(!text) return null;
    try{ return JSON.parse(text); }catch{ return text; }
  }

  async function findBackup(token){
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const r = await call('GET', `${API}/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime,size)`, token);
    return (r && r.files && r.files[0]) || null;
  }

  function dbIsEmpty(db){
    return !(db && ((db.meds && db.meds.length) || (db.measures && db.measures.length) || (db.intake && Object.keys(db.intake).length)));
  }

  async function upload(token, existingId){
    const payload = JSON.stringify({ app:'dosia', format:1, version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'), savedAt: Date.now(), db: DB });
    if(existingId){
      return call('PATCH', `${UPLOAD}/files/${existingId}?uploadType=media&fields=id,modifiedTime`, token, payload, 'application/json');
    }
    const b = 'dosia' + Date.now();
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
               + `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${payload}\r\n--${b}--`;
    return call('POST', `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, token, body, `multipart/related; boundary=${b}`);
  }

  /* ---------------- oeffentliche Funktionen ---------------- */

  // Sichern. Schutz: eine leere App ueberschreibt nie eine vorhandene Sicherung.
  async function backupNow({ interactive = false } = {}){
    const token = await getToken(interactive);
    const remote = await findBackup(token);
    if(remote && dbIsEmpty(DB)) return { skipped:true };
    const res = await upload(token, remote ? remote.id : '');
    state.fileId = (res && res.id) || state.fileId;
    state.lastBackup = Date.now();
    state.error = '';
    saveState();
    return { skipped:false };
  }

  async function fetchBackup(token){
    const remote = await findBackup(token);
    if(!remote) return null;
    const data = await call('GET', `${API}/files/${remote.id}?alt=media`, token);
    const p = typeof data === 'string' ? JSON.parse(data) : data;
    if(!p || p.app !== 'dosia' || !p.db || !Array.isArray(p.db.meds)) throw new Error('Die Sicherung in Google Drive ist ungültig.');
    return { payload: p, modified: remote.modifiedTime };
  }

  function fmt(ts){
    return new Date(ts).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  async function connect(){
    const token = await getToken(true);
    let email = '';
    try{
      const about = await call('GET', `${API}/about?fields=user(emailAddress)`, token);
      email = (about && about.user && about.user.emailAddress) || '';
    }catch{ /* E-Mail ist nur Anzeige */ }
    state.connected = true; state.email = email; state.error = '';
    saveState();

    // Gibt es schon eine Sicherung? Dann zuerst fragen, bevor irgendetwas ueberschrieben wird.
    const found = await fetchBackup(token);
    if(found){
      const when = fmt(found.payload.savedAt || Date.parse(found.modified));
      const msg = dbIsEmpty(DB)
        ? `In Google Drive gibt es eine Sicherung vom ${when}.\n\nJetzt wiederherstellen?`
        : `In Google Drive gibt es bereits eine Sicherung vom ${when}.\n\nOK = Sicherung wiederherstellen (ersetzt die Daten auf diesem Gerät)\nAbbrechen = Daten dieses Geräts behalten – sie ersetzen dann die Sicherung.`;
      if(confirm(msg)){
        replaceDB(found.payload.db, { skipBackup:true });
        state.lastBackup = found.payload.savedAt || Date.now();
        saveState();
        return 'restored';
      }
    }
    const r = await backupNow();
    return r.skipped ? 'kept' : 'backedup';
  }

  async function restore(){
    const token = await getToken(true);
    const found = await fetchBackup(token);
    if(!found) throw new Error('In Google Drive wurde noch keine Sicherung gefunden.');
    const when = fmt(found.payload.savedAt || Date.parse(found.modified));
    if(!confirm(`Sicherung vom ${when} wiederherstellen?\n\nDie Daten auf diesem Gerät werden dabei ersetzt.`)) return false;
    replaceDB(found.payload.db, { skipBackup:true });
    return true;
  }

  async function disconnect(){
    // Zugriff bei Google widerrufen (best effort) und lokal vergessen. Die Sicherung bleibt in Drive.
    try{
      const token = await getToken(false);
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token),
        { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' } });
    }catch{}
    state = defaults();
    saveState();
  }

  // Von saveDB() aufgerufen: nach Aenderungen verzoegert automatisch sichern
  function scheduleAuto(){
    if(!state.connected || !state.auto || !available()) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(async () => {
      try{ await backupNow({ interactive:false }); }
      catch(e){ state.error = message(e); saveState(); }
      if(typeof currentTab !== 'undefined' && currentTab === 'more') render();
    }, AUTO_DELAY_MS);
  }

  // Beim App-Start: spaetestens alle 24 h eine Sicherung
  function onStart(){
    if(state.connected && state.auto && available() && Date.now() - state.lastBackup > DAILY_MS) scheduleAuto();
  }

  /* ---------------- Oberflaeche (Karte unter "Mehr") ---------------- */
  function cardHtml(){
    let h = `<div class="title">Sicherung in Google Drive</div>`;
    if(!isApp()){
      return h + `<div class="sub">Nur in der Android-App verfügbar. In der Browser-Version kannst du unten ein Backup exportieren.</div>`;
    }
    if(!plugin()){
      return h + `<div class="sub">In dieser App-Version nicht verfügbar.</div>`;
    }
    if(!state.connected){
      return h + `<div class="sub">Sichert deine Dosia-Daten in einem versteckten App-Ordner in <b>deinem</b> Google Drive. Dosia sieht dort nur die eigene Sicherung, nicht deine anderen Dateien. So kannst du nach einem Handywechsel alles wiederherstellen.</div>
        ${state.error ? `<div class="notice">${esc(state.error)}</div>` : ''}
        <div class="actions" style="margin-top:10px"><button class="btn-primary btn-sm" ${busy?'disabled':''} onclick="gdAct.connect()">${busy?'Bitte warten …':'Mit Google verbinden'}</button></div>`;
    }
    return h + `<div class="sub">Verbunden${state.email ? ' mit <b>'+esc(state.email)+'</b>' : ''}.<br>
        Letzte Sicherung: ${state.lastBackup ? fmt(state.lastBackup) : 'noch keine'}</div>
      ${state.error ? `<div class="notice">${esc(state.error)}</div>` : ''}
      <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
        <input type="checkbox" ${state.auto?'checked':''} onchange="gdAct.toggleAuto(this.checked)"> Nach Änderungen automatisch sichern</label>
      <div class="actions" style="margin-top:10px">
        <button class="btn-primary btn-sm" ${busy?'disabled':''} onclick="gdAct.backup()">${busy?'Bitte warten …':'Jetzt sichern'}</button>
        <button class="btn-ghost btn-sm" ${busy?'disabled':''} onclick="gdAct.restore()">Wiederherstellen</button>
        <button class="btn-danger btn-sm" ${busy?'disabled':''} onclick="gdAct.disconnect()">Trennen</button>
      </div>
      <div class="hint">Sicherung, kein Live-Abgleich: Nutzt du Dosia auf zwei Geräten, gilt jeweils die zuletzt gespeicherte Sicherung.</div>`;
  }

  async function run(fn, okMsg){
    if(busy) return;
    busy = true; render();
    try{
      const r = await fn();
      if(okMsg){ const m = typeof okMsg === 'function' ? okMsg(r) : okMsg; if(m) alert(m); }
    }catch(e){
      state.error = message(e); saveState();
      alert(state.error);
    }finally{
      busy = false; render();
    }
  }

  window.gdAct = {
    connect: () => run(connect, r => r === 'restored' ? 'Sicherung wiederhergestellt.'
                                   : r === 'kept' ? 'Verbunden. Die vorhandene Sicherung in Google Drive bleibt unverändert, bis du hier Daten einträgst.'
                                   : 'Verbunden. Deine Daten wurden in Google Drive gesichert.'),
    backup:  () => run(async () => (await backupNow({ interactive:true })),
                       r => r && r.skipped ? 'Es wurde nichts gesichert: Die App enthält noch keine Daten und eine vorhandene Sicherung soll nicht überschrieben werden.' : 'In Google Drive gesichert.'),
    restore: () => run(restore, r => r ? 'Sicherung wiederhergestellt.' : ''),
    disconnect: () => { if(confirm('Verbindung zu Google trennen?\n\nDie letzte Sicherung bleibt in deinem Google Drive erhalten.')) run(disconnect, 'Verbindung getrennt.'); },
    toggleAuto: v => { state.auto = !!v; saveState(); if(v) scheduleAuto(); },
  };

  return { scheduleAuto, onStart, cardHtml, available };
})();
