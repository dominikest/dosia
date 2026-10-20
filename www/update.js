/* Dosia – Selbst-Update der Homepage-Variante.
   Prüft window.DOSIA_UPDATE_URL (version.php der Homepage), zeigt "Update verfügbar" und
   lädt/installiert über das native Plugin "AppUpdate". In der Play-Store-Variante und im
   Browser ist die Funktion unsichtbar (Updates kommen dort über Google Play bzw. die Website).
   Wird VOR app.js geladen; greift erst zur Laufzeit auf APP_VERSION/render/... zu. */
'use strict';

const Updater = (() => {
  const STATE_KEY = 'dosia.update.v1';
  const CHECK_EVERY_MS = 6 * 3600 * 1000;       // automatisch höchstens alle 6 Stunden
  const defaults = () => ({ auto:true, lastCheck:0, latest:null, dismissed:'' });
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

  async function init(){
    if(!plugin()) return;
    try{ info = await plugin().getInfo(); }catch{ info = null; }
    if(!enabled()) return;
    if(state.auto && Date.now() - state.lastCheck > CHECK_EVERY_MS){
      try{ await check(); }catch{ /* offline – später erneut */ }
      rerender();
    }
  }
  // Beim Zurückkehren in die App gelegentlich prüfen
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible' && enabled() && state.auto && Date.now()-state.lastCheck > CHECK_EVERY_MS)
      check().then(rerender).catch(()=>{});
  });

  async function check(){
    const res = await fetch(window.DOSIA_UPDATE_URL + (window.DOSIA_UPDATE_URL.includes('?')?'&':'?') + 't=' + Date.now(),
                            { headers:{ 'Accept':'application/json' } });
    if(!res.ok) throw new Error('Update-Server antwortet mit ' + res.status);
    const j = await res.json();
    if(!j || !/^\d+\.\d+\.\d+$/.test(j.version||'') || !/^https:\/\//.test(j.url||'')) throw new Error('Ungültige Antwort vom Update-Server');
    state.latest = { version:j.version, url:j.url, sha256:j.sha256||'', size:j.size||0, date:j.date||'', notes:Array.isArray(j.notes)?j.notes.slice(0,8):[] };
    state.lastCheck = Date.now();
    save();
    return available();
  }

  function rerender(){ if(typeof render==='function') render(); }
  const mb = n => n ? (n/1048576).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' MB' : '';
  const notesHtml = (n, max) => (n||[]).slice(0,max).map(x=>`<li>${esc(x)}</li>`).join('');

  /* ---------- Installation ---------- */
  async function install(){
    if(busy || !available()) return;
    info = await plugin().getInfo().catch(()=>info);
    if(!info || !info.canInstall){
      // Einmalig: Android muss Dosia das Installieren von Updates erlauben
      if(confirm('Damit Dosia Updates installieren kann, muss Android das einmalig erlauben.\n\nTippe gleich bei „Dosia" auf „Aus dieser Quelle zulassen", kehre dann zurück und tippe erneut auf „Jetzt aktualisieren".')){
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
    if(c==='CHECKSUM') return 'Die Datei kam beschädigt an. Bitte noch einmal versuchen.';
    if(c==='INVALID_APK' || c==='NOT_NEWER') return 'Die Datei auf der Homepage passt nicht zu dieser App.';
    if(/Unable to resolve|timeout|failed to connect|network/i.test((e && e.message)||'')) return 'Keine Internetverbindung.';
    return (e && e.message) || 'Das Update ist fehlgeschlagen.';
  }
  function showProgress(done){
    const p = progress==null || progress<0 ? '' : progress + ' %';
    openModal(`<div class="modal-head"><h3>Update auf ${esc(state.latest.version)}</h3></div>
      <div class="sub">${done ? 'Android fragt jetzt, ob das Update installiert werden soll – tippe auf <b>„Installieren"</b>. Deine Daten bleiben erhalten.' : 'Wird heruntergeladen und geprüft …'}</div>
      <div class="bar" style="margin-top:14px"><i style="width:${Math.max(0,progress||0)}%"></i></div>
      <div class="sub" style="margin-top:6px">${p}</div>
      ${done ? `<div class="actions" style="margin-top:14px"><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>` : ''}`);
  }
  function showError(){
    openModal(`<div class="modal-head"><h3>Update nicht möglich</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>
      <div class="notice">${esc(error)}</div>
      <div class="actions" style="margin-top:12px"><button class="btn-primary btn-sm" onclick="updAct.install()">Erneut versuchen</button></div>`);
  }

  /* ---------- Oberfläche ---------- */
  // Karte oben auf "Heute"
  function todayCard(){
    if(!enabled() || !available() || state.dismissed===state.latest.version) return '';
    const l = state.latest;
    return `<div class="card" style="border-color:var(--brand)"><div class="row">
        <div class="pill">⬆️</div>
        <div class="grow"><div class="title">Update verfügbar: Dosia ${esc(l.version)}</div>
          <div class="sub">Installiert: ${esc(current())}${l.size?' · '+mb(l.size):''}</div></div></div>
      ${l.notes.length?`<ul class="sub" style="margin:8px 0 0;padding-left:20px">${notesHtml(l.notes,3)}</ul>`:''}
      <div class="actions" style="margin-top:10px">
        <button class="btn-primary btn-sm" onclick="updAct.install()">Jetzt aktualisieren</button>
        <button class="btn-ghost btn-sm" onclick="updAct.later()">Später</button>
      </div></div>`;
  }
  // Karte unter "Mehr"
  function moreCard(){
    if(!enabled()) return '';
    const l = state.latest, upd = available();
    return `<div class="card"><div class="title">App-Updates</div>
      <div class="sub">Installiert: <b>${esc(current())}</b>${l?` · Neueste: <b>${esc(l.version)}</b>`:''}${state.lastCheck?` · geprüft ${new Date(state.lastCheck).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''}</div>
      ${upd && l.notes.length?`<ul class="sub" style="margin:8px 0 0;padding-left:20px">${notesHtml(l.notes,6)}</ul>`:''}
      <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
        <input type="checkbox" ${state.auto?'checked':''} onchange="updAct.toggleAuto(this.checked)"> Automatisch nach Updates suchen</label>
      <div class="actions" style="margin-top:10px">
        ${upd?`<button class="btn-primary btn-sm" onclick="updAct.install()">Auf ${esc(l.version)} aktualisieren</button>`:''}
        <button class="btn-ghost btn-sm" onclick="updAct.checkNow()">Nach Updates suchen</button>
      </div></div>`;
  }

  window.updAct = {
    install: () => install(),
    later: () => { state.dismissed = state.latest ? state.latest.version : ''; save(); rerender(); },
    toggleAuto: v => { state.auto = !!v; save(); },
    checkNow: async () => {
      try{
        const neu = await check();
        alert(neu ? `Dosia ${state.latest.version} ist verfügbar.` : `Du hast die neueste Version (${current()}).`);
      }catch(e){ alert('Keine Verbindung zum Update-Server. Bitte später noch einmal versuchen.'); }
      rerender();
    },
  };

  return { init, todayCard, moreCard };
})();
