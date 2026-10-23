/* Dosia – lokale Medikamentenverwaltung (PWA, offline).
   Eigener Code, eigenes Datenmodell. Alle Daten bleiben im Gerät (localStorage). */
'use strict';

/* ---------- Speicher ---------- */
const APP_VERSION = window.DOSIA_VERSION || '?';   // kommt aus version.js (package.json)
const DB_KEY = 'dosia.db.v1';
const defaultDB = () => ({
  version: 2,
  profiles: [{ id:'me', name:t('Ich'), kind:'person' }],   // für wen: Personen oder Tiere
  meds: [],          // {id,profileId,name,form,strength,color,stock,stockThreshold,schedule,notes,interact,trackWeight,createdAt,archived}
  intake: {},        // { "YYYY-MM-DD": { "medId|HH:MM": {status:'taken'|'skipped', ts} } }
  measures: [],      // {id,profileId,medId?,type,value,value2,unit,ts,note}
  // followUpMax: wie oft nachgehakt wird; 0 = bis abgehakt (spätestens bis zur nächsten Einnahme, max. 24 h)
  settings: { notify:false, theme:'auto', medfriend:'', profileFilter:'all', followUp:true, followUpMin:15, followUpMax:0 }
});

// Ältere Datenstände (auch aus Backups) auf das aktuelle Modell bringen
function migrate(d){
  const db = Object.assign(defaultDB(), d || {});
  db.settings = Object.assign(defaultDB().settings, (d && d.settings) || {});
  if(!Array.isArray(db.profiles) || !db.profiles.length) db.profiles = defaultDB().profiles;
  const ids = new Set(db.profiles.map(p=>p.id)), first = db.profiles[0].id;
  for(const m of db.meds){ if(!ids.has(m.profileId)) m.profileId = first; if(m.trackWeight === undefined) m.trackWeight = false; }
  for(const x of db.measures){ if(!ids.has(x.profileId)) x.profileId = first; }
  if(db.settings.profileFilter !== 'all' && !ids.has(db.settings.profileFilter)) db.settings.profileFilter = 'all';
  db.version = 2;
  return db;
}

let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return defaultDB();
    return migrate(JSON.parse(raw));
  }catch(e){ console.warn('DB load failed', e); return defaultDB(); }
}
function saveDB(opts){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch(e){ alert(t('Speichern fehlgeschlagen – evtl. ist der Speicher voll.')); return; }
  // Nach Änderungen automatisch in Google Drive sichern (falls verbunden)
  if(!(opts && opts.skipBackup) && typeof GDrive !== 'undefined') GDrive.scheduleAuto();
}
// Kompletten Datenbestand ersetzen (Backup-Import, Wiederherstellung aus Google Drive)
function replaceDB(d, opts){
  DB = migrate(d);
  saveDB(opts); render(); refreshReminders();
}

