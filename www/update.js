/* Dosia – Selbst-Update der Homepage-Variante.
   Prüft window.DOSIA_UPDATE_URL (version.php der Homepage), zeigt "Update verfügbar" und
   lädt/installiert über das native Plugin "AppUpdate". In der Play-Store-Variante und im
   Browser ist die Funktion unsichtbar (Updates kommen dort über Google Play bzw. die Website).
   Wird VOR app.js geladen; greift erst zur Laufzeit auf APP_VERSION/render/... zu. */
'use strict';

const Updater = (() => {
  const STATE_KEY = 'dosia.update.v1';
  const CHECK_ON_START_MS = 5 * 60 * 1000;      // beim App-Start prüfen (nicht öfter als alle 5 Min.)
  const CHECK_ON_RESUME_MS = 3600 * 1000;       // beim Zurückkehren in die App höchstens stündlich
  // support = Antwort des Servers zur Versionssperre: { status:'ok'|'warning'|'blocked', blockedFrom, message, forVersion }
  const defaults = () => ({ auto:true, lastCheck:0, latest:null, dismissed:'', support:null });
  let state = load();
  let info = null;           // { selfUpdate, flavor, canInstall } vom Plugin
  let busy = false, progress = null, error = '';

  function load(){ try{ return Object.assign(defaults(), JSON.parse(localStorage.getItem(STATE_KEY)||'{}')); }catch{ return defaults(); } }
  function save(){ try{ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }catch{} }
  const plugin = () => { const C=window.Capacitor; return (C && C.Plugins && C.Plugins.AppUpdate) || null; };
  const vcode = v => { const p=String(v||'').split('.').map(n=>parseInt(n,10)||0); return (p[0]||0)*10000+(p[1]||0)*100+(p[2]||0); };
  const current = () => (typeof APP_VERSION!=='undefined' ? APP_VERSION : '0.0.0');

  const enabled = () => !!(info && info.selfUpdate && window.DOSIA_UPDATE_URL);
  const available = () => !!(state.latest && vcode(state.latest.version) > vcode(current()));

  // Versionssperre gilt nur für genau die Version, für die der Server sie gemeldet hat (nach einem Update verfällt sie)
  const support = () => (state.support && state.support.forVersion===current()) ? state.support : null;
  const blockedNow = () => {
    const s = support(); if(!enabled() || !s) return false;
    if(s.status==='blocked') return true;
    // Hinweis-Phase abgelaufen? Dann auch offline sperren
    return s.status==='warning' && s.blockedFrom && todayKey() >= s.blockedFrom;
  };
  const warningNow = () => { const s=support(); return enabled() && !!s && s.status==='warning' && !blockedNow(); };

  // Prüfung läuft immer (auch wenn der Update-Hinweis abgeschaltet ist) – sonst ließe sich die Sperre umgehen.
  // Bei jedem App-Start; beim Zurückkehren stündlich, bei Hinweis/Sperre alle 10 Min.
  const due = (minAge) => { const age = Date.now() - state.lastCheck;
    return enabled() && (age > minAge || (!!support() && age > 10*60000)); };
  async function init(){
    if(!plugin()) return;
    try{ info = await plugin().getInfo(); }catch{ info = null; }
    if(!enabled()) return;
    if(blockedNow()) rerender();                 // gemerkte Sperre sofort anzeigen (auch offline)
    if(due(CHECK_ON_START_MS)){
      try{ await check(); }catch{ /* offline – später erneut */ }
      rerender();
    }
  }
  // Beim Zurückkehren in die App gelegentlich prüfen
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible' && due(CHECK_ON_RESUME_MS)) check().then(rerender).catch(()=>{});
  });

  // Anonyme Nutzungszählung: Aus dem Zeitpunkt der letzten Prüfung (wird für die Update-Suche ohnehin gemerkt)
  // ergibt sich, ob dies die erste Prüfung heute / diese Woche / diesen Monat ist. Der Server zählt nur hoch –
  // keine Geräte-ID, nichts Zusätzliches gespeichert. Abschaltbar unter "Mehr → App-Updates".
  const dayKey = d => todayKey(d);
  const weekKey = d => { const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return todayKey(x); };   // Montag der Woche
  const monthKey = d => todayKey(d).slice(0,7);
  function usageFlags(){
    if(state.stats === false) return '';
    const now = new Date(), last = state.lastCheck ? new Date(state.lastCheck) : null;
    let f = '';
    if(!last) f += '&n=1';                                         // erste Prüfung überhaupt (neu installiert)
    if(!last || dayKey(last)   !== dayKey(now))   f += '&d=1';
    if(!last || weekKey(last)  !== weekKey(now))  f += '&w=1';
    if(!last || monthKey(last) !== monthKey(now)) f += '&m=1';
    return f;
  }

  async function check(){
    const base = window.DOSIA_UPDATE_URL;
    const res = await fetch(base + (base.includes('?')?'&':'?') + 'v=' + encodeURIComponent(current()) + '&lang=' + I18N.lang + usageFlags() + '&t=' + Date.now(),
                            { headers:{ 'Accept':'application/json' } });
    if(!res.ok) throw new Error('Update-Server antwortet mit ' + res.status);
    const j = await res.json();
    if(!j || !/^\d+\.\d+\.\d+$/.test(j.version||'') || !/^https:\/\//.test(j.url||'')) throw new Error('Ungültige Antwort vom Update-Server');
    state.latest = { version:j.version, url:j.url, sha256:j.sha256||'', size:j.size||0, date:j.date||'', notes:Array.isArray(j.notes)?j.notes.slice(0,8):[] };
    const s = j.support;
    state.support = (s && (s.status==='warning' || s.status==='blocked'))
      ? { status:s.status, blockedFrom:s.blockedFrom||'', message:String(s.message||'').slice(0,500), forVersion:current() }
      : null;
    state.lastCheck = Date.now();
    save();
    return available();
  }

  function rerender(){ if(typeof render==='function') render(); }
  const mb = n => n ? (n/1048576).toLocaleString(I18N.locale,{maximumFractionDigits:1}) + ' MB' : '';
  const notesHtml = (n, max) => (n||[]).slice(0,max).map(x=>`<li>${esc(x)}</li>`).join('');

  /* ---------- Installation ---------- */
  async function install(){
    if(busy || !available()) return;
    info = await plugin().getInfo().catch(()=>info);
    if(!info || !info.canInstall){
      // Einmalig: Android muss Dosia das Installieren von Updates erlauben
      if(confirm(t('Damit Dosia Updates installieren kann, muss Android das einmalig erlauben.\n\nTippe gleich bei „Dosia" auf „Aus dieser Quelle zulassen", kehre dann zurück und tippe erneut auf „Jetzt aktualisieren".'))){
        try{ await plugin().openInstallSettings(); }catch{}
      }
      return;
    }
    busy = true; progress = 0; error = '';
    showProgress();
    let sub = null;
    try{
      sub = await plugin().addListener('downloadProgress', p => { progress = p.percent; showProgress(); });
      await plugin().downloadAndInstall({ url: state.latest.url, sha256: state.latest.sha256 });
      // Jetzt zeigt Android den Installationsdialog; nach "Installieren" startet Dosia neu.
      progress = 100; showProgress(true);
    }catch(e){
      error = errorText(e);
      if(e && e.code==='NEED_PERMISSION'){ busy=false; closeModal(); return install(); }
      showError();
    }finally{
      busy = false;
      try{ sub && sub.remove(); }catch{}
    }
  }
  function errorText(e){
    const c = e && e.code;
    if(c==='CHECKSUM') return t('Die Datei kam beschädigt an. Bitte noch einmal versuchen.');
    if(c==='INVALID_APK' || c==='NOT_NEWER') return t('Die Datei auf der Homepage passt nicht zu dieser App.');
    if(/Unable to resolve|timeout|failed to connect|network/i.test((e && e.message)||'')) return t('Keine Internetverbindung.');
    return (e && e.message) || t('Das Update ist fehlgeschlagen.');
  }
  function showProgress(done){
    const p = progress==null || progress<0 ? '' : progress + ' %';
    openModal(`<div class="modal-head"><h3>${t('Update auf {v}',{v:esc(state.latest.version)})}</h3></div>
      <div class="sub">${done ? t('Android fragt jetzt, ob das Update installiert werden soll – tippe auf <b>„Installieren"</b>. Deine Daten bleiben erhalten.') : t('Wird heruntergeladen und geprüft …')}</div>
      <div class="bar" style="margin-top:14px"><i style="width:${Math.max(0,progress||0)}%"></i></div>
      <div class="sub" style="margin-top:6px">${p}</div>
      ${done ? `<div class="actions" style="margin-top:14px"><button class="btn-ghost btn-sm" onclick="act.closeModal()">${t('Schließen')}</button></div>` : ''}`);
  }
  function showError(){
    openModal(`<div class="modal-head"><h3>${t('Update nicht möglich')}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">${t('Schließen')}</button></div>
      <div class="notice">${esc(error)}</div>
      <div class="actions" style="margin-top:12px"><button class="btn-primary btn-sm" onclick="updAct.install()">${t('Erneut versuchen')}</button></div>`);
  }

  /* ---------- Oberfläche ---------- */
  const fmtDay = d => { try{ return new Date(d+'T00:00').toLocaleDateString(I18N.locale,{weekday:'long',day:'numeric',month:'long'}); }catch{ return d; } };

  // Ganze Ansicht ersetzt, wenn diese Version gesperrt ist
  function blockScreen(){
    const s = support() || {}, l = state.latest, upd = available();
    return `<div class="card" style="border-color:var(--danger);margin-top:8px">
      <div style="font-size:40px;line-height:1">⛔</div>
      <div class="title" style="font-size:19px;margin-top:8px;white-space:normal">${t('Diese Version wird nicht mehr unterstützt')}</div>
      <div class="sub" style="margin-top:6px">${t('Installiert ist Dosia <b>{v}</b>. Bitte aktualisiere auf die neueste Version{n}, um Dosia weiter zu nutzen. Deine Daten bleiben dabei erhalten.',{v:esc(current()),n:upd?` (<b>${esc(l.version)}</b>)`:''})}</div>
      ${s.message?`<div class="hint">${esc(s.message)}</div>`:''}
      ${upd && l.notes.length?`<ul class="sub" style="margin:10px 0 0;padding-left:20px">${notesHtml(l.notes,4)}</ul>`:''}
      <div class="actions" style="margin-top:14px;flex-direction:column;align-items:stretch">
        ${upd?`<button class="btn-primary" onclick="updAct.install()">${t('Jetzt aktualisieren')}</button>`
             :`<div class="notice">${t('Gerade ist keine neuere Version zum Herunterladen verfügbar. Bitte versuche es später noch einmal.')}</div>`}
        <button class="btn-ghost" onclick="updAct.checkNow()">${t('Erneut prüfen')}</button>
        <button class="btn-ghost" onclick="act.exportData()">${t('Backup exportieren')}</button>
      </div>
      <div class="sub" style="margin-top:12px">${t('Bereits geplante Erinnerungen laufen vorerst weiter.')}</div>
    </div>`;
  }

  // Karte oben auf "Heute"
  function todayCard(){
    if(!enabled()) return '';
    // Hinweis-Phase: nicht wegklickbar, mit Datum der Sperre
    if(warningNow()){
      const s = support(), l = state.latest, upd = available();
      return `<div class="card" style="border-color:var(--warn)"><div class="row">
          <div class="pill">⚠️</div>
          <div class="grow"><div class="title" style="white-space:normal">${t('Bitte aktualisieren')}</div>
            <div class="sub">${t('Dosia {v} funktioniert nur noch bis <b>{d}</b>.',{v:esc(current()),d:esc(fmtDay(s.blockedFrom))})}${upd?' '+t('Neu: {v}.',{v:esc(l.version)}):''}</div></div></div>
        ${s.message?`<div class="hint">${esc(s.message)}</div>`:''}
        ${upd?`<div class="actions" style="margin-top:10px"><button class="btn-primary btn-sm" onclick="updAct.install()">${t('Jetzt aktualisieren')}</button></div>`:''}
      </div>`;
    }
    if(!state.auto || !available() || state.dismissed===state.latest.version) return '';
    const l = state.latest;
    return `<div class="card" style="border-color:var(--brand)"><div class="row">
        <div class="pill">⬆️</div>
        <div class="grow"><div class="title">${t('Update verfügbar: Dosia {v}',{v:esc(l.version)})}</div>
          <div class="sub">${t('Installiert: {v}',{v:esc(current())})}${l.size?' · '+mb(l.size):''}</div></div></div>
      ${l.notes.length?`<ul class="sub" style="margin:8px 0 0;padding-left:20px">${notesHtml(l.notes,3)}</ul>`:''}
      <div class="actions" style="margin-top:10px">
        <button class="btn-primary btn-sm" onclick="updAct.install()">${t('Jetzt aktualisieren')}</button>
        <button class="btn-ghost btn-sm" onclick="updAct.later()">${t('Später')}</button>
      </div></div>`;
  }
  // Karte unter "Mehr → App"
  function moreCard(){
    if(!enabled()) return '';
    const l = state.latest, upd = available();
    const when = state.lastCheck ? new Date(state.lastCheck).toLocaleString(I18N.locale,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    const sw = (on, fn) => `<label class="sw"><input type="checkbox" ${on?'checked':''} onchange="${fn}(this.checked)"><span></span></label>`;
    return `<div class="card"><div class="title">${t('App-Updates')}</div>
      <div class="sub">${t('Installiert: {v}',{v:'<b>'+esc(current())+'</b>'})}${l?' · '+t('Neueste: {v}',{v:'<b>'+esc(l.version)+'</b>'}):''}${when?` · ${t('zuletzt geprüft {d}',{d:when})}`:''}</div>
      <div class="sub" style="margin-top:4px">${t('Dosia sucht bei jedem Start und beim Zurückkehren in die App (höchstens stündlich) auf dosia24.de nach einer neuen Version. Installiert wird nur, wenn du auf „Aktualisieren“ tippst – deine Daten bleiben dabei erhalten.')}</div>
      ${upd && l.notes.length?`<ul class="sub" style="margin:8px 0 0;padding-left:20px">${notesHtml(l.notes,6)}</ul>`:''}
      <div class="actions" style="margin:10px 0 4px">
        ${upd?`<button class="btn-primary btn-sm" onclick="updAct.install()">${t('Auf {v} aktualisieren',{v:esc(l.version)})}</button>`:''}
        <button class="btn-ghost btn-sm" onclick="updAct.checkNow()">${t('Jetzt nach Updates suchen')}</button>
      </div>
      <div class="set"><div class="txt"><div class="name">${t('Hinweis auf „Heute“')}</div>
        <div class="desc">${t('<b>An:</b> Gibt es eine neue Version, erscheint oben auf „Heute“ eine Karte mit „Jetzt aktualisieren“. <b>Aus:</b> keine Karte – neue Versionen siehst du nur hier. Wird deine Version nicht mehr unterstützt, erscheint der Hinweis trotzdem.')}</div></div>
        ${sw(state.auto, 'updAct.toggleAuto')}</div>
      <div class="set"><div class="txt"><div class="name">${t('Anonym mitzählen')}</div>
        <div class="desc">${t('<b>An:</b> Bei der Update-Suche wird höchstens einmal am Tag „heute aktiv“ mitgeschickt. So sehe ich, wie viele Dosia nutzen – ohne Geräte-Kennung, ohne Medikamente oder andere Daten. <b>Aus:</b> nichts davon; die Update-Suche funktioniert genauso.')}</div></div>
        ${sw(state.stats!==false, 'updAct.toggleStats')}</div>
      </div>`;
  }

  window.updAct = {
    install: () => install(),
    later: () => { state.dismissed = state.latest ? state.latest.version : ''; save(); rerender(); },
    toggleAuto: v => { state.auto = !!v; save(); rerender(); },
    toggleStats: v => { state.stats = !!v; save(); },
    checkNow: async () => {
      try{
        const neu = await check();
        alert(neu ? t('Dosia {v} ist verfügbar.',{v:state.latest.version}) : t('Du hast die neueste Version ({v}).',{v:current()}));
      }catch(e){ alert(t('Keine Verbindung zum Update-Server. Bitte später noch einmal versuchen.')); }
      rerender();
    },
  };

  return { init, todayCard, moreCard, blockedNow, blockScreen };
})();