/* ---------- Helfer ---------- */
const $ = (s,el=document)=>el.querySelector(s);
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const pad = n=> String(n).padStart(2,'0');
const todayKey = (d=new Date())=> `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtDate = d => d.toLocaleDateString(I18N.locale,{weekday:'long',day:'numeric',month:'long'});
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'].map(d=>t(d)); // getDay(): 0=So
// Zahl aus Eingabe mit Komma oder Punkt ("12,5" / "12.5"); leer/ungültig -> NaN
const parseNum = s => { const t=String(s??'').trim().replace(/\s/g,'').replace(',','.'); return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN; };

const FORMS = [
  {v:'tablette',t:'Tablette',ic:'💊'},{v:'kapsel',t:'Kapsel',ic:'💊'},
  {v:'tropfen',t:'Tropfen',ic:'💧'},{v:'spritze',t:'Spritze/Injektion',ic:'💉'},
  {v:'inhalator',t:'Inhalator',ic:'🫁'},{v:'salbe',t:'Salbe/Creme',ic:'🧴'},
  {v:'saft',t:'Saft',ic:'🥤'},{v:'pflaster',t:'Pflaster',ic:'🩹'},{v:'sonstige',t:'Sonstige',ic:'➕'}
].map(x=>({...x, t:t(x.t)}));
const formIcon = f => (FORMS.find(x=>x.v===f)||{}).ic || '💊';

/* ---------- Profile (Person / Tier) ---------- */
const PROFILE_KINDS = [
  {v:'person',t:'Person',ic:'🧑'},{v:'hund',t:'Hund',ic:'🐶'},{v:'katze',t:'Katze',ic:'🐱'},
  {v:'kaninchen',t:'Kaninchen',ic:'🐰'},{v:'vogel',t:'Vogel',ic:'🐦'},{v:'pferd',t:'Pferd',ic:'🐴'},
  {v:'tier',t:'Anderes Tier',ic:'🐾'}
].map(x=>({...x, t:t(x.t)}));
const kindIcon = k => (PROFILE_KINDS.find(x=>x.v===k)||PROFILE_KINDS[0]).ic;
const profileById = id => DB.profiles.find(p=>p.id===id) || DB.profiles[0];
const profileLabel = p => `${kindIcon(p.kind)} ${esc(p.name)}`;
const multiProfile = () => DB.profiles.length > 1;
// Gilt der aktuelle Profil-Filter (oben in den Ansichten) für dieses Profil?
const inFilter = pid => DB.settings.profileFilter === 'all' || DB.settings.profileFilter === pid;

function profileBar(){
  if(!multiProfile()) return '';
  const f = DB.settings.profileFilter;
  return `<div class="chips pbar">
    <span class="chip ${f==='all'?'on':''}" onclick="act.setProfileFilter('all')">${t('Alle')}</span>
    ${DB.profiles.map(p=>`<span class="chip ${f===p.id?'on':''}" onclick="act.setProfileFilter('${p.id}')">${profileLabel(p)}</span>`).join('')}
  </div>`;
}

/* ---------- Gewicht zum Medikament ---------- */
function weightToday(profileId, key=todayKey()){
  return DB.measures.some(m => m.type==='weight' && m.profileId===profileId && todayKey(new Date(m.ts))===key);
}
const WSKIP_KEY = () => 'dosia.wskip.' + todayKey();
function weightSkipped(pid){ try{ return JSON.parse(localStorage.getItem(WSKIP_KEY())||'[]').includes(pid); }catch{ return false; } }
function markWeightSkipped(pid){ try{ const a=JSON.parse(localStorage.getItem(WSKIP_KEY())||'[]'); a.push(pid); localStorage.setItem(WSKIP_KEY(), JSON.stringify(a)); }catch{} }
// Profile (im Filter), für die heute ein Medikament mit Gewichtserfassung läuft und noch kein Gewicht erfasst ist
function weightDueProfiles(key=todayKey()){
  const due = new Set();
  for(const m of DB.meds){
    if(m.archived || !m.trackWeight || !inFilter(m.profileId)) continue;
    const s = m.schedule || {};
    if((s.start && key < s.start) || (s.end && key > s.end)) continue;
    if(!weightToday(m.profileId, key)) due.add(m.profileId);
  }
  return [...due].map(profileById);
}

/* ---------- Zeitplan-Engine ----------
   schedule = { type:'daily'|'interval'|'weekdays'|'cycle', times:['08:00',...],
                everyDays:n (interval), weekdays:[1,3,5] (weekdays),
                onDays:n,offDays:n,anchor:'YYYY-MM-DD' (cycle),
                start:'YYYY-MM-DD', end:'YYYY-MM-DD'|'' }
*/
function daysBetween(aKey,bKey){
  const a=new Date(aKey+'T00:00'), b=new Date(bKey+'T00:00');
  return Math.round((b-a)/86400000);
}
function isActiveOn(med, dateKey){
  const s = med.schedule||{};
  // Ohne Startdatum gilt der Tag der Anlage als Start – sonst zählten frühere Tage als "nicht genommen"
  const startKey = s.start || (med.createdAt ? todayKey(new Date(med.createdAt)) : '');
  if(startKey && dateKey < startKey) return false;
  if(s.end && dateKey > s.end) return false;
  if(s.type==='interval'){
    const base = s.start || med.createdAt?.slice(0,10) || dateKey;
    const n = Math.max(1, s.everyDays||1);
    const diff = daysBetween(base, dateKey);
    return diff>=0 && diff % n === 0;
  }
  if(s.type==='weekdays'){
    const dow = new Date(dateKey+'T00:00').getDay();
    return (s.weekdays||[]).includes(dow);
  }
  if(s.type==='weeks'){
    // alle X Wochen, gerechnet ab Startdatum (bzw. Anlagetag)
    const n = Math.max(1, s.everyWeeks||1);
    const diff = daysBetween(startKey||dateKey, dateKey);
    return diff>=0 && diff % (7*n) === 0;
  }
  if(s.type==='months'){
    // alle X Monate am selben Tag wie das Startdatum; gibt es den Tag nicht (z. B. 31.), am Monatsletzten
    const n = Math.max(1, s.everyMonths||1);
    const b = new Date((startKey||dateKey)+'T00:00'), d = new Date(dateKey+'T00:00');
    const months = (d.getFullYear()-b.getFullYear())*12 + d.getMonth()-b.getMonth();
    if(months<0 || months % n) return false;
    const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return d.getDate() === Math.min(b.getDate(), lastDay);
  }
  if(s.type==='cycle'){
    const anchor = s.anchor || s.start || med.createdAt?.slice(0,10) || dateKey;
    const on=Math.max(1,s.onDays||1), off=Math.max(0,s.offDays||0);
    const diff = daysBetween(anchor, dateKey);
    if(diff<0) return false;
    return (diff % (on+off)) < on;
  }
  return true; // daily
}
// Alle fälligen Dosen eines Tages: [{medId, time, med}]
function dosesForDay(dateKey){
  const out=[];
  for(const med of DB.meds){
    if(med.archived) continue;
    if(!isActiveOn(med, dateKey)) continue;
    for(const t of (med.schedule?.times||[])){
      out.push({medId:med.id, time:t, med});
    }
  }
  out.sort((a,b)=> a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
  return out;
}
// Dosen eines Tages für die Anzeige (Profil-Filter). Erinnerungen nutzen weiter dosesForDay (alle Profile).
const visibleDoses = dateKey => dosesForDay(dateKey).filter(d => inFilter(d.med.profileId));
function intakeState(dateKey, medId, time){
  return DB.intake[dateKey]?.[medId+'|'+time] || null;
}
function setIntake(dateKey, medId, time, status, ts){
  DB.intake[dateKey] = DB.intake[dateKey]||{};
  const key = medId+'|'+time;
  const prev = DB.intake[dateKey][key];
  if(status===null){
    delete DB.intake[dateKey][key];
    // Bestand zurückgeben, falls vorher genommen
    if(prev?.status==='taken') adjustStock(medId, +1);
  }else{
    DB.intake[dateKey][key] = {status, ts:ts||Date.now()};
    if(status==='taken' && prev?.status!=='taken') adjustStock(medId, -1);
    if(status!=='taken' && prev?.status==='taken') adjustStock(medId, +1);
    if(typeof removeSnooze==='function') removeSnooze(dateKey, medId, time);   // erledigt -> nicht mehr schlummern
  }
  saveDB();
}
function adjustStock(medId, delta){
  const med = DB.meds.find(m=>m.id===medId);
  if(med && typeof med.stock==='number'){
    med.stock = Math.max(0, med.stock + delta);
  }
}

/* ---------- Vorrat ---------- */
// Durchschnittlicher Verbrauch pro Tag laut Einnahmeplan (über ein Jahr, damit auch seltene Rhythmen zählen)
function dosesPerDay(med){
  const days = 365, start = new Date(); start.setHours(0,0,0,0);
  let n = 0;
  for(let d=0; d<days; d++){
    const day = new Date(start); day.setDate(start.getDate()+d);
    if(isActiveOn(med, todayKey(day))) n += (med.schedule?.times||[]).length;
  }
  return n / days;
}
// { daysLeft, until, low } oder null, wenn kein Bestand gepflegt wird
function stockInfo(med){
  if(typeof med.stock!=='number') return null;
  const perDay = dosesPerDay(med);
  const daysLeft = perDay>0 ? Math.floor(med.stock / perDay) : null;
  const until = daysLeft!=null ? new Date(Date.now() + daysLeft*86400000) : null;
  const low = med.stockThreshold>0 && med.stock <= med.stockThreshold;
  return { daysLeft, until, low };
}
const fmtDays = n => n===0 ? t('heute leer') : n===1 ? t('reicht ~1 Tag') : t('reicht ~{n} Tage',{n});

// Nachkauf-Erinnerung: einmal pro "Knapp-Phase"; nach dem Auffüllen (Bestand erhöht) wieder scharf
const RESTOCK_KEY = 'dosia.restock.v1';
function getRestock(){ try{ return JSON.parse(localStorage.getItem(RESTOCK_KEY)||'{}'); }catch{ return {}; } }
function setRestock(o){ try{ localStorage.setItem(RESTOCK_KEY, JSON.stringify(o)); }catch{} }
function clearRestock(medId){ const o=getRestock(); delete o[medId]; setRestock(o); }

/* ---------- Adhärenz-Statistik ---------- */
function adherence(days=7){
  let taken=0, planned=0;
  const now=new Date();
  for(let i=0;i<days;i++){
    const d=new Date(now); d.setDate(now.getDate()-i);
    const key=todayKey(d);
    for(const dose of visibleDoses(key)){
      // Nur vergangene/aktuelle Dosen zählen
      if(key===todayKey() ){
        const [h,m]=dose.time.split(':').map(Number);
        const dt=new Date(); dt.setHours(h,m,0,0);
        if(dt>new Date()) continue;
      }
      planned++;
      if(intakeState(key,dose.medId,dose.time)?.status==='taken') taken++;
    }
  }
  return {taken, planned, pct: planned? Math.round(taken/planned*100):null};
}

/* ======================================================================
   VIEWS
====================================================================== */
const view = $('#view');
let currentTab = 'today';

function render(){
  $('#headerDate').textContent = fmtDate(new Date());
  // Gesperrte App-Version: nur Sperrbildschirm (Update / Backup), keine Bedienung
  const locked = Updater.blockedNow();
  $('#tabs').style.display = locked ? 'none' : '';
  $('#fab').style.display  = locked ? 'none' : '';
  if(locked){ view.innerHTML = Updater.blockScreen(); return; }
  ({today:renderToday, meds:renderMeds, measure:renderMeasure, history:renderHistory, more:renderMore}[currentTab])();
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===currentTab));
}

/* ---- Heute ---- */
function renderToday(){
  const key=todayKey();
  const doses=visibleDoses(key);
  let html = Updater.todayCard() + reliabilityTodayCard() + profileBar() + `<h2 class="section">${t(doses.length===1?'Heute · {n} Dosis':'Heute · {n} Dosen',{n:doses.length})}</h2>`;

  // Gewicht fällig (Medikament mit Gewichtserfassung läuft, heute noch kein Gewicht)
  for(const p of weightDueProfiles(key)){
    html += `<div class="card"><div class="row">
      <div class="pill">⚖️</div>
      <div class="grow"><div class="title">${t('Gewicht')}${multiProfile()?' · '+profileLabel(p):''}</div>
        <div class="sub">${t('Heute noch nicht erfasst')}</div></div>
      <button class="btn-primary btn-sm" onclick="act.weightForm('${p.id}')">${t('Erfassen')}</button>
    </div></div>`;
  }

  // Vorrat knapp
  for(const med of DB.meds.filter(m=>!m.archived && inFilter(m.profileId))){
    const si=stockInfo(med); if(!si || !si.low) continue;
    html += `<div class="card"><div class="row">
      <div class="pill">🛒</div>
      <div class="grow"><div class="title">${t('Nachkaufen: {name}',{name:esc(med.name)})}</div>
        <div class="sub">${multiProfile()?profileLabel(profileById(med.profileId))+' · ':''}${t('noch {n}',{n:med.stock})}${si.daysLeft!=null?' · '+fmtDays(si.daysLeft):''}</div></div>
      <button class="btn-ghost btn-sm" onclick="act.editMed('${med.id}')">${t('Bestand')}</button>
    </div></div>`;
  }

  // Überfällige Dosen (> 2 Std. offen) mit Notfall-Kontakt
  const contact = (DB.settings.medfriend||'').trim();
  if(contact){
    const nowMs = Date.now();
    const overdue = doses.filter(d=>{ const [h,mi]=d.time.split(':').map(Number); const t=new Date(); t.setHours(h,mi,0,0);
      return nowMs - t.getTime() > 2*3600000 && !intakeState(key,d.medId,d.time); });
    if(overdue.length){
      const phone = (contact.match(/\+?\d[\d\s\/().-]{4,}\d/)||[''])[0].replace(/[^\d+]/g,'');
      html += `<div class="card" style="border-color:var(--warn)"><div class="row">
        <div class="pill">⚠️</div>
        <div class="grow"><div class="title">${t('Seit über 2 Std. offen')}</div>
          <div class="sub">${overdue.map(d=>`${esc(d.med.name)} (${d.time})`).join(', ')}</div>
          <div class="sub" style="margin-top:4px">${t('Notfall-Kontakt:')} <b>${esc(contact)}</b></div></div>
      </div>${phone?`<div class="actions" style="margin-top:10px">
        <a class="btn-primary btn-sm" style="text-decoration:none;border-radius:10px;padding:7px 11px" href="tel:${phone}">${t('📞 Anrufen')}</a>
        <a class="btn-ghost btn-sm" style="text-decoration:none;border-radius:10px;padding:7px 11px;color:var(--text)" href="sms:${phone}">${t('💬 SMS')}</a></div>`:''}</div>`;
    }
  }

  if(!doses.length){
    html += `<div class="empty"><div class="big">🗓️</div>${t('Für heute sind keine Einnahmen geplant.')}<br><span class="muted">${t('Lege unter „Medikamente" etwas an.')}</span></div>`;
    view.innerHTML=html; return;
  }

  // Fortschritt
  const takenCount = doses.filter(d=>intakeState(key,d.medId,d.time)?.status==='taken').length;
  html += `<div class="card"><div class="row"><div class="grow">
      <div class="title">${t('Fortschritt heute')}</div>
      <div class="sub">${t('{a} von {b} genommen',{a:takenCount,b:doses.length})}</div>
      <div class="bar"><i style="width:${doses.length?takenCount/doses.length*100:0}%"></i></div>
    </div><div class="stat"><div><div class="k">${Math.round((doses.length?takenCount/doses.length:0)*100)}%</div></div></div></div></div>`;

  // Gruppiert nach Uhrzeit
  const groups={};
  for(const d of doses){ (groups[d.time]=groups[d.time]||[]).push(d); }
  const nowHM = pad(new Date().getHours())+':'+pad(new Date().getMinutes());

  for(const time of Object.keys(groups).sort()){
    html += `<div class="card"><div class="row" style="margin-bottom:4px"><div class="time">${time}</div>`;
    // Status der Uhrzeit: erledigt (alles abgehakt/übersprungen), offen seit … (überfällig) oder geplant
    const states = groups[time].map(d=>intakeState(key,d.medId,d.time)?.status);
    const openCount = states.filter(s=>!s).length;
    let tag;
    if(!openCount) tag = states.every(s=>s==='taken') ? `<span class="tag ok">✓ ${t('erledigt')}</span>` : `<span class="tag">${t('erledigt')}</span>`;
    else if(time < nowHM) tag = `<span class="tag warn">${t('offen')}${openCount<states.length?' · '+t('{a} von {b}',{a:openCount,b:states.length}):''}</span>`;
    else tag = `<span class="tag">${t('geplant')}</span>`;
    html += `<div class="grow"></div>${tag}</div>`;
    for(const d of groups[time]){
      const st=intakeState(key,d.medId,d.time);
      const taken=st?.status==='taken', skip=st?.status==='skipped';
      html += `<div class="dose-item ${taken?'state-taken':''}">
        <div class="pill" style="background:${d.med.color||'var(--surface-2)'}22">${formIcon(d.med.form)}</div>
        <div class="grow"><div class="title">${esc(d.med.name)}</div>
          <div class="sub">${multiProfile()&&DB.settings.profileFilter==='all'?profileLabel(profileById(d.med.profileId))+' · ':''}${esc(d.med.strength||'')}${d.med.trackWeight?' · ⚖️':''} ${skip?`· <span style="color:var(--danger)">${t('übersprungen')}</span>`:''} ${taken?`· <span style="color:var(--ok)">${t('genommen')}</span>`:''}</div></div>
        <div class="take">
          <button class="btn-round ${taken?'btn-primary':''}" title="${t('Genommen')}" onclick="act.take('${key}','${d.medId}','${d.time}')">✓</button>
          <button class="btn-round ${skip?'btn-danger':'btn-ghost'}" title="${t('Überspringen')}" onclick="act.skip('${key}','${d.medId}','${d.time}')">⤬</button>
        </div></div>`;
    }
    html += `</div>`;
  }
  view.innerHTML=html;
}

/* ---- Medikamente ---- */
function renderMeds(){
  const meds=DB.meds.filter(m=>!m.archived && inFilter(m.profileId));
  let html=profileBar() + `<h2 class="section">${t('Medikamente · {n}',{n:meds.length})}</h2>`;
  if(!meds.length){
    html+=`<div class="empty"><div class="big">💊</div>${t('Noch keine Medikamente.')}<br><span class="muted">${t('Tippe auf „+", um eines anzulegen.')}</span></div>`;
    view.innerHTML=html; return;
  }
  // Bei "Alle" und mehreren Profilen nach Profil gruppieren
  const grouped = multiProfile() && DB.settings.profileFilter==='all';
  let lastPid = null;
  const sorted = grouped ? [...meds].sort((a,b)=> DB.profiles.findIndex(p=>p.id===a.profileId) - DB.profiles.findIndex(p=>p.id===b.profileId)) : meds;
  for(const med of sorted){
    if(grouped && med.profileId!==lastPid){
      lastPid = med.profileId;
      html += `<h2 class="section" style="margin-top:14px">${profileLabel(profileById(med.profileId))}</h2>`;
    }
    const low = typeof med.stock==='number' && med.stock<= (med.stockThreshold??0) && (med.stockThreshold>0);
    const sched=scheduleSummary(med.schedule);
    html+=`<div class="card"><div class="row">
      <div class="pill" style="background:${med.color||'var(--surface-2)'}22">${formIcon(med.form)}</div>
      <div class="grow" onclick="act.editMed('${med.id}')">
        <div class="title">${esc(med.name)}</div>
        <div class="sub">${esc(med.strength||'')} · ${esc(sched)}</div>
        <div style="margin-top:6px">
          ${(()=>{ const si=stockInfo(med); if(!si) return '';
            return `<span class="tag ${si.low?'danger':'ok'}">${t('Bestand: {n}',{n:med.stock})}${si.daysLeft!=null?' · '+fmtDays(si.daysLeft):''}${si.low?' · '+t('nachkaufen'):''}</span>`; })()}
          ${med.interact?`<span class="tag warn">${t('⚠ Wechselwirkung')}</span>`:''}
          ${med.trackWeight?`<span class="tag">${t('⚖️ Gewicht')}</span>`:''}
          ${med.alarm?`<span class="tag warn">${t('⏰ Wecker')}</span>`:''}
        </div>
      </div>
      <button class="btn-round btn-ghost" onclick="act.editMed('${med.id}')">✎</button>
    </div></div>`;
  }
  view.innerHTML=html;
}
function scheduleSummary(s){
  if(!s) return t('kein Plan');
  const times=(s.times||[]).join(', ')||'–';
  if(s.type==='daily') return t('täglich {t}',{t:times});
  if(s.type==='interval') return t('alle {n} Tage {t}',{n:s.everyDays||1,t:times});
  if(s.type==='weekdays') return `${(s.weekdays||[]).map(d=>WD[d]).join('/')} ${times}`;
  if(s.type==='weeks') return `${(s.everyWeeks||1)===1?t('wöchentlich'):t('alle {n} Wochen',{n:s.everyWeeks})} ${times}`;
  if(s.type==='months') return `${(s.everyMonths||1)===1?t('monatlich'):t('alle {n} Monate',{n:s.everyMonths})} ${times}`;
  if(s.type==='cycle') return t('{a} an / {b} aus · {t}',{a:s.onDays,b:s.offDays,t:times});
  return times;
}

/* ---- Werte / Messungen ---- */
const MEASURE_TYPES=[
  {v:'bp',t:'Blutdruck',unit:'mmHg',two:true,ph:['Systolisch','Diastolisch'],ic:'🫀'},
  {v:'glucose',t:'Blutzucker',unit:'mg/dl',ic:'🩸'},
  {v:'weight',t:'Gewicht',unit:'kg',ic:'⚖️'},
  {v:'pulse',t:'Puls',unit:'/min',ic:'💓'},
  {v:'temp',t:'Temperatur',unit:'°C',ic:'🌡️'},
  {v:'custom',t:'Eigener Wert',unit:'',ic:'📊'}
].map(x=>({...x, t:t(x.t), ph:x.ph?x.ph.map(p=>t(p)):undefined}));
const mType=v=>MEASURE_TYPES.find(t=>t.v===v)||MEASURE_TYPES[5];
function renderMeasure(){
  let html=profileBar() + `<h2 class="section">${t('Messwerte')}</h2>`;
  const visible = DB.measures.filter(m=>inFilter(m.profileId));
  // Gruppen je Profil und Art (Gewicht von "Ich" und "Bello" getrennt)
  const groups={};
  for(const m of visible){ const k=m.profileId+'|'+m.type; (groups[k]=groups[k]||[]).push(m); }
  if(!visible.length){
    html+=`<div class="empty"><div class="big">📈</div>${t('Noch keine Messwerte.')}<br><span class="muted">${t('„+" erfasst Blutdruck, Blutzucker, Gewicht …')}</span></div>`;
    view.innerHTML=html; return;
  }
  const order = k => { const [pid,type]=k.split('|'); return DB.profiles.findIndex(p=>p.id===pid)*100 + MEASURE_TYPES.findIndex(t=>t.v===type); };
  for(const gk of Object.keys(groups).sort((a,b)=>order(a)-order(b))){
    const [pid,type]=gk.split('|');
    const mt=mType(type);
    const list=groups[gk].sort((a,b)=>b.ts-a.ts);
    const last=list[0];
    html+=`<div class="card"><div class="row"><div class="pill">${mt.ic}</div>
      <div class="grow"><div class="title">${mt.t}${multiProfile()?' · '+profileLabel(profileById(pid)):''}</div>
      <div class="sub">${t('zuletzt:')} <span class="measure-val">${fmtMeasure(last)}</span> · ${new Date(last.ts).toLocaleString(I18N.locale,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div></div>`;
    html+=sparkline(list.slice(0,20).reverse());
    html+=`<hr class="sep">`;
    html+=list.slice(0,6).map(m=>`<div class="row" style="padding:3px 0">
        <div class="grow sub">${new Date(m.ts).toLocaleString(I18N.locale,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} ${m.note?'· '+esc(m.note):''}</div>
        <div class="measure-val">${fmtMeasure(m)}</div>
        <button class="btn-round btn-ghost btn-sm" onclick="act.delMeasure('${m.id}')" title="${t('Löschen')}">🗑</button></div>`).join('');
    html+=`</div>`;
  }
  view.innerHTML=html;
}
const fmtNum = n => (typeof n==='number' && !isNaN(n)) ? n.toLocaleString(I18N.locale,{maximumFractionDigits:3}) : String(n??'');
function fmtMeasure(m){
  const t=mType(m.type);
  if(t.two) return `${fmtNum(m.value)}/${fmtNum(m.value2)} ${t.unit}`;
  return `${fmtNum(m.value)} ${m.unit||t.unit}`;
}
function sparkline(list){
  if(list.length<2) return `<div class="sub muted">${t('(zu wenig Daten für Verlauf)')}</div>`;
  const vals=list.map(m=>Number(m.value)).filter(n=>!isNaN(n));
  const min=Math.min(...vals), max=Math.max(...vals), span=(max-min)||1;
  const W=320,H=54;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*W},${H-((v-min)/span)*(H-8)-4}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:54px;margin-top:8px" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

/* ---- Verlauf / Adhärenz ---- */
function renderHistory(){
  const ad7=adherence(7), ad30=adherence(30);
  let html=profileBar() + `<h2 class="section">${t('Verlauf &amp; Therapietreue')}</h2>`;
  html+=`<div class="card"><div class="stat">
     <div><div class="k">${ad7.pct??'–'}${ad7.pct!=null?'%':''}</div><div class="l">${t('7 Tage')}</div></div>
     <div><div class="k">${ad30.pct??'–'}${ad30.pct!=null?'%':''}</div><div class="l">${t('30 Tage')}</div></div>
     <div><div class="k">${ad7.taken}/${ad7.planned}</div><div class="l">${t('Dosen (7 T.)')}</div></div>
   </div></div>`;

  // Letzte 14 Tage
  html+=`<div class="card"><div class="title" style="margin-bottom:8px">${t('Letzte 14 Tage')}</div>`;
  for(let i=0;i<14;i++){
    const d=new Date(); d.setDate(d.getDate()-i); const key=todayKey(d);
    const doses=visibleDoses(key);
    if(!doses.length) continue;
    let taken=0,skip=0;
    for(const dose of doses){ const s=intakeState(key,dose.medId,dose.time)?.status; if(s==='taken')taken++; else if(s==='skipped')skip++; }
    const pct=doses.length?taken/doses.length*100:0;
    html+=`<div class="row" style="padding:5px 0">
      <div class="sub" style="width:120px">${d.toLocaleDateString(I18N.locale,{weekday:'short',day:'2-digit',month:'2-digit'})}</div>
      <div class="grow bar"><i style="width:${pct}%;background:${pct>=100?'var(--ok)':pct>=50?'var(--warn)':'var(--danger)'}"></i></div>
      <div class="sub" style="width:54px;text-align:right">${taken}/${doses.length}</div></div>`;
  }
  html+=`</div>`;
  view.innerHTML=html;
}

/* ---- Mehr ---- */
function renderMore(){
  const s=DB.settings;
  let html=`<h2 class="section">${t('Mehr')}</h2>` + reliabilityCard() + languageCard();

  html+=`<div class="card">
    <div class="title">${t('Personen &amp; Tiere')}</div>
    <div class="sub">${t('Für wen sind die Medikamente? Lege z. B. ein Familienmitglied oder dein Haustier an.')}</div>
    ${DB.profiles.map(p=>{
      const n=DB.meds.filter(m=>!m.archived&&m.profileId===p.id).length;
      return `<div class="dose-item">
        <div class="pill">${kindIcon(p.kind)}</div>
        <div class="grow"><div class="title">${esc(p.name)}</div>
          <div class="sub">${(PROFILE_KINDS.find(k=>k.v===p.kind)||PROFILE_KINDS[0]).t} · ${t(n===1?'{n} Medikament':'{n} Medikamente',{n})}</div></div>
        <button class="btn-round btn-ghost" onclick="act.profileForm('${p.id}')" title="${t('Bearbeiten')}">✎</button>
      </div>`;}).join('')}
    <div class="actions" style="margin-top:10px"><button class="btn-ghost btn-sm" onclick="act.profileForm('')">${t('+ Person oder Tier hinzufügen')}</button></div>
  </div>`;

  html+=`<div class="card">
    <div class="title">${t('Erinnerungen')}</div>
    <div class="sub">${isNative
      ? t('Geplante Benachrichtigungen zu den Einnahmezeiten – auch bei geschlossener App.')
      : t('Benachrichtigungen, solange Dosia geöffnet ist (Browser-Version).')}</div>
    <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
      <input type="checkbox" id="setNotify" ${s.notify?'checked':''}> ${t('Erinnerungen aktivieren')}</label>
    ${isNative ? `<label style="display:flex;align-items:center;gap:10px;margin-top:10px">
      <input type="checkbox" id="setFollow" ${s.followUp?'checked':''}> ${t('Nachhaken, solange nicht abgehakt')}</label>
    <div class="grid2" style="${s.followUp?'':'opacity:.5'}">
      <div><label>${t('Alle')}</label><select id="setFollowMin">${[5,10,15,30,60,120].map(n=>`<option value="${n}" ${s.followUpMin===n?'selected':''}>${n<60?t('{n} Minuten',{n}):n===60?t('1 Stunde'):t('2 Stunden')}</option>`).join('')}</select></div>
      <div><label>${t('Wie oft')}</label><select id="setFollowMax">${[[0,t('bis abgehakt')],[1,'1×'],[2,'2×'],[3,'3×'],[5,'5×'],[10,'10×']].map(([v,t])=>`<option value="${v}" ${(s.followUpMax||0)===v?'selected':''}>${t}</option>`).join('')}</select></div>
    </div>
    <div class="sub">${t('Nachgehakt wird höchstens bis zur nächsten Einnahme desselben Medikaments (spätestens nach 24 Std.). In der Benachrichtigung kannst du direkt auf „✓ Genommen" oder „⏰ In 10 Min." tippen.')}</div>` : ''}
    ${isNative
      ? ''
      : `<div class="notice">${t('⚠ In der Browser-Version können Erinnerungen bei geschlossener Seite nicht garantiert werden. Für zuverlässige Erinnerungen die installierte App nutzen.')}</div>`}
  </div>`;

  html+=`<div class="card">
    <div class="title">${t('Darstellung')}</div>
    <div class="chips" id="themeChips">
      ${['auto','light','dark'].map(th=>`<span class="chip ${s.theme===th?'on':''}" data-theme="${th}">${t({auto:'Automatisch',light:'Hell',dark:'Dunkel'}[th])}</span>`).join('')}
    </div>
  </div>`;

  html+=`<div class="card">
    <div class="title">${t('Notfall-Kontakt (MedFriend)')}</div>
    <div class="sub">${t('Nur auf diesem Gerät gespeichert. Ist eine Dosis seit über 2 Stunden offen, zeigt „Heute" den Kontakt mit Knöpfen zum Anrufen und für eine SMS.')}</div>
    <label>${t('Name / Telefon')}</label>
    <input id="setMedfriend" value="${esc(s.medfriend||'')}" placeholder="${t('z. B. Anna · 0170 …')}">
  </div>`;

  html+=`<div class="card">${GDrive.cardHtml()}</div>`;
  html+=Updater.moreCard();

  html+=`<div class="card">
    <div class="title">${t('Datensicherung')}</div>
    <div class="sub">${t('Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig.')}</div>
    <div class="actions" style="margin-top:10px">
      <button class="btn-primary btn-sm" onclick="act.exportData()">${t('⤓ Backup exportieren')}</button>
      <button class="btn-ghost btn-sm" onclick="act.importData()">${t('⤒ Backup importieren')}</button>
    </div>
  </div>`;

  if(!isNative) html+=`<div class="card">
    <div class="title">${t('Installieren')}</div>
    <div class="sub">${t('Im Browser-Menü „Zum Startbildschirm hinzufügen" wählen – dann läuft Dosia wie eine App, offline.')}</div>
    <div class="actions" style="margin-top:10px"><button class="btn-ghost btn-sm" id="installBtn" style="display:none">${t('App installieren')}</button></div>
  </div>`;

  html+=`<div class="card">
    <button class="btn-danger btn-sm" onclick="act.wipe()">${t('Alle Daten löschen')}</button>
  </div>`;

  html+=`<div class="hint">${t('Dosia ersetzt keine ärztliche oder pharmazeutische Beratung. Prüfe Dosierungen und Wechselwirkungen immer mit Arzt oder Apotheke.')}</div>`;
  if(window.DOSIA_PRIVACY_URL) html+=`<div class="sub center" style="margin-top:14px"><a href="${esc(window.DOSIA_PRIVACY_URL)}" style="color:var(--accent)">${t('Datenschutzerklärung')}</a></div>`;
  html+=`<div class="sub center" style="margin-top:14px">Dosia ${APP_VERSION} · ${isNative?'App':'Browser'}${isNative&&!LN()?' · '+t('Benachrichtigungs-Plugin fehlt'):''}</div>`;

  view.innerHTML=html;

  $('#setNotify').onchange=e=>{ act.toggleNotify(e.target.checked); };
  if($('#setFollow')){
    $('#setFollow').onchange=e=>{ DB.settings.followUp=e.target.checked; saveDB(); refreshReminders(); render(); };
    $('#setFollowMin').onchange=e=>{ DB.settings.followUpMin=+e.target.value; saveDB(); refreshReminders(); };
    $('#setFollowMax').onchange=e=>{ DB.settings.followUpMax=+e.target.value; saveDB(); refreshReminders(); };
  }
  $('#setMedfriend').onchange=e=>{ DB.settings.medfriend=e.target.value.trim(); saveDB(); };
  $('#themeChips').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ act.setTheme(c.dataset.theme); });
  const ib=$('#installBtn'); if(deferredPrompt && ib){ ib.style.display='inline-block'; ib.onclick=()=>act.install(); }
}

/* ======================================================================
   MODALS (Formulare)
====================================================================== */
const modalBg=$('#modalBg'), modal=$('#modal');
function openModal(html){ modal.innerHTML=html; modalBg.classList.add('open'); }
function closeModal(){ modalBg.classList.remove('open'); modal.innerHTML=''; }
modalBg.addEventListener('click',e=>{ if(e.target===modalBg) closeModal(); });

function medForm(med){
  const defaultPid = DB.settings.profileFilter!=='all' ? DB.settings.profileFilter : DB.profiles[0].id;
  const m = med || {id:'',profileId:defaultPid,name:'',form:'tablette',strength:'',color:'#1f8a70',stock:'',stockThreshold:'',
                    notes:'',interact:false,trackWeight:false, schedule:{type:'daily',times:['08:00'],weekdays:[1,2,3,4,5],everyDays:2,onDays:21,offDays:7}};
  const s=m.schedule||{type:'daily',times:['08:00']};
  openModal(`
    <div class="modal-head"><h3>${med?t('Medikament bearbeiten'):t('Neues Medikament')}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">${t('Schließen')}</button></div>
    <label>${t('Für')}</label>
    <select id="mProfile" onchange="document.getElementById('mNewProfile').style.display=this.value==='__new'?'block':'none'">
      ${DB.profiles.map(p=>`<option value="${p.id}" ${m.profileId===p.id?'selected':''}>${kindIcon(p.kind)} ${esc(p.name)}</option>`).join('')}
      <option value="__new">${t('＋ Neue Person / neues Tier …')}</option>
    </select>
    <div id="mNewProfile" style="display:none">
      <div class="grid2">
        <div><label>${t('Name')}</label><input id="mNewName" placeholder="${t('z. B. Bello')}"></div>
        <div><label>${t('Art')}</label><select id="mNewKind">${PROFILE_KINDS.map(k=>`<option value="${k.v}">${k.ic} ${k.t}</option>`).join('')}</select></div>
      </div>
    </div>
    <label>${t('Medikament')}</label><input id="mName" value="${esc(m.name)}" placeholder="${t('z. B. Ramipril')}">
    <div class="grid2">
      <div><label>${t('Form')}</label><select id="mForm">${FORMS.map(f=>`<option value="${f.v}" ${m.form===f.v?'selected':''}>${f.ic} ${f.t}</option>`).join('')}</select></div>
      <div><label>${t('Stärke / Dosis')}</label><input id="mStrength" value="${esc(m.strength)}" placeholder="${t('z. B. 5 mg')}"></div>
    </div>
    <label>${t('Farbe')}</label><input type="color" id="mColor" value="${m.color||'#1f8a70'}" style="height:44px;padding:4px">

    <hr class="sep"><div class="title" style="font-size:15px">${t('Einnahmeplan')}</div>
    <label>${t('Rhythmus')}</label>
    <select id="mType">
      <option value="daily" ${s.type==='daily'?'selected':''}>${t('Täglich')}</option>
      <option value="interval" ${s.type==='interval'?'selected':''}>${t('Alle X Tage')}</option>
      <option value="weekdays" ${s.type==='weekdays'?'selected':''}>${t('Bestimmte Wochentage')}</option>
      <option value="weeks" ${s.type==='weeks'?'selected':''}>${t('Alle X Wochen')}</option>
      <option value="months" ${s.type==='months'?'selected':''}>${t('Alle X Monate')}</option>
      <option value="cycle" ${s.type==='cycle'?'selected':''}>${t('Zyklus (X Tage an / Y aus)')}</option>
    </select>
    <div id="schedExtra"></div>

    <label>${t('Uhrzeiten')}</label>
    <div id="timeList"></div>
    <button class="btn-ghost btn-sm" onclick="act.addTime()" style="margin-top:6px">${t('+ Uhrzeit')}</button>

    <div class="grid2" style="margin-top:4px">
      <div><label>${t('Start (optional)')}</label><input type="date" id="mStart" value="${s.start||''}"></div>
      <div><label>${t('Ende (optional)')}</label><input type="date" id="mEnd" value="${s.end||''}"></div>
    </div>

    <hr class="sep"><div class="title" style="font-size:15px">${t('Bestand')}</div>
    <div class="grid2">
      <div><label>${t('Aktueller Bestand')}</label><input type="number" id="mStock" value="${m.stock??''}" placeholder="${t('z. B. 30')}" min="0"></div>
      <div><label>${t('Nachkauf-Erinnerung ab (Stück)')}</label><input type="number" id="mThresh" value="${m.stockThreshold??''}" placeholder="${t('z. B. 7')}" min="0"></div>
    </div>
    <div class="sub">${t('Dosia zieht jede abgehakte Einnahme ab, zeigt an, wie viele Tage der Vorrat reicht, und erinnert rechtzeitig ans Nachkaufen. Nach dem Kauf hier den neuen Bestand eintragen.')}</div>

    <hr class="sep"><div class="title" style="font-size:15px">${t('Gewicht')}</div>
    <label style="display:flex;align-items:center;gap:10px;color:var(--text)"><input type="checkbox" id="mWeight" ${m.trackWeight?'checked':''}> ${t('⚖️ Gewicht mit erfassen')}</label>
    <div class="sub">${t('Solange das Medikament läuft (Start bis Ende), fragt Dosia beim ersten Abhaken am Tag nach dem Gewicht – höchstens einmal täglich.')}</div>

    ${isNative && DA() ? `<hr class="sep"><div class="title" style="font-size:15px">${t('Wecker-Modus')}</div>
    <label style="display:flex;align-items:center;gap:10px;color:var(--text)"><input type="checkbox" id="mAlarm" ${m.alarm?'checked':''}> ${t('⏰ Wie ein Wecker klingeln')}</label>
    <div class="sub">${t('Für besonders wichtige Medikamente: Die Erinnerung klingelt bildschirmfüllend mit Wecker-Ton – auch bei gesperrtem Handy –, bis du „Genommen" oder „Später" tippst.')}</div>` : ''}

    <hr class="sep">
    <label style="display:flex;align-items:center;gap:10px"><input type="checkbox" id="mInteract" ${m.interact?'checked':''}> ${t('⚠ Wechselwirkung/Hinweis markieren')}</label>
    <label>${t('Notizen (Einnahmehinweise, Wechselwirkungen …)')}</label>
    <textarea id="mNotes" rows="3" placeholder="${t('z. B. nüchtern einnehmen; nicht mit Grapefruit')}">${esc(m.notes)}</textarea>

    <div class="actions" style="margin-top:16px">
      <button class="btn-primary grow" onclick="act.saveMed('${m.id}')">${t('Speichern')}</button>
      ${med?`<button class="btn-danger" onclick="act.archiveMed('${m.id}')">${t('Löschen')}</button>`:''}
    </div>
  `);
  // dynamische Teile
  tmpTimes = [...(s.times||['08:00'])];
  tmpSched = JSON.parse(JSON.stringify(s));
  renderTimeList(); renderSchedExtra();
  $('#mType').onchange=e=>{ tmpSched.type=e.target.value; renderSchedExtra(); };
}
let tmpTimes=[], tmpSched={};
function renderTimeList(){
  const el=$('#timeList'); if(!el) return;
  el.innerHTML=tmpTimes.map((t,i)=>`<div class="row" style="margin-top:6px">
    <input type="time" value="${t}" onchange="act.setTime(${i},this.value)" style="flex:1">
    ${tmpTimes.length>1?`<button class="btn-round btn-ghost" onclick="act.rmTime(${i})">✕</button>`:''}</div>`).join('');
}
function renderSchedExtra(){
  const el=$('#schedExtra'); if(!el) return;
  const ty=tmpSched.type;
  if(ty==='interval'){
    el.innerHTML=`<label>${t('Alle wie viele Tage?')}</label><input type="number" min="1" id="mEvery" value="${tmpSched.everyDays||2}" onchange="tmpSched.everyDays=+this.value">`;
  }else if(ty==='weeks' || ty==='months'){
    const k = ty==='weeks' ? 'everyWeeks' : 'everyMonths';
    el.innerHTML=`<label>${ty==='weeks'?t('Alle wie viele Wochen?'):t('Alle wie viele Monate?')}</label>
      <input type="number" min="1" value="${tmpSched[k]||1}" onchange="tmpSched.${k}=Math.max(1,+this.value||1)">
      <div class="sub">${t('Gerechnet ab dem Startdatum unten – ohne Startdatum ab heute.')}${ty==='months'?t(' Gibt es den Tag in einem Monat nicht (z. B. 31.), dann am Monatsletzten.'):''}</div>`;
  }else if(ty==='weekdays'){
    el.innerHTML=`<label>${t('Wochentage')}</label><div class="chips">${[1,2,3,4,5,6,0].map(d=>`<span class="chip ${(tmpSched.weekdays||[]).includes(d)?'on':''}" onclick="act.toggleWd(${d},this)">${WD[d]}</span>`).join('')}</div>`;
  }else if(ty==='cycle'){
    el.innerHTML=`<div class="grid2"><div><label>${t('Tage „an"')}</label><input type="number" min="1" id="mOn" value="${tmpSched.onDays||21}" onchange="tmpSched.onDays=+this.value"></div>
      <div><label>${t('Tage „aus"')}</label><input type="number" min="0" id="mOff" value="${tmpSched.offDays||7}" onchange="tmpSched.offDays=+this.value"></div></div>
      <label>${t('Zyklus-Start')}</label><input type="date" id="mAnchor" value="${tmpSched.anchor||tmpSched.start||todayKey()}" onchange="tmpSched.anchor=this.value">`;
  }else{ el.innerHTML=''; }
}

function measureForm(){
  openModal(`
    <div class="modal-head"><h3>${t('Messwert erfassen')}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">${t('Schließen')}</button></div>
    ${multiProfile()?`<label>${t('Für')}</label><select id="xProfile">${DB.profiles.map(p=>`<option value="${p.id}" ${(DB.settings.profileFilter===p.id)?'selected':''}>${kindIcon(p.kind)} ${esc(p.name)}</option>`).join('')}</select>`:''}
    <label>${t('Art')}</label>
    <select id="xType" onchange="act.measureTypeChange()">${MEASURE_TYPES.map(x=>`<option value="${x.v}">${x.ic} ${x.t}</option>`).join('')}</select>
    <div id="xFields"></div>
    <label>${t('Notiz (optional)')}</label><input id="xNote" placeholder="${t('z. B. nach dem Essen')}">
    <div class="actions" style="margin-top:16px"><button class="btn-primary grow" onclick="act.saveMeasure()">${t('Speichern')}</button></div>
  `);
  act.measureTypeChange();
}

// Gewicht schnell erfassen (aus "Heute" oder automatisch beim Abhaken)
function weightForm(profileId, medId){
  const p=profileById(profileId);
  const last=DB.measures.filter(m=>m.type==='weight'&&m.profileId===p.id).sort((a,b)=>b.ts-a.ts)[0];
  openModal(`
    <div class="modal-head"><h3>⚖️ ${t('Gewicht')}${multiProfile()?' · '+profileLabel(p):''}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">${t('Schließen')}</button></div>
    <div class="sub">${last?t('Zuletzt: <b>{v} kg</b> am {d}',{v:fmtNum(last.value),d:new Date(last.ts).toLocaleDateString(I18N.locale)}):t('Noch kein Gewicht erfasst.')}</div>
    <label>${t('Gewicht (kg)')}</label>
    <input type="text" id="wVal" inputmode="decimal" autocomplete="off" placeholder="${last?fmtNum(last.value):t('z. B. 12,5')}">
    <div class="actions" style="margin-top:16px">
      <button class="btn-primary grow" onclick="act.saveWeight('${p.id}','${medId||''}')">${t('Speichern')}</button>
      <button class="btn-ghost" onclick="act.skipWeight('${p.id}')">${t('Heute nicht')}</button>
    </div>`);
  setTimeout(()=>{ const i=$('#wVal'); if(i) i.focus(); }, 50);
}

// Person / Tier anlegen oder bearbeiten
function profileForm(id){
  const p = id ? DB.profiles.find(x=>x.id===id) : { id:'', name:'', kind:'person' };
  openModal(`
    <div class="modal-head"><h3>${id?t('Bearbeiten'):t('Person oder Tier hinzufügen')}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">${t('Schließen')}</button></div>
    <label>${t('Name')}</label><input id="pName" value="${esc(p.name)}" placeholder="${t('z. B. Mama, Bello, Minka')}">
    <label>${t('Art')}</label>
    <select id="pKind">${PROFILE_KINDS.map(k=>`<option value="${k.v}" ${p.kind===k.v?'selected':''}>${k.ic} ${k.t}</option>`).join('')}</select>
    <div class="actions" style="margin-top:16px">
      <button class="btn-primary grow" onclick="act.saveProfile('${p.id}')">${t('Speichern')}</button>
      ${id && DB.profiles.length>1 ? `<button class="btn-danger" onclick="act.deleteProfile('${p.id}')">${t('Löschen')}</button>` : ''}
    </div>`);
}

/* ======================================================================
   AKTIONEN
====================================================================== */
const act = {
  closeModal,
  // Heute
  take(key,medId,time){
    const cur=intakeState(key,medId,time);
    const nowTaken = cur?.status!=='taken';
    setIntake(key,medId,time, nowTaken?'taken':null); render(); refreshReminders();
    // Gewicht mit erfassen: beim ersten Abhaken des Tages fragen (höchstens einmal pro Tag und Profil)
    const med=DB.meds.find(m=>m.id===medId);
    if(nowTaken && med && med.trackWeight && key===todayKey() && !weightToday(med.profileId) && !weightSkipped(med.profileId)){
      weightForm(med.profileId, med.id);
    }
  },
  skip(key,medId,time){ const cur=intakeState(key,medId,time); setIntake(key,medId,time, cur?.status==='skipped'?null:'skipped'); render(); refreshReminders(); },
  // Medikament
  newMed(){ medForm(null); },
  editMed(id){ medForm(DB.meds.find(m=>m.id===id)); },
  addTime(){ tmpTimes.push('12:00'); renderTimeList(); },
  rmTime(i){ tmpTimes.splice(i,1); renderTimeList(); },
  setTime(i,v){ tmpTimes[i]=v; },
  toggleWd(d,el){ const w=tmpSched.weekdays=tmpSched.weekdays||[]; const idx=w.indexOf(d); if(idx<0)w.push(d); else w.splice(idx,1); el.classList.toggle('on'); },
  saveMed(id){
    const name=$('#mName').value.trim();
    if(!name){ alert(t('Bitte einen Namen für das Medikament eingeben.')); return; }
    // Für wen? Ggf. direkt eine neue Person / ein neues Tier anlegen
    let profileId=$('#mProfile').value;
    if(profileId==='__new'){
      const pname=$('#mNewName').value.trim();
      if(!pname){ alert(t('Bitte einen Namen für die neue Person bzw. das Tier eingeben.')); return; }
      profileId=uid();
      DB.profiles.push({ id:profileId, name:pname, kind:$('#mNewKind').value });
    }
    tmpTimes=[...new Set(tmpTimes)].sort();
    const sched={ type:$('#mType').value, times:tmpTimes,
      everyDays:tmpSched.everyDays, everyWeeks:tmpSched.everyWeeks, everyMonths:tmpSched.everyMonths,
      weekdays:tmpSched.weekdays, onDays:tmpSched.onDays, offDays:tmpSched.offDays, anchor:tmpSched.anchor,
      start:$('#mStart').value||'', end:$('#mEnd').value||'' };
    const data={
      profileId, trackWeight:$('#mWeight').checked, alarm: $('#mAlarm') ? $('#mAlarm').checked : !!(id && (DB.meds.find(x=>x.id===id)||{}).alarm),
      name, form:$('#mForm').value, strength:$('#mStrength').value.trim(), color:$('#mColor').value,
      stock: $('#mStock').value===''?null:Math.max(0,+$('#mStock').value),
      stockThreshold: $('#mThresh').value===''?0:Math.max(0,+$('#mThresh').value),
      notes:$('#mNotes').value.trim(), interact:$('#mInteract').checked, schedule:sched
    };
    if(id){
      const old = DB.meds.find(m=>m.id===id);
      // Bestand aufgefüllt -> Nachkauf-Erinnerung wieder scharf schalten
      if(typeof data.stock==='number' && (typeof old.stock!=='number' || data.stock > old.stock)) clearRestock(id);
      Object.assign(old, data);
    }
    else{ DB.meds.push(Object.assign({id:uid(),createdAt:new Date().toISOString(),archived:false}, data)); }
    saveDB(); closeModal(); render(); refreshReminders();
  },
  archiveMed(id){ if(confirm(t('Dieses Medikament löschen? Der Verlauf bleibt erhalten.'))){ const m=DB.meds.find(x=>x.id===id); if(m)m.archived=true; saveDB(); closeModal(); render(); refreshReminders(); } },
  // Messwerte
  newMeasure(){ measureForm(); },
  measureTypeChange(){
    const mt=mType($('#xType').value); const el=$('#xFields');
    if(mt.two){ el.innerHTML=`<div class="grid2"><div><label>${mt.ph[0]} (${mt.unit})</label><input type="text" id="xVal" inputmode="decimal" autocomplete="off"></div>
      <div><label>${mt.ph[1]}</label><input type="text" id="xVal2" inputmode="decimal" autocomplete="off"></div></div>`; }
    else{ el.innerHTML=`<label>${t('Wert')} ${mt.unit?'('+mt.unit+')':''}</label><input type="text" id="xVal" inputmode="decimal" autocomplete="off">${mt.v==='custom'?`<label>${t('Einheit')}</label><input id="xUnit" placeholder="${t('z. B. mg/l')}">`:''}`; }
  },
  saveMeasure(){
    const type=$('#xType').value, mt=mType(type);
    const v=parseNum($('#xVal').value); if(isNaN(v)){ alert(t('Bitte einen gültigen Wert eingeben.')); return; }
    const v2=mt.two ? parseNum($('#xVal2').value) : undefined;
    if(mt.two && isNaN(v2)){ alert(t('Bitte beide Werte eingeben.')); return; }
    const pid = $('#xProfile') ? $('#xProfile').value : (DB.settings.profileFilter!=='all' ? DB.settings.profileFilter : DB.profiles[0].id);
    DB.measures.push({ id:uid(), profileId:pid, type, value:v, value2: v2,
      unit: type==='custom'? ($('#xUnit')?.value||'') : mt.unit, ts:Date.now(), note:$('#xNote').value.trim() });
    saveDB(); closeModal(); render();
  },
  delMeasure(id){ if(confirm(t('Messwert löschen?'))){ DB.measures=DB.measures.filter(m=>m.id!==id); saveDB(); render(); } },
  // Gewicht
  weightForm(pid, medId){ weightForm(pid, medId); },
  saveWeight(pid, medId){
    const v=parseNum($('#wVal').value);
    if(!(v>0)){ alert(t('Bitte ein gültiges Gewicht eingeben, z. B. 12,5')); return; }
    const med=DB.meds.find(m=>m.id===medId);
    DB.measures.push({ id:uid(), profileId:pid, medId:medId||undefined, type:'weight', value:Math.round(v*1000)/1000, unit:'kg', ts:Date.now(), note: med?t('zu {name}',{name:med.name}):'' });
    saveDB(); closeModal(); render();
  },
  skipWeight(pid){ markWeightSkipped(pid); closeModal(); render(); },
  // Personen & Tiere
  setProfileFilter(pid){ DB.settings.profileFilter=pid; saveDB({ skipBackup:true }); render(); },
  profileForm(id){ profileForm(id); },
  saveProfile(id){
    const name=$('#pName').value.trim(), kind=$('#pKind').value;
    if(!name){ alert(t('Bitte einen Namen eingeben.')); return; }
    if(id){ Object.assign(DB.profiles.find(p=>p.id===id), { name, kind }); }
    else{ DB.profiles.push({ id:uid(), name, kind }); }
    saveDB(); closeModal(); render(); refreshReminders();
  },
  deleteProfile(id){
    const p=DB.profiles.find(x=>x.id===id); if(!p || DB.profiles.length<2) return;
    const n=DB.meds.filter(m=>!m.archived&&m.profileId===id).length, w=DB.measures.filter(m=>m.profileId===id).length;
    if(!confirm(t('„{p}" löschen?\n\nDabei werden auch {n} Medikament(e) und {w} Messwert(e) von {p} gelöscht.',{p:p.name,n,w}))) return;
    DB.meds.forEach(m=>{ if(m.profileId===id) m.archived=true; });
    DB.measures=DB.measures.filter(m=>m.profileId!==id);
    DB.profiles=DB.profiles.filter(x=>x.id!==id);
    if(DB.settings.profileFilter===id) DB.settings.profileFilter='all';
    saveDB(); closeModal(); render(); refreshReminders();
  },
  // Einstellungen
  async toggleNotify(on){
    if(on){
      if(isNative){
        const ln=LN();
        if(!ln){ alert(t('Benachrichtigungen werden auf diesem Gerät nicht unterstützt.')); DB.settings.notify=false; render(); return; }
        let granted=false;
        try{
          let p = await ln.checkPermissions();
          if(p.display!=='granted'){ p = await ln.requestPermissions(); }
          granted = p && p.display==='granted';
          // Exakte Alarme (Android 12+) anfragen, falls das Plugin das anbietet
          if(granted && ln.changeExactNotificationSetting){
            try{ const e=await ln.checkExactNotificationSetting?.(); if(e && e.exact_alarm!=='granted'){ await ln.changeExactNotificationSetting(); } }catch{}
          }
        }catch(e){ console.warn(e); }
        DB.settings.notify = granted;
        if(!granted){ alert(t('Bitte erlaube Benachrichtigungen für Dosia in den Android-Einstellungen.')); }
        else { await ensureChannel(); }
      } else {
        if(!('Notification' in window)){ alert(t('Dieser Browser unterstützt keine Benachrichtigungen.')); DB.settings.notify=false; render(); return; }
        const perm = await Notification.requestPermission();
        DB.settings.notify = perm==='granted';
        if(perm!=='granted') alert(t('Benachrichtigungen wurden nicht erlaubt.'));
      }
    }else{ DB.settings.notify=false; }
    saveDB(); await refreshReminders(); render();
  },
  setTheme(t){ DB.settings.theme=t; applyTheme(); saveDB(); render(); },
  async exportData(){
    const name=`dosia-backup-${todayKey()}.json`, json=JSON.stringify(DB,null,2);
    const P = Cap && Cap.Plugins;
    // In der App: Datei anlegen und über das Android-Teilen-Menü speichern/teilen (Drive, Mail, Dateien …)
    if(isNative && P && P.Filesystem && P.Share){
      try{
        const r = await P.Filesystem.writeFile({ path:name, data:json, directory:'CACHE', encoding:'utf8' });
        await P.Share.share({ title:t('Dosia-Backup'), text:t('Dosia-Backup vom {d}',{d:new Date().toLocaleDateString(I18N.locale)}), files:[r.uri], dialogTitle:t('Backup speichern oder teilen') });
      }catch(e){
        if(!/cancel/i.test((e && e.message)||'')) alert(t('Backup konnte nicht exportiert werden: ')+((e && e.message)||e));
      }
      return;
    }
    // Browser: normaler Download
    const blob=new Blob([json],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=name; a.click(); URL.revokeObjectURL(a.href);
  },
  importData(){
    const inp=document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange=()=>{ const f=inp.files[0]; if(!f)return; const r=new FileReader();
      r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.meds){throw 0;}
        if(confirm(t('Backup einspielen? Aktuelle Daten werden ersetzt.'))){ replaceDB(d); alert(t('Backup eingespielt.')); } }
        catch(e){ alert(t('Ungültige Backup-Datei.')); } };
      r.readAsText(f); };
    inp.click();
  },
  wipe(){ if(confirm(t('Wirklich ALLE Daten unwiderruflich löschen?'))){ DB=defaultDB(); saveDB(); render(); refreshReminders(); } },
  install(){ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; } },
  // Zuverlässigkeits-Check
  openCheck(){ currentTab='more'; closeModal(); render(); setTimeout(()=>{ const c=$('#relCard'); if(c) c.scrollIntoView({behavior:'smooth'}); }, 60); },
  hideCheck(sig){ try{ localStorage.setItem(RELHIDE_KEY, sig); }catch{} render(); },
  async testReminder(){
    const ln=LN(); if(!ln) return;
    if(!channelReady) await ensureChannel();
    const n={ id:999000002, title:t('Dosia · Test'), body:t('So sieht deine Erinnerung aus. Alles funktioniert!'),
      schedule:{ at:new Date(Date.now()+10000), allowWhileIdle:true }, extra:{ kind:'test' } };
    if(channelReady) n.channelId='dosia-reminders';
    try{ await ln.schedule({ notifications:[n] }); alert(t('Sperre das Handy jetzt – in 10 Sekunden kommt die Test-Erinnerung.')); }catch(e){ alert(String(e && e.message || e)); }
  },
  async testAlarm(){
    const da=DA(); if(!da) return;
    try{ await da.test({ seconds:10, title:t('Dosia · Test'), body:t('So sieht deine Erinnerung aus. Alles funktioniert!'),
      takeLabel:t('✓ Genommen'), snoozeLabel:t('⏰ In {n} Min.',{n:SNOOZE_MIN}) });
      alert(t('Sperre das Handy jetzt – in 10 Sekunden kommt die Test-Erinnerung.')); }catch(e){ alert(String(e && e.message || e)); }
  },
  setLang(v){ I18N.set(v); location.reload(); },
};
window.act=act;

/* ======================================================================
   ERINNERUNGEN
   - Nativ (Android via Capacitor LocalNotifications): echte geplante
     Benachrichtigungen – feuern auch bei geschlossener App und nach Neustart.
   - Web/PWA-Fallback: best-effort, nur solange die App geöffnet ist.
====================================================================== */
const Cap = window.Capacitor;
const isNative = !!(Cap && typeof Cap.isNativePlatform==='function' && Cap.isNativePlatform());
const LN = () => (Cap && Cap.Plugins && Cap.Plugins.LocalNotifications) || null;
// Eigenes Plugin: Wecker-Modus und Zuverlässigkeits-Check (nur in der Android-App)
const DA = () => (Cap && Cap.Plugins && Cap.Plugins.DoseAlarm) || null;
const NOTIF_WINDOW = 48;   // so viele kommende Dosen im Voraus einplanen (plus je Medikament die nächste)
const SNOOZE_MIN = 10;
// Android erlaubt pro App höchstens 500 gleichzeitig geplante Alarme (Benachrichtigungen + Wecker-Modus zusammen).
// Wird die Grenze überschritten, beendet Android die App. Deshalb großzügige Reserve für Verstummen, Schlummern und Test.
const MAX_ALARMS = 350;
const FOLLOWUP_HORIZON_MS = 24*3600*1000;   // Nachhaken endet spätestens nach 24 h (bzw. bei der nächsten Einnahme)
let channelReady = false;

// Feste Benachrichtigungs-Nummer je Erinnerung (Art + Dosis + Zähler): eine Erinnerung ersetzt beim Neuplanen
// nur sich selbst, und alle Erinnerungen einer Dosis lassen sich gezielt aus der Leiste entfernen.
const NID_BASE = { dose:100000000, followup:200000000, snooze:300000000, restock:400000000 };
function stableId(kind, ident, used){
  let h = 0x811c9dc5;                                   // FNV-1a
  for(let i=0;i<ident.length;i++){ h ^= ident.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let id = NID_BASE[kind] + (h % 99999999);
  while(used.has(id)) id++;                             // seltene Kollision innerhalb eines Plans auflösen
  used.add(id);
  return id;
}
const doseIdent = (key, medId, time) => key+'|'+medId+'|'+time;

// Welche angezeigte Benachrichtigung gehört zu welcher Dosis? (für das Aufräumen nach dem Abhaken)
const NIDMAP_KEY = 'dosia.nidmap.v1';
function getNidMap(){ try{ return JSON.parse(localStorage.getItem(NIDMAP_KEY)||'{}'); }catch{ return {}; } }
function setNidMap(m){ try{ localStorage.setItem(NIDMAP_KEY, JSON.stringify(m)); }catch{} }

// "In 10 Min. erinnern": gemerkte Schlummer-Erinnerungen (überleben das Neuplanen)
const SNOOZE_KEY = 'dosia.snooze.v1';
function getSnoozes(){ try{ return JSON.parse(localStorage.getItem(SNOOZE_KEY)||'[]'); }catch{ return []; } }
function setSnoozes(a){ try{ localStorage.setItem(SNOOZE_KEY, JSON.stringify(a)); }catch{} }
function addSnooze(key, medId, time, at){ setSnoozes(getSnoozes().filter(s=>!(s.key===key&&s.medId===medId&&s.time===time)).concat([{key,medId,time,at}])); }
function removeSnooze(key, medId, time){ setSnoozes(getSnoozes().filter(s=>!(s.key===key&&s.medId===medId&&s.time===time))); }

// Texte der Erinnerung: bei mehreren Profilen steht dabei, für wen
function reminderTitle(med){
  const p = profileById(med.profileId);
  return multiProfile() ? `Dosia · ${p.name}: ${med.name}` : `Dosia · ${med.name}`;
}
function reminderBody(med, time){
  return [time, med.strength || t('Zeit für die Einnahme'), med.trackWeight ? t('Gewicht erfassen') : ''].filter(Boolean).join(' · ');
}

// Alle Dosen ab dem Tag von "start" für "days" Tage, mit Zeitpunkt
function dosesBetween(start, days){
  const out=[], base=new Date(start); base.setHours(0,0,0,0);
  for(let d=0; d<days; d++){
    const day=new Date(base); day.setDate(base.getDate()+d); const key=todayKey(day);
    for(const dose of dosesForDay(key)){
      const [h,m]=dose.time.split(':').map(Number);
      const when=new Date(day); when.setHours(h,m,0,0);
      out.push({ when, key, med:dose.med, time:dose.time });
    }
  }
  return out;
}
const doseOpen = o => !intakeState(o.key, o.med.id, o.time);

// Nächste Dosis eines einzelnen Medikaments (für seltene Rhythmen, bis ~13 Monate voraus)
function nextDoseOf(med, now){
  const base=new Date(now); base.setHours(0,0,0,0);
  for(let d=0; d<400; d++){
    const day=new Date(base); day.setDate(base.getDate()+d); const key=todayKey(day);
    if(!isActiveOn(med, key)) continue;
    for(const t of [...(med.schedule?.times||[])].sort()){
      const [h,m]=t.split(':').map(Number); const when=new Date(day); when.setHours(h,m,0,0);
      const o={ when, key, med, time:t };
      if(when>now && doseOpen(o)) return o;
    }
  }
  return null;
}

// Wann erreicht der Bestand die Warnschwelle, wenn alle geplanten Dosen genommen werden?
// Liefert { when, left } – Zeitpunkt und dann erwarteter Restbestand – oder null
function stockLowDate(med, now){
  let left = med.stock;
  for(const o of dosesBetween(now, 400).filter(o=>o.med.id===med.id && o.when>now && doseOpen(o)).sort((a,b)=>a.when-b.when)){
    left -= 1;
    if(left <= med.stockThreshold) return { when:o.when, left:Math.max(0,left) };
  }
  return null;
}
const at9 = d => { const x=new Date(d); x.setHours(9,0,0,0); return x; };

// Kompletter Erinnerungsplan: [{ kind, at, med, key?, time?, extraText? }]
function reminderPlan(now=new Date()){
  const plan=[], s=DB.settings;
  if(!s.notify) return plan;

  // 1) Dosen: rollierendes Fenster + je Medikament mindestens die nächste Dosis
  const all = dosesBetween(new Date(now.getTime()-86400000), 62);            // ab gestern (Nachhaken über Mitternacht)
  const recent = all.filter(doseOpen);
  const doses = recent.filter(o=>o.when>now).sort((a,b)=>a.when-b.when).slice(0, NOTIF_WINDOW);
  for(const med of DB.meds.filter(m=>!m.archived)){
    if(doses.some(o=>o.med.id===med.id)) continue;
    const nxt=nextDoseOf(med, now); if(nxt) doses.push(nxt);
  }
  doses.forEach(o=>plan.push({ kind:'dose', at:o.when, med:o.med, key:o.key, time:o.time }));

  // 2) Schlummern ("In 10 Min.") – pausiert das Nachhaken dieser Dosis bis dahin
  const snoozeUntil = {};
  for(const sn of getSnoozes()){
    const med=DB.meds.find(m=>m.id===sn.medId);
    if(med && !med.archived && sn.at>now.getTime() && !intakeState(sn.key, sn.medId, sn.time)){
      plan.push({ kind:'snooze', at:new Date(sn.at), med, key:sn.key, time:sn.time });
      snoozeUntil[doseIdent(sn.key, sn.medId, sn.time)] = sn.at;
    }
  }

  // 3) Nachhaken: wiederholt im eingestellten Abstand, bis abgehakt/übersprungen,
  //    höchstens "followUpMax"-mal (0 = unbegrenzt) und nur bis zur nächsten Einnahme desselben Medikaments (max. 24 h).
  if(s.followUp){
    const step = Math.max(5, s.followUpMin||15) * 60000;
    const maxN = s.followUpMax > 0 ? s.followUpMax : Infinity;
    const cands = [], seen = new Set();
    for(const o of recent.filter(o=>o.when<=now).concat(doses).sort((a,b)=>a.when-b.when)){
      const ident = doseIdent(o.key, o.med.id, o.time); if(seen.has(ident)) continue; seen.add(ident);
      const next = all.filter(x=>x.med.id===o.med.id && x.when>o.when).sort((a,b)=>a.when-b.when)[0];
      const end = Math.min(o.when.getTime() + FOLLOWUP_HORIZON_MS, next ? next.when.getTime() : Infinity);
      const pause = snoozeUntil[ident] || 0;
      for(let n=1; n<=maxN; n++){
        const t = o.when.getTime() + n*step;
        if(t >= end) break;
        if(t <= now.getTime() || t <= pause) continue;
        cands.push({ kind:'followup', at:new Date(t), med:o.med, key:o.key, time:o.time, n });
      }
    }
    // Alarm-Budget verteilen: zuerst bekommt JEDE Dosis ihre ersten zwei Nachhak-Erinnerungen,
    // danach wird der Rest nach Dringlichkeit (frühester Zeitpunkt zuerst) aufgefüllt.
    let room = Math.max(0, MAX_ALARMS - plan.length - DB.meds.length);     // Reserve für Nachkauf
    const firstTwo = new Map();                                            // je Dosis die zwei frühesten künftigen
    for(const c of [...cands].sort((a,b)=>a.at-b.at)){
      const id = doseIdent(c.key, c.med.id, c.time), arr = firstTwo.get(id) || [];
      if(arr.length < 2){ arr.push(c); firstTwo.set(id, arr); }
    }
    const guaranteed = [...firstTwo.values()].flat().sort((a,b)=>a.at-b.at).slice(0, room);
    const picked = new Set(guaranteed);
    room -= guaranteed.length;
    const rest = cands.filter(c=>!picked.has(c)).sort((a,b)=>a.at-b.at).slice(0, room);
    guaranteed.concat(rest).forEach(c=>plan.push(c));
  }

  // 4) Nachkauf: einmal pro Knapp-Phase (zurückgesetzt, wenn der Bestand erhöht wird)
  const rs=getRestock();
  for(const med of DB.meds.filter(m=>!m.archived && typeof m.stock==='number' && m.stockThreshold>0)){
    if(rs[med.id] && rs[med.id] <= now.getTime()) continue;              // bereits erinnert
    let at, left;
    if(med.stock <= med.stockThreshold){
      at = rs[med.id] ? new Date(rs[med.id]) : at9(now) > now ? at9(now) : at9(new Date(now.getTime()+86400000));
      left = med.stock;
    } else {
      const low=stockLowDate(med, now); if(!low) continue;
      at = at9(low.when); if(at<=now) at=new Date(now.getTime()+60000);
      left = low.left;
    }
    rs[med.id]=at.getTime();
    // Text auf den Erinnerungszeitpunkt bezogen: erwarteter Rest und wie lange er dann noch reicht
    const perDay=dosesPerDay(med);
    plan.push({ kind:'restock', at, med, left, extraText: perDay>0 ? fmtDays(Math.floor(left/perDay)) : '' });
  }
  setRestock(rs);
  return plan;
}

// Plan -> Benachrichtigungen für das Plugin
function planToNotifications(plan){
  const used = new Set();
  return plan.map(p=>{
    const ident = p.kind==='restock' ? 'restock|'+p.med.id : doseIdent(p.key, p.med.id, p.time);
    const n={ id: stableId(p.kind, ident + (p.kind==='followup' ? '#'+p.n : ''), used),
              schedule:{ at:p.at, allowWhileIdle:true },
              extra:{ kind:p.kind, medId:p.med.id, key:p.key||'', time:p.time||'' } };
    if(p.kind==='restock'){
      n.title = t('🛒 Nachkaufen: {name}',{name:p.med.name});
      n.body  = `${t('Noch etwa {n} übrig',{n:p.left})}${p.extraText?' · '+p.extraText:''}${multiProfile()?' · '+t('für {name}',{name:profileById(p.med.profileId).name}):''}`;
    } else {
      if(p.kind==='followup'){
        const who = multiProfile() ? profileById(p.med.profileId).name+': ' : '';
        const since = p.key===todayKey(p.at) ? p.time : t('gestern {t}',{t:p.time});
        n.title = t('⏰ Noch nicht genommen: {name}',{name:who+p.med.name});
        n.body  = [t('fällig seit {t}',{t:since}), t('{n}. Erinnerung',{n:p.n+1}), p.med.strength||''].filter(Boolean).join(' · ');
      } else {
        n.title = (p.kind==='snooze' ? '⏰ ' : '') + reminderTitle(p.med);
        n.body  = reminderBody(p.med, p.time);
      }
      n.actionTypeId = 'DOSE';
      n.group = 'dosia-' + ident;              // Erinnerungen einer Dosis bündeln
    }
    if(channelReady) n.channelId='dosia-reminders';
    if(p.kind!=='restock' && p.med.alarm) n.alarm = true;   // Wecker-Modus: wird als Wecker statt als Benachrichtigung geplant
    return n;
  });
}

async function ensureChannel(){
  const ln=LN(); if(!ln || !ln.createChannel) return;
  try{
    await ln.createChannel({ id:'dosia-reminders', name:t('Einnahme-Erinnerungen'),
      description:t('Erinnert an die Medikamenten-Einnahme'), importance:5, visibility:1, vibration:true });
    channelReady = true;
  }catch(e){ console.warn('createChannel', e); channelReady=false; }
}

// Alle geplanten Benachrichtigungen neu aufbauen (rollierendes Fenster)
async function nativeReschedule(){
  const ln=LN(); if(!ln) return;
  try{
    // 1) Angezeigte Erinnerungen zu inzwischen erledigten Dosen aus der Leiste entfernen –
    //    alle Erinnerungen dieser Dosis (Dosis, Nachhaken, Schlummern), über die gemerkte Zuordnung
    const nidmap = getNidMap();
    try{
      const del = await ln.getDeliveredNotifications();
      const done = (del.notifications||[]).filter(n=>{
        const ident = nidmap[n.id] || (n.extra && n.extra.key ? doseIdent(n.extra.key, n.extra.medId, n.extra.time) : '');
        if(!ident) return false;
        const [k, medId, time] = ident.split('|');
        return !!intakeState(k, medId, time);
      });
      if(done.length) await ln.removeDeliveredNotifications({ notifications: done.map(n=>({ id:n.id })) });
      const da = DA();
      if(da){
        const ids = Object.entries(nidmap).filter(([,ident])=>{ const [k,medId,time]=ident.split('|'); return !!intakeState(k,medId,time); }).map(([id])=>+id);
        if(ids.length) await da.dismiss({ ids });
      }
    }catch{}

    const pend = await ln.getPending();
    if(pend && pend.notifications && pend.notifications.length){
      await ln.cancel({ notifications: pend.notifications.map(n=>({id:n.id})) });
    }
    if(!DB.settings.notify){ await scheduleAlarms([]); return; }
    // Einstellung kann z. B. aus einer Sicherung auf ein neues Handy kommen,
    // wo Android die Erlaubnis noch nicht erteilt hat -> einmal nachfragen, sonst sichtbar ausschalten.
    let perm = await ln.checkPermissions();
    if(perm.display !== 'granted'){ perm = await ln.requestPermissions(); }
    if(perm.display !== 'granted'){
      DB.settings.notify = false; saveDB({ skipBackup:true }); render();
      alert(t('Erinnerungen wurden ausgeschaltet, weil Android keine Benachrichtigungen für Dosia erlaubt. Du kannst sie unter „Mehr" wieder aktivieren.'));
      return;
    }
    if(!channelReady) await ensureChannel();
    const notifications = planToNotifications(reminderPlan());
    // Wecker-Modus: diese Erinnerungen plant das eigene Plugin als echte Wecker
    const alarms = DA() ? notifications.filter(n=>n.alarm) : [];
    const normal = notifications.filter(n=>!alarms.includes(n));
    normal.forEach(n=>{ delete n.alarm; });
    // Reihenfolge wichtig: erst die Wecker ersetzen (gibt alte frei), dann Benachrichtigungen planen –
    // sonst sind kurz alte und neue gleichzeitig angemeldet und Androids Grenze von 500 wird überschritten.
    await scheduleAlarms(alarms);
    if(normal.length) await ln.schedule({ notifications: normal });

    // 2) Zuordnung Nummer -> Dosis fortschreiben (für das Aufräumen später); Einträge älter als 3 Tage verwerfen
    const keep = todayKey(new Date(Date.now()-3*86400000));
    const map = {};
    for(const [id, ident] of Object.entries(nidmap)) if(ident.split('|')[0] >= keep) map[id] = ident;
    for(const n of notifications) if(n.extra && n.extra.key) map[n.id] = doseIdent(n.extra.key, n.extra.medId, n.extra.time);
    setNidMap(map);
  }catch(e){ console.warn('nativeReschedule', e); }
}

/* ---- Wecker-Modus ---- */
async function scheduleAlarms(list){
  const da = DA(); if(!da) return;
  try{
    await da.schedule({ alarms: list.map(n=>({ id:n.id, at:new Date(n.schedule.at).getTime(), title:n.title, body:n.body,
      takeLabel:t('✓ Genommen'), snoozeLabel:t('⏰ In {n} Min.',{n:SNOOZE_MIN}), extra:n.extra })) });
  }catch(e){ console.warn('scheduleAlarms', e); }
}

// "Genommen" / "Später" am Wecker werden nativ vorgemerkt (auch ohne Entsperren) und hier verbucht
let alarmQueueBusy = false;
async function processAlarmQueue(){
  const da = DA(); if(!da || alarmQueueBusy) return;
  alarmQueueBusy = true;
  try{
    const r = await da.takePending();
    let changed = false, weightFor = null;
    for(const a of (r && r.actions) || []){
      const x = a.extra || {}; if(x.test) continue;
      const med = DB.meds.find(m=>m.id===x.medId); if(!med || !x.key) continue;
      if(a.actionId==='take'){
        if(intakeState(x.key, med.id, x.time)?.status!=='taken'){ setIntake(x.key, med.id, x.time, 'taken', a.ts); changed = true; }
        if(med.trackWeight && x.key===todayKey() && !weightToday(med.profileId) && !weightSkipped(med.profileId)) weightFor = med;
      } else if(a.actionId==='snooze'){
        addSnooze(x.key, med.id, x.time, (a.ts||Date.now()) + SNOOZE_MIN*60000); changed = true;
      }
    }
    if(changed){ render(); await refreshReminders(); }
    if(weightFor && document.visibilityState==='visible'){ currentTab='today'; render(); weightForm(weightFor.profileId, weightFor.id); }
  }catch(e){ console.warn('processAlarmQueue', e); }
  finally{ alarmQueueBusy = false; }
}

/* ---- Zuverlässigkeits-Check ---- */
let relStatus = null;   // Android-Einstellungen (vom Plugin)
const RELHIDE_KEY = 'dosia.relhide.v1';
async function loadReliability(){
  const da = DA(); if(!isNative || !da) return;
  try{ relStatus = await da.getStatus(); }catch(e){ relStatus = null; }
}
// Alle Prüfpunkte: { id, ok, level:'error'|'warn'|'info', title, text, fix:[label, onclick] }
function reliabilityChecks(){
  const s = relStatus; if(!s) return [];
  const anyAlarm = DB.meds.some(m=>!m.archived && m.alarm);
  const open = target => `DA().openSettings({target:'${target}'})`;
  const L = [];
  L.push({ id:'notify', ok:!!DB.settings.notify, level:'error', title:t('Erinnerungen in Dosia eingeschaltet'), text:t('Erinnerungen sind in Dosia ausgeschaltet.'), fix:[t('Einschalten'), 'act.toggleNotify(true)'] });
  L.push({ id:'perm', ok:!!s.notificationsEnabled, level:'error', title:t('Benachrichtigungen erlaubt'), text:t('Android blockiert alle Benachrichtigungen von Dosia.'), fix:[t('Beheben'), open('notifications')] });
  const rc = s.reminderChannel;
  L.push({ id:'channel', ok: rc<0 || rc>=3, level: rc===0 ? 'error' : 'warn', title:t('Erinnerungs-Kanal aktiv'),
    text: rc===0 ? t('Der Kanal „Einnahme-Erinnerungen" ist abgeschaltet.') : t('Der Kanal „Einnahme-Erinnerungen" ist auf lautlos gestellt – Erinnerungen erscheinen ohne Ton und Pop-up.'),
    fix:[t('Beheben'), "DA().openSettings({target:'channel',channel:'dosia-reminders'})"] });
  L.push({ id:'exact', ok:!!s.exactAlarms, level:'error', title:t('Pünktliche Erinnerungen (exakte Wecker)'), text:t('Android erlaubt keine exakten Wecker – Erinnerungen können sich verspäten.'), fix:[t('Beheben'), open('exact')] });
  L.push({ id:'battery', ok:!!s.batteryUnrestricted, level:'warn', title:t('Akku-Optimierung aus'), text:t('Android darf Dosia zum Akkusparen einschränken. Besonders auf Samsung, Xiaomi und Huawei kommen Erinnerungen dann verspätet oder gar nicht.'), fix:[t('Beheben'), open('battery')] });
  L.push({ id:'bg', ok:!s.backgroundRestricted, level:'error', title:t('Hintergrund nicht eingeschränkt'), text:t('Die Hintergrundaktivität von Dosia ist eingeschränkt.'), fix:[t('Beheben'), open('app')] });
  L.push({ id:'bucket', ok:(s.standbyBucket||10) < 40, level:'warn', title:t('App nicht im Tiefschlaf'), text:t('Android hat Dosia als selten genutzt eingestuft. Öffne Dosia regelmäßig oder schalte die Akku-Optimierung aus.'), fix:[t('Beheben'), open('battery')] });
  if(anyAlarm){
    L.push({ id:'fullscreen', ok:!!s.fullScreen, level:'warn', title:t('Wecker bildschirmfüllend erlaubt'), text:t('Android erlaubt Dosia keine bildschirmfüllenden Wecker. Der Wecker klingelt trotzdem, erscheint aber nur als Benachrichtigung.'), fix:[t('Beheben'), open('fullscreen')] });
    const ac = s.alarmChannel;
    L.push({ id:'alarmchannel', ok: ac<0 || ac>=3, level:'warn', title:t('Wecker-Kanal aktiv'), text:t('Der Kanal „Wecker für wichtige Medikamente" ist abgeschaltet oder lautlos.'), fix:[t('Beheben'), "DA().openSettings({target:'channel',channel:'dosia-alarm'})"] });
  }
  if(s.dnd) L.push({ id:'dnd', ok:false, level:'info', title:t('„Nicht stören" ist an'), text:t('Normale Erinnerungen kommen gerade ohne Ton. Wecker klingeln, wenn in „Nicht stören" Wecker erlaubt sind.') });
  if(/samsung/.test(s.manufacturer||'')) L.push({ id:'samsung', ok:false, level:'info', title:t('Samsung: „Schlafende Apps"'), text:t('Prüfe unter Einstellungen → Akku → Hintergrundnutzungslimits, dass Dosia nicht bei „Schlafende Apps" oder „Apps im Tiefschlaf" steht.'), fix:[t('Einstellungen öffnen'), open('app')] });
  return L;
}
const reliabilityProblems = () => reliabilityChecks().filter(c=>!c.ok && c.level!=='info');

// Hinweis oben auf "Heute", solange Erinnerungen gefährdet sind (ausblendbar bis sich etwas ändert)
function reliabilityTodayCard(){
  if(!DB.settings.notify) return '';
  const probs = reliabilityProblems(); if(!probs.length) return '';
  const sig = probs.map(p=>p.id).join(',');
  let hidden=''; try{ hidden = localStorage.getItem(RELHIDE_KEY)||''; }catch{}
  if(hidden===sig && !probs.some(p=>p.level==='error')) return '';
  return `<div class="card" style="border-color:var(--${probs.some(p=>p.level==='error')?'danger':'warn'})"><div class="row">
      <div class="pill">🔔</div>
      <div class="grow"><div class="title" style="white-space:normal">${t('Erinnerungen könnten ausfallen')}</div>
        <div class="sub">${t('Bitte prüfen: {n} Einstellung(en) gefährden deine Erinnerungen.',{n:probs.length})}</div></div></div>
    <div class="actions" style="margin-top:10px">
      <button class="btn-primary btn-sm" onclick="act.openCheck()">${t('Jetzt prüfen')}</button>
      ${probs.some(p=>p.level==='error')?'':`<button class="btn-ghost btn-sm" onclick="act.hideCheck('${sig}')">${t('Ausblenden')}</button>`}
    </div></div>`;
}

// Karte unter "Mehr"
function reliabilityCard(){
  let h = `<div class="card" id="relCard"><div class="title">${t('Zuverlässigkeit der Erinnerungen')}</div>`;
  if(!isNative || !DA()) return h + `<div class="sub">${t('Nur in der Android-App verfügbar.')}</div></div>`;
  h += `<div class="sub">${t('Prüft die Android-Einstellungen, die Erinnerungen verhindern oder verzögern können.')}</div>`;
  const checks = reliabilityChecks();
  if(!relStatus){ return h + `<div class="sub" style="margin-top:8px">${t('Bitte warten …')}</div></div>`; }
  const probs = checks.filter(c=>!c.ok && c.level!=='info');
  h += probs.length ? '' : `<div class="notice" style="border-left-color:var(--ok);background:rgba(31,138,112,.08)">✅ ${t('Alles in Ordnung – deine Erinnerungen kommen zuverlässig an.')}</div>`;
  for(const c of checks){
    const icon = c.ok ? '✅' : c.level==='error' ? '❌' : c.level==='warn' ? '⚠️' : 'ℹ️';
    h += `<div class="dose-item" style="align-items:flex-start">
      <div style="font-size:18px;line-height:1.3">${icon}</div>
      <div class="grow"><div class="title" style="white-space:normal;font-size:15px">${c.title}</div>
        ${c.ok ? '' : `<div class="sub">${c.text}</div>`}</div>
      ${!c.ok && c.fix ? `<button class="btn-ghost btn-sm" onclick="${c.fix[1]}">${c.fix[0]}</button>` : ''}
    </div>`;
  }
  h += `<div class="actions" style="margin-top:10px">
      <button class="btn-ghost btn-sm" onclick="act.testReminder()">${t('Test-Erinnerung in 10 Sek.')}</button>
      ${checks.some(c=>c.id==='fullscreen') || DB.meds.some(m=>!m.archived&&m.alarm) ? `<button class="btn-ghost btn-sm" onclick="act.testAlarm()">${t('Test-Wecker in 10 Sek.')}</button>` : ''}
    </div>
    <div class="hint">${t('Nach dem Ändern einer Einstellung kehre zu Dosia zurück – die Prüfung aktualisiert sich automatisch.')}</div></div>`;
  return h;
}

// Sprache
function languageCard(){
  const p = I18N.pref;
  return `<div class="card"><div class="title">${t('Sprache')}${I18N.lang==='de' ? ' · Language' : ''}</div>
    <div class="chips">${[['auto',t('Systemsprache')],['de','Deutsch'],['en','English']].map(([v,l])=>
      `<span class="chip ${p===v?'on':''}" onclick="act.setLang('${v}')">${l}</span>`).join('')}</div></div>`;
}

/* ---- Knöpfe in der Benachrichtigung: "✓ Genommen" / "⏰ In 10 Min." ---- */
let visibleSince = Date.now();
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') visibleSince = Date.now(); });

async function setupNotificationActions(){
  const ln=LN(); if(!ln || !ln.registerActionTypes) return;
  try{
    await ln.registerActionTypes({ types:[{ id:'DOSE', actions:[
      { id:'take',   title:t('✓ Genommen') },
      { id:'snooze', title:t('⏰ In {n} Min.',{n:SNOOZE_MIN}) }
    ]}]});
    await ln.addListener('localNotificationActionPerformed', ev=>handleNotificationAction(ev));
  }catch(e){ console.warn('setupNotificationActions', e); }
}

async function handleNotificationAction(ev){
  const n = (ev && ev.notification) || {}, x = n.extra || {}, actionId = ev && ev.actionId;
  // Wurde die App erst durch den Knopf geöffnet? Dann danach wieder schließen.
  const openedByAction = Date.now() - visibleSince < 4000;
  try{ await LN().removeDeliveredNotifications({ notifications:[{ id:n.id }] }); }catch{}
  const med = DB.meds.find(m=>m.id===x.medId);

  if(actionId==='take' && med && x.key){
    if(intakeState(x.key, med.id, x.time)?.status!=='taken') setIntake(x.key, med.id, x.time, 'taken');
    currentTab='today'; closeModal(); render(); await refreshReminders();
    // Gewicht fällig? Dann App offen lassen und danach fragen
    if(med.trackWeight && x.key===todayKey() && !weightToday(med.profileId) && !weightSkipped(med.profileId)){ weightForm(med.profileId, med.id); return; }
    if(openedByAction) minimizeApp();
  } else if(actionId==='snooze' && med && x.key){
    addSnooze(x.key, med.id, x.time, Date.now() + SNOOZE_MIN*60000);
    await refreshReminders();
    if(openedByAction) minimizeApp();
  } else {
    // normales Antippen: Dosia mit "Heute" (bzw. Medikamente bei Nachkauf) öffnen
    currentTab = x.kind==='restock' ? 'meds' : 'today'; closeModal(); render();
  }
}
function minimizeApp(){ try{ const A=Cap && Cap.Plugins && Cap.Plugins.App; if(A && A.minimizeApp) A.minimizeApp(); }catch{} }

// Web-Fallback (nur geöffnet)
let reminderTimer=null;
const firedKey = ()=> 'dosia.fired.'+todayKey();
function getFired(){ try{ return JSON.parse(localStorage.getItem(firedKey())||'[]'); }catch{ return []; } }
function addFired(k){ const f=getFired(); f.push(k); try{ localStorage.setItem(firedKey(), JSON.stringify(f)); }catch{} }
function webReminderLoop(){
  clearInterval(reminderTimer);
  if(!DB.settings.notify || !('Notification' in window)) return;
  reminderTimer=setInterval(webCheck, 30000); webCheck();
}
function webCheck(){
  if(!DB.settings.notify || !('Notification' in window) || Notification.permission!=='granted') return;
  const key=todayKey(), now=new Date(), nowHM=pad(now.getHours())+':'+pad(now.getMinutes());
  const fired=getFired();
  for(const dose of dosesForDay(key)){
    const fk=dose.medId+'|'+dose.time;
    if(dose.time<=nowHM && !fired.includes(fk)){
      if(!intakeState(key,dose.medId,dose.time)){
        try{ new Notification(reminderTitle(dose.med), { body:reminderBody(dose.med, dose.time), tag:fk }); }catch{}
      }
      addFired(fk);
    }
  }
}

// Einheitlicher Einstiegspunkt: nach jeder zeitplanrelevanten Änderung aufrufen
// Neuplanungen laufen strikt nacheinander, damit sich Löschen und Einplanen nicht überschneiden
let rescheduleChain = Promise.resolve();
function refreshReminders(){
  if(!isNative){ webReminderLoop(); return Promise.resolve(); }
  rescheduleChain = rescheduleChain.then(()=>nativeReschedule()).catch(e=>console.warn('refreshReminders', e));
  return rescheduleChain;
}

/* ======================================================================
   THEME + PWA + START
====================================================================== */
function applyTheme(){
  const t=DB.settings.theme||'auto';
  if(t==='auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; if(currentTab==='more') render(); });

$('#fab').onclick=()=>{ if(currentTab==='measure') act.newMeasure(); else act.newMed(); };
document.querySelectorAll('#tabs button').forEach(b=> b.onclick=()=>{ currentTab=b.dataset.tab; closeModal(); render(); });

// Täglicher Rollover: um Mitternacht neu rendern
setInterval(()=>{ if(currentTab==='today') render(); }, 60000);

// Service Worker nur in der Browser-/PWA-Version; in der App alte Registrierungen entfernen
if('serviceWorker' in navigator){
  if(isNative){
    navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
  } else {
    navigator.serviceWorker.register('sw.js').catch(e=>console.warn('SW:',e));
  }
}

// Feste Texte aus index.html übersetzen
document.title = t('Dosia – Medikamente');
$('#fab').title = t('Hinzufügen');
document.querySelectorAll('#tabs button').forEach(b=>{ const n=[...b.childNodes].pop(); if(n && n.nodeType===3) n.textContent=t(n.textContent.trim()); });
applyTheme();
render();
// Beim Start: Kanal sicherstellen und Erinnerungen (neu) einplanen
(async()=>{
  if(isNative){ await ensureChannel(); await setupNotificationActions(); }
  if(DA()){ try{ await DA().addListener('alarmQueue', ()=>processAlarmQueue()); }catch{} await processAlarmQueue(); }
  await refreshReminders();
  await loadReliability(); render();
})();
// Beim Zurückkehren in die App: Ansicht und Erinnerungen auffrischen (z. B. nach Tageswechsel)
document.addEventListener('visibilitychange', async ()=>{
  if(document.visibilityState!=='visible') return;
  render(); await processAlarmQueue(); refreshReminders();
  await loadReliability(); render();                 // z. B. nach dem Ändern einer Android-Einstellung
});
// Google-Drive-Sicherung: spätestens alle 24 h
GDrive.onStart();
// Homepage-Variante: nach App-Updates suchen
Updater.init();
