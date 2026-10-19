/* Dosia – lokale Medikamentenverwaltung (PWA, offline).
   Eigener Code, eigenes Datenmodell. Alle Daten bleiben im Gerät (localStorage). */
'use strict';

/* ---------- Speicher ---------- */
const APP_VERSION = window.DOSIA_VERSION || '?';   // kommt aus version.js (package.json)
const DB_KEY = 'dosia.db.v1';
const defaultDB = () => ({
  version: 2,
  profiles: [{ id:'me', name:'Ich', kind:'person' }],   // für wen: Personen oder Tiere
  meds: [],          // {id,profileId,name,form,strength,color,stock,stockThreshold,schedule,notes,interact,trackWeight,createdAt,archived}
  intake: {},        // { "YYYY-MM-DD": { "medId|HH:MM": {status:'taken'|'skipped', ts} } }
  measures: [],      // {id,profileId,medId?,type,value,value2,unit,ts,note}
  settings: { notify:false, theme:'auto', medfriend:'', profileFilter:'all', followUp:true, followUpMin:30 }
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
  catch(e){ alert('Speichern fehlgeschlagen – evtl. ist der Speicher voll.'); return; }
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
const fmtDate = d => d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa']; // getDay(): 0=So
// Zahl aus Eingabe mit Komma oder Punkt ("12,5" / "12.5"); leer/ungültig -> NaN
const parseNum = s => { const t=String(s??'').trim().replace(/\s/g,'').replace(',','.'); return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN; };

const FORMS = [
  {v:'tablette',t:'Tablette',ic:'💊'},{v:'kapsel',t:'Kapsel',ic:'💊'},
  {v:'tropfen',t:'Tropfen',ic:'💧'},{v:'spritze',t:'Spritze/Injektion',ic:'💉'},
  {v:'inhalator',t:'Inhalator',ic:'🫁'},{v:'salbe',t:'Salbe/Creme',ic:'🧴'},
  {v:'saft',t:'Saft',ic:'🥤'},{v:'pflaster',t:'Pflaster',ic:'🩹'},{v:'sonstige',t:'Sonstige',ic:'➕'}
];
const formIcon = f => (FORMS.find(x=>x.v===f)||{}).ic || '💊';

/* ---------- Profile (Person / Tier) ---------- */
const PROFILE_KINDS = [
  {v:'person',t:'Person',ic:'🧑'},{v:'hund',t:'Hund',ic:'🐶'},{v:'katze',t:'Katze',ic:'🐱'},
  {v:'kaninchen',t:'Kaninchen',ic:'🐰'},{v:'vogel',t:'Vogel',ic:'🐦'},{v:'pferd',t:'Pferd',ic:'🐴'},
  {v:'tier',t:'Anderes Tier',ic:'🐾'}
];
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
    <span class="chip ${f==='all'?'on':''}" onclick="act.setProfileFilter('all')">Alle</span>
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
function setIntake(dateKey, medId, time, status){
  DB.intake[dateKey] = DB.intake[dateKey]||{};
  const key = medId+'|'+time;
  const prev = DB.intake[dateKey][key];
  if(status===null){
    delete DB.intake[dateKey][key];
    // Bestand zurückgeben, falls vorher genommen
    if(prev?.status==='taken') adjustStock(medId, +1);
  }else{
    DB.intake[dateKey][key] = {status, ts:Date.now()};
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
const fmtDays = n => n===0 ? 'heute leer' : n===1 ? 'reicht ~1 Tag' : `reicht ~${n} Tage`;

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
  ({today:renderToday, meds:renderMeds, measure:renderMeasure, history:renderHistory, more:renderMore}[currentTab])();
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===currentTab));
}

/* ---- Heute ---- */
function renderToday(){
  const key=todayKey();
  const doses=visibleDoses(key);
  let html = profileBar() + `<h2 class="section">Heute · ${doses.length} ${doses.length===1?'Dosis':'Dosen'}</h2>`;

  // Gewicht fällig (Medikament mit Gewichtserfassung läuft, heute noch kein Gewicht)
  for(const p of weightDueProfiles(key)){
    html += `<div class="card"><div class="row">
      <div class="pill">⚖️</div>
      <div class="grow"><div class="title">Gewicht${multiProfile()?' · '+profileLabel(p):''}</div>
        <div class="sub">Heute noch nicht erfasst</div></div>
      <button class="btn-primary btn-sm" onclick="act.weightForm('${p.id}')">Erfassen</button>
    </div></div>`;
  }

  // Vorrat knapp
  for(const med of DB.meds.filter(m=>!m.archived && inFilter(m.profileId))){
    const si=stockInfo(med); if(!si || !si.low) continue;
    html += `<div class="card"><div class="row">
      <div class="pill">🛒</div>
      <div class="grow"><div class="title">Nachkaufen: ${esc(med.name)}</div>
        <div class="sub">${multiProfile()?profileLabel(profileById(med.profileId))+' · ':''}noch ${med.stock}${si.daysLeft!=null?' · '+fmtDays(si.daysLeft):''}</div></div>
      <button class="btn-ghost btn-sm" onclick="act.editMed('${med.id}')">Bestand</button>
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
        <div class="grow"><div class="title">Seit über 2 Std. offen</div>
          <div class="sub">${overdue.map(d=>`${esc(d.med.name)} (${d.time})`).join(', ')}</div>
          <div class="sub" style="margin-top:4px">Notfall-Kontakt: <b>${esc(contact)}</b></div></div>
      </div>${phone?`<div class="actions" style="margin-top:10px">
        <a class="btn-primary btn-sm" style="text-decoration:none;border-radius:10px;padding:7px 11px" href="tel:${phone}">📞 Anrufen</a>
        <a class="btn-ghost btn-sm" style="text-decoration:none;border-radius:10px;padding:7px 11px;color:var(--text)" href="sms:${phone}">💬 SMS</a></div>`:''}</div>`;
    }
  }

  if(!doses.length){
    html += `<div class="empty"><div class="big">🗓️</div>Für heute sind keine Einnahmen geplant.<br><span class="muted">Lege unter „Medikamente" etwas an.</span></div>`;
    view.innerHTML=html; return;
  }

  // Fortschritt
  const takenCount = doses.filter(d=>intakeState(key,d.medId,d.time)?.status==='taken').length;
  html += `<div class="card"><div class="row"><div class="grow">
      <div class="title">Fortschritt heute</div>
      <div class="sub">${takenCount} von ${doses.length} genommen</div>
      <div class="bar"><i style="width:${doses.length?takenCount/doses.length*100:0}%"></i></div>
    </div><div class="stat"><div><div class="k">${Math.round((doses.length?takenCount/doses.length:0)*100)}%</div></div></div></div></div>`;

  // Gruppiert nach Uhrzeit
  const groups={};
  for(const d of doses){ (groups[d.time]=groups[d.time]||[]).push(d); }
  const nowHM = pad(new Date().getHours())+':'+pad(new Date().getMinutes());

  for(const time of Object.keys(groups).sort()){
    html += `<div class="card"><div class="row" style="margin-bottom:4px"><div class="time">${time}</div>`;
    const overdue = time < nowHM;
    html += `<div class="grow"></div>${overdue?'<span class="tag warn">fällig</span>':'<span class="tag">geplant</span>'}</div>`;
    for(const d of groups[time]){
      const st=intakeState(key,d.medId,d.time);
      const taken=st?.status==='taken', skip=st?.status==='skipped';
      html += `<div class="dose-item ${taken?'state-taken':''}">
        <div class="pill" style="background:${d.med.color||'var(--surface-2)'}22">${formIcon(d.med.form)}</div>
        <div class="grow"><div class="title">${esc(d.med.name)}</div>
          <div class="sub">${multiProfile()&&DB.settings.profileFilter==='all'?profileLabel(profileById(d.med.profileId))+' · ':''}${esc(d.med.strength||'')}${d.med.trackWeight?' · ⚖️':''} ${skip?'· <span style="color:var(--danger)">übersprungen</span>':''} ${taken?'· <span style="color:var(--ok)">genommen</span>':''}</div></div>
        <div class="take">
          <button class="btn-round ${taken?'btn-primary':''}" title="Genommen" onclick="act.take('${key}','${d.medId}','${d.time}')">✓</button>
          <button class="btn-round ${skip?'btn-danger':'btn-ghost'}" title="Überspringen" onclick="act.skip('${key}','${d.medId}','${d.time}')">⤬</button>
        </div></div>`;
    }
    html += `</div>`;
  }
  view.innerHTML=html;
}

/* ---- Medikamente ---- */
function renderMeds(){
  const meds=DB.meds.filter(m=>!m.archived && inFilter(m.profileId));
  let html=profileBar() + `<h2 class="section">Medikamente · ${meds.length}</h2>`;
  if(!meds.length){
    html+=`<div class="empty"><div class="big">💊</div>Noch keine Medikamente.<br><span class="muted">Tippe auf „+", um eines anzulegen.</span></div>`;
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
            return `<span class="tag ${si.low?'danger':'ok'}">Bestand: ${med.stock}${si.daysLeft!=null?' · '+fmtDays(si.daysLeft):''}${si.low?' · nachkaufen':''}</span>`; })()}
          ${med.interact?`<span class="tag warn">⚠ Wechselwirkung</span>`:''}
          ${med.trackWeight?`<span class="tag">⚖️ Gewicht</span>`:''}
        </div>
      </div>
      <button class="btn-round btn-ghost" onclick="act.editMed('${med.id}')">✎</button>
    </div></div>`;
  }
  view.innerHTML=html;
}
function scheduleSummary(s){
  if(!s) return 'kein Plan';
  const times=(s.times||[]).join(', ')||'–';
  if(s.type==='daily') return `täglich ${times}`;
  if(s.type==='interval') return `alle ${s.everyDays||1} Tage ${times}`;
  if(s.type==='weekdays') return `${(s.weekdays||[]).map(d=>WD[d]).join('/')} ${times}`;
  if(s.type==='weeks') return `${(s.everyWeeks||1)===1?'wöchentlich':'alle '+s.everyWeeks+' Wochen'} ${times}`;
  if(s.type==='months') return `${(s.everyMonths||1)===1?'monatlich':'alle '+s.everyMonths+' Monate'} ${times}`;
  if(s.type==='cycle') return `${s.onDays} an / ${s.offDays} aus · ${times}`;
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
];
const mType=v=>MEASURE_TYPES.find(t=>t.v===v)||MEASURE_TYPES[5];
function renderMeasure(){
  let html=profileBar() + `<h2 class="section">Messwerte</h2>`;
  const visible = DB.measures.filter(m=>inFilter(m.profileId));
  // Gruppen je Profil und Art (Gewicht von "Ich" und "Bello" getrennt)
  const groups={};
  for(const m of visible){ const k=m.profileId+'|'+m.type; (groups[k]=groups[k]||[]).push(m); }
  if(!visible.length){
    html+=`<div class="empty"><div class="big">📈</div>Noch keine Messwerte.<br><span class="muted">„+" erfasst Blutdruck, Blutzucker, Gewicht …</span></div>`;
    view.innerHTML=html; return;
  }
  const order = k => { const [pid,type]=k.split('|'); return DB.profiles.findIndex(p=>p.id===pid)*100 + MEASURE_TYPES.findIndex(t=>t.v===type); };
  for(const gk of Object.keys(groups).sort((a,b)=>order(a)-order(b))){
    const [pid,type]=gk.split('|');
    const t=mType(type);
    const list=groups[gk].sort((a,b)=>b.ts-a.ts);
    const last=list[0];
    html+=`<div class="card"><div class="row"><div class="pill">${t.ic}</div>
      <div class="grow"><div class="title">${t.t}${multiProfile()?' · '+profileLabel(profileById(pid)):''}</div>
      <div class="sub">zuletzt: <span class="measure-val">${fmtMeasure(last)}</span> · ${new Date(last.ts).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div></div>`;
    html+=sparkline(list.slice(0,20).reverse());
    html+=`<hr class="sep">`;
    html+=list.slice(0,6).map(m=>`<div class="row" style="padding:3px 0">
        <div class="grow sub">${new Date(m.ts).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} ${m.note?'· '+esc(m.note):''}</div>
        <div class="measure-val">${fmtMeasure(m)}</div>
        <button class="btn-round btn-ghost btn-sm" onclick="act.delMeasure('${m.id}')" title="Löschen">🗑</button></div>`).join('');
    html+=`</div>`;
  }
  view.innerHTML=html;
}
const fmtNum = n => (typeof n==='number' && !isNaN(n)) ? n.toLocaleString('de-DE',{maximumFractionDigits:3}) : String(n??'');
function fmtMeasure(m){
  const t=mType(m.type);
  if(t.two) return `${fmtNum(m.value)}/${fmtNum(m.value2)} ${t.unit}`;
  return `${fmtNum(m.value)} ${m.unit||t.unit}`;
}
function sparkline(list){
  if(list.length<2) return '<div class="sub muted">(zu wenig Daten für Verlauf)</div>';
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
  let html=profileBar() + `<h2 class="section">Verlauf &amp; Therapietreue</h2>`;
  html+=`<div class="card"><div class="stat">
     <div><div class="k">${ad7.pct??'–'}${ad7.pct!=null?'%':''}</div><div class="l">7 Tage</div></div>
     <div><div class="k">${ad30.pct??'–'}${ad30.pct!=null?'%':''}</div><div class="l">30 Tage</div></div>
     <div><div class="k">${ad7.taken}/${ad7.planned}</div><div class="l">Dosen (7 T.)</div></div>
   </div></div>`;

  // Letzte 14 Tage
  html+=`<div class="card"><div class="title" style="margin-bottom:8px">Letzte 14 Tage</div>`;
  for(let i=0;i<14;i++){
    const d=new Date(); d.setDate(d.getDate()-i); const key=todayKey(d);
    const doses=visibleDoses(key);
    if(!doses.length) continue;
    let taken=0,skip=0;
    for(const dose of doses){ const s=intakeState(key,dose.medId,dose.time)?.status; if(s==='taken')taken++; else if(s==='skipped')skip++; }
    const pct=doses.length?taken/doses.length*100:0;
    html+=`<div class="row" style="padding:5px 0">
      <div class="sub" style="width:120px">${d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})}</div>
      <div class="grow bar"><i style="width:${pct}%;background:${pct>=100?'var(--ok)':pct>=50?'var(--warn)':'var(--danger)'}"></i></div>
      <div class="sub" style="width:54px;text-align:right">${taken}/${doses.length}</div></div>`;
  }
  html+=`</div>`;
  view.innerHTML=html;
}

/* ---- Mehr ---- */
function renderMore(){
  const s=DB.settings;
  let html=`<h2 class="section">Mehr</h2>`;

  html+=`<div class="card">
    <div class="title">Personen &amp; Tiere</div>
    <div class="sub">Für wen sind die Medikamente? Lege z. B. ein Familienmitglied oder dein Haustier an.</div>
    ${DB.profiles.map(p=>{
      const n=DB.meds.filter(m=>!m.archived&&m.profileId===p.id).length;
      return `<div class="dose-item">
        <div class="pill">${kindIcon(p.kind)}</div>
        <div class="grow"><div class="title">${esc(p.name)}</div>
          <div class="sub">${(PROFILE_KINDS.find(k=>k.v===p.kind)||PROFILE_KINDS[0]).t} · ${n} ${n===1?'Medikament':'Medikamente'}</div></div>
        <button class="btn-round btn-ghost" onclick="act.profileForm('${p.id}')" title="Bearbeiten">✎</button>
      </div>`;}).join('')}
    <div class="actions" style="margin-top:10px"><button class="btn-ghost btn-sm" onclick="act.profileForm('')">+ Person oder Tier hinzufügen</button></div>
  </div>`;

  html+=`<div class="card">
    <div class="title">Erinnerungen</div>
    <div class="sub">${isNative
      ? 'Geplante Benachrichtigungen zu den Einnahmezeiten – auch bei geschlossener App.'
      : 'Benachrichtigungen, solange Dosia geöffnet ist (Browser-Version).'}</div>
    <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
      <input type="checkbox" id="setNotify" ${s.notify?'checked':''}> Erinnerungen aktivieren</label>
    ${isNative ? `<label style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <input type="checkbox" id="setFollow" ${s.followUp?'checked':''}> Nachhaken, wenn nicht abgehakt – nach
      <select id="setFollowMin" style="width:auto;padding:6px 8px">${[15,30,60,120].map(n=>`<option value="${n}" ${s.followUpMin===n?'selected':''}>${n<60?n+' Min.':(n/60)+' Std.'}</option>`).join('')}</select></label>
    <div class="sub">In der Benachrichtigung kannst du direkt auf „✓ Genommen" oder „⏰ In 10 Min." tippen.</div>` : ''}
    ${isNative
      ? `<div class="hint">Falls keine Erinnerungen ankommen: In den Android-Einstellungen unter <b>Apps → Dosia → Benachrichtigungen</b> erlauben und bei <b>Akku</b> „nicht optimiert/uneingeschränkt" wählen, damit Android die App nicht einschläfert.</div>`
      : `<div class="notice">⚠ In der Browser-Version können Erinnerungen bei geschlossener Seite nicht garantiert werden. Für zuverlässige Erinnerungen die installierte App nutzen.</div>`}
  </div>`;

  html+=`<div class="card">
    <div class="title">Darstellung</div>
    <div class="chips" id="themeChips">
      ${['auto','light','dark'].map(t=>`<span class="chip ${s.theme===t?'on':''}" data-theme="${t}">${{auto:'Automatisch',light:'Hell',dark:'Dunkel'}[t]}</span>`).join('')}
    </div>
  </div>`;

  html+=`<div class="card">
    <div class="title">Notfall-Kontakt (MedFriend)</div>
    <div class="sub">Nur auf diesem Gerät gespeichert. Ist eine Dosis seit über 2 Stunden offen, zeigt „Heute" den Kontakt mit Knöpfen zum Anrufen und für eine SMS.</div>
    <label>Name / Telefon</label>
    <input id="setMedfriend" value="${esc(s.medfriend||'')}" placeholder="z. B. Anna · 0170 …">
  </div>`;

  html+=`<div class="card">${GDrive.cardHtml()}</div>`;

  html+=`<div class="card">
    <div class="title">Datensicherung</div>
    <div class="sub">Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig.</div>
    <div class="actions" style="margin-top:10px">
      <button class="btn-primary btn-sm" onclick="act.exportData()">⤓ Backup exportieren</button>
      <button class="btn-ghost btn-sm" onclick="act.importData()">⤒ Backup importieren</button>
    </div>
  </div>`;

  if(!isNative) html+=`<div class="card">
    <div class="title">Installieren</div>
    <div class="sub">Im Browser-Menü „Zum Startbildschirm hinzufügen" wählen – dann läuft Dosia wie eine App, offline.</div>
    <div class="actions" style="margin-top:10px"><button class="btn-ghost btn-sm" id="installBtn" style="display:none">App installieren</button></div>
  </div>`;

  html+=`<div class="card">
    <button class="btn-danger btn-sm" onclick="act.wipe()">Alle Daten löschen</button>
  </div>`;

  html+=`<div class="hint">Dosia ersetzt keine ärztliche oder pharmazeutische Beratung. Prüfe Dosierungen und Wechselwirkungen immer mit Arzt oder Apotheke.</div>`;
  if(window.DOSIA_PRIVACY_URL) html+=`<div class="sub center" style="margin-top:14px"><a href="${esc(window.DOSIA_PRIVACY_URL)}" style="color:var(--accent)">Datenschutzerklärung</a></div>`;
  html+=`<div class="sub center" style="margin-top:14px">Dosia ${APP_VERSION} · ${isNative?'App':'Browser'}${isNative&&!LN()?' · Benachrichtigungs-Plugin fehlt':''}</div>`;

  view.innerHTML=html;

  $('#setNotify').onchange=e=>{ act.toggleNotify(e.target.checked); };
  if($('#setFollow')){
    $('#setFollow').onchange=e=>{ DB.settings.followUp=e.target.checked; saveDB(); refreshReminders(); };
    $('#setFollowMin').onchange=e=>{ DB.settings.followUpMin=+e.target.value; saveDB(); refreshReminders(); };
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
    <div class="modal-head"><h3>${med?'Medikament bearbeiten':'Neues Medikament'}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>
    <label>Für</label>
    <select id="mProfile" onchange="document.getElementById('mNewProfile').style.display=this.value==='__new'?'block':'none'">
      ${DB.profiles.map(p=>`<option value="${p.id}" ${m.profileId===p.id?'selected':''}>${kindIcon(p.kind)} ${esc(p.name)}</option>`).join('')}
      <option value="__new">＋ Neue Person / neues Tier …</option>
    </select>
    <div id="mNewProfile" style="display:none">
      <div class="grid2">
        <div><label>Name</label><input id="mNewName" placeholder="z. B. Bello"></div>
        <div><label>Art</label><select id="mNewKind">${PROFILE_KINDS.map(k=>`<option value="${k.v}">${k.ic} ${k.t}</option>`).join('')}</select></div>
      </div>
    </div>
    <label>Medikament</label><input id="mName" value="${esc(m.name)}" placeholder="z. B. Ramipril">
    <div class="grid2">
      <div><label>Form</label><select id="mForm">${FORMS.map(f=>`<option value="${f.v}" ${m.form===f.v?'selected':''}>${f.ic} ${f.t}</option>`).join('')}</select></div>
      <div><label>Stärke / Dosis</label><input id="mStrength" value="${esc(m.strength)}" placeholder="z. B. 5 mg"></div>
    </div>
    <label>Farbe</label><input type="color" id="mColor" value="${m.color||'#1f8a70'}" style="height:44px;padding:4px">

    <hr class="sep"><div class="title" style="font-size:15px">Einnahmeplan</div>
    <label>Rhythmus</label>
    <select id="mType">
      <option value="daily" ${s.type==='daily'?'selected':''}>Täglich</option>
      <option value="interval" ${s.type==='interval'?'selected':''}>Alle X Tage</option>
      <option value="weekdays" ${s.type==='weekdays'?'selected':''}>Bestimmte Wochentage</option>
      <option value="weeks" ${s.type==='weeks'?'selected':''}>Alle X Wochen</option>
      <option value="months" ${s.type==='months'?'selected':''}>Alle X Monate</option>
      <option value="cycle" ${s.type==='cycle'?'selected':''}>Zyklus (X Tage an / Y aus)</option>
    </select>
    <div id="schedExtra"></div>

    <label>Uhrzeiten</label>
    <div id="timeList"></div>
    <button class="btn-ghost btn-sm" onclick="act.addTime()" style="margin-top:6px">+ Uhrzeit</button>

    <div class="grid2" style="margin-top:4px">
      <div><label>Start (optional)</label><input type="date" id="mStart" value="${s.start||''}"></div>
      <div><label>Ende (optional)</label><input type="date" id="mEnd" value="${s.end||''}"></div>
    </div>

    <hr class="sep"><div class="title" style="font-size:15px">Bestand</div>
    <div class="grid2">
      <div><label>Aktueller Bestand</label><input type="number" id="mStock" value="${m.stock??''}" placeholder="z. B. 30" min="0"></div>
      <div><label>Nachkauf-Erinnerung ab (Stück)</label><input type="number" id="mThresh" value="${m.stockThreshold??''}" placeholder="z. B. 7" min="0"></div>
    </div>
    <div class="sub">Dosia zieht jede abgehakte Einnahme ab, zeigt an, wie viele Tage der Vorrat reicht, und erinnert rechtzeitig ans Nachkaufen. Nach dem Kauf hier den neuen Bestand eintragen.</div>

    <hr class="sep"><div class="title" style="font-size:15px">Gewicht</div>
    <label style="display:flex;align-items:center;gap:10px;color:var(--text)"><input type="checkbox" id="mWeight" ${m.trackWeight?'checked':''}> ⚖️ Gewicht mit erfassen</label>
    <div class="sub">Solange das Medikament läuft (Start bis Ende), fragt Dosia beim ersten Abhaken am Tag nach dem Gewicht – höchstens einmal täglich.</div>

    <hr class="sep">
    <label style="display:flex;align-items:center;gap:10px"><input type="checkbox" id="mInteract" ${m.interact?'checked':''}> ⚠ Wechselwirkung/Hinweis markieren</label>
    <label>Notizen (Einnahmehinweise, Wechselwirkungen …)</label>
    <textarea id="mNotes" rows="3" placeholder="z. B. nüchtern einnehmen; nicht mit Grapefruit">${esc(m.notes)}</textarea>

    <div class="actions" style="margin-top:16px">
      <button class="btn-primary grow" onclick="act.saveMed('${m.id}')">Speichern</button>
      ${med?`<button class="btn-danger" onclick="act.archiveMed('${m.id}')">Löschen</button>`:''}
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
  const t=tmpSched.type;
  if(t==='interval'){
    el.innerHTML=`<label>Alle wie viele Tage?</label><input type="number" min="1" id="mEvery" value="${tmpSched.everyDays||2}" onchange="tmpSched.everyDays=+this.value">`;
  }else if(t==='weeks' || t==='months'){
    const k = t==='weeks' ? 'everyWeeks' : 'everyMonths';
    el.innerHTML=`<label>Alle wie viele ${t==='weeks'?'Wochen':'Monate'}?</label>
      <input type="number" min="1" value="${tmpSched[k]||1}" onchange="tmpSched.${k}=Math.max(1,+this.value||1)">
      <div class="sub">Gerechnet ab dem Startdatum unten – ohne Startdatum ab heute.${t==='months'?' Gibt es den Tag in einem Monat nicht (z. B. 31.), dann am Monatsletzten.':''}</div>`;
  }else if(t==='weekdays'){
    el.innerHTML=`<label>Wochentage</label><div class="chips">${[1,2,3,4,5,6,0].map(d=>`<span class="chip ${(tmpSched.weekdays||[]).includes(d)?'on':''}" onclick="act.toggleWd(${d},this)">${WD[d]}</span>`).join('')}</div>`;
  }else if(t==='cycle'){
    el.innerHTML=`<div class="grid2"><div><label>Tage „an"</label><input type="number" min="1" id="mOn" value="${tmpSched.onDays||21}" onchange="tmpSched.onDays=+this.value"></div>
      <div><label>Tage „aus"</label><input type="number" min="0" id="mOff" value="${tmpSched.offDays||7}" onchange="tmpSched.offDays=+this.value"></div></div>
      <label>Zyklus-Start</label><input type="date" id="mAnchor" value="${tmpSched.anchor||tmpSched.start||todayKey()}" onchange="tmpSched.anchor=this.value">`;
  }else{ el.innerHTML=''; }
}

function measureForm(){
  openModal(`
    <div class="modal-head"><h3>Messwert erfassen</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>
    ${multiProfile()?`<label>Für</label><select id="xProfile">${DB.profiles.map(p=>`<option value="${p.id}" ${(DB.settings.profileFilter===p.id)?'selected':''}>${kindIcon(p.kind)} ${esc(p.name)}</option>`).join('')}</select>`:''}
    <label>Art</label>
    <select id="xType" onchange="act.measureTypeChange()">${MEASURE_TYPES.map(t=>`<option value="${t.v}">${t.ic} ${t.t}</option>`).join('')}</select>
    <div id="xFields"></div>
    <label>Notiz (optional)</label><input id="xNote" placeholder="z. B. nach dem Essen">
    <div class="actions" style="margin-top:16px"><button class="btn-primary grow" onclick="act.saveMeasure()">Speichern</button></div>
  `);
  act.measureTypeChange();
}

// Gewicht schnell erfassen (aus "Heute" oder automatisch beim Abhaken)
function weightForm(profileId, medId){
  const p=profileById(profileId);
  const last=DB.measures.filter(m=>m.type==='weight'&&m.profileId===p.id).sort((a,b)=>b.ts-a.ts)[0];
  openModal(`
    <div class="modal-head"><h3>⚖️ Gewicht${multiProfile()?' · '+profileLabel(p):''}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>
    <div class="sub">${last?`Zuletzt: <b>${fmtNum(last.value)} kg</b> am ${new Date(last.ts).toLocaleDateString('de-DE')}`:'Noch kein Gewicht erfasst.'}</div>
    <label>Gewicht (kg)</label>
    <input type="text" id="wVal" inputmode="decimal" autocomplete="off" placeholder="${last?fmtNum(last.value):'z. B. 12,5'}">
    <div class="actions" style="margin-top:16px">
      <button class="btn-primary grow" onclick="act.saveWeight('${p.id}','${medId||''}')">Speichern</button>
      <button class="btn-ghost" onclick="act.skipWeight('${p.id}')">Heute nicht</button>
    </div>`);
  setTimeout(()=>{ const i=$('#wVal'); if(i) i.focus(); }, 50);
}

// Person / Tier anlegen oder bearbeiten
function profileForm(id){
  const p = id ? DB.profiles.find(x=>x.id===id) : { id:'', name:'', kind:'person' };
  openModal(`
    <div class="modal-head"><h3>${id?'Bearbeiten':'Person oder Tier hinzufügen'}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>
    <label>Name</label><input id="pName" value="${esc(p.name)}" placeholder="z. B. Mama, Bello, Minka">
    <label>Art</label>
    <select id="pKind">${PROFILE_KINDS.map(k=>`<option value="${k.v}" ${p.kind===k.v?'selected':''}>${k.ic} ${k.t}</option>`).join('')}</select>
    <div class="actions" style="margin-top:16px">
      <button class="btn-primary grow" onclick="act.saveProfile('${p.id}')">Speichern</button>
      ${id && DB.profiles.length>1 ? `<button class="btn-danger" onclick="act.deleteProfile('${p.id}')">Löschen</button>` : ''}
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
    if(!name){ alert('Bitte einen Namen für das Medikament eingeben.'); return; }
    // Für wen? Ggf. direkt eine neue Person / ein neues Tier anlegen
    let profileId=$('#mProfile').value;
    if(profileId==='__new'){
      const pname=$('#mNewName').value.trim();
      if(!pname){ alert('Bitte einen Namen für die neue Person bzw. das Tier eingeben.'); return; }
      profileId=uid();
      DB.profiles.push({ id:profileId, name:pname, kind:$('#mNewKind').value });
    }
    tmpTimes=[...new Set(tmpTimes)].sort();
    const sched={ type:$('#mType').value, times:tmpTimes,
      everyDays:tmpSched.everyDays, everyWeeks:tmpSched.everyWeeks, everyMonths:tmpSched.everyMonths,
      weekdays:tmpSched.weekdays, onDays:tmpSched.onDays, offDays:tmpSched.offDays, anchor:tmpSched.anchor,
      start:$('#mStart').value||'', end:$('#mEnd').value||'' };
    const data={
      profileId, trackWeight:$('#mWeight').checked,
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
  archiveMed(id){ if(confirm('Dieses Medikament löschen? Der Verlauf bleibt erhalten.')){ const m=DB.meds.find(x=>x.id===id); if(m)m.archived=true; saveDB(); closeModal(); render(); refreshReminders(); } },
  // Messwerte
  newMeasure(){ measureForm(); },
  measureTypeChange(){
    const t=mType($('#xType').value); const el=$('#xFields');
    if(t.two){ el.innerHTML=`<div class="grid2"><div><label>${t.ph[0]} (${t.unit})</label><input type="text" id="xVal" inputmode="decimal" autocomplete="off"></div>
      <div><label>${t.ph[1]}</label><input type="text" id="xVal2" inputmode="decimal" autocomplete="off"></div></div>`; }
    else{ el.innerHTML=`<label>Wert ${t.unit?'('+t.unit+')':''}</label><input type="text" id="xVal" inputmode="decimal" autocomplete="off">${t.v==='custom'?'<label>Einheit</label><input id="xUnit" placeholder="z. B. mg/l">':''}`; }
  },
  saveMeasure(){
    const type=$('#xType').value, t=mType(type);
    const v=parseNum($('#xVal').value); if(isNaN(v)){ alert('Bitte einen gültigen Wert eingeben.'); return; }
    const v2=t.two ? parseNum($('#xVal2').value) : undefined;
    if(t.two && isNaN(v2)){ alert('Bitte beide Werte eingeben.'); return; }
    const pid = $('#xProfile') ? $('#xProfile').value : (DB.settings.profileFilter!=='all' ? DB.settings.profileFilter : DB.profiles[0].id);
    DB.measures.push({ id:uid(), profileId:pid, type, value:v, value2: v2,
      unit: type==='custom'? ($('#xUnit')?.value||'') : t.unit, ts:Date.now(), note:$('#xNote').value.trim() });
    saveDB(); closeModal(); render();
  },
  delMeasure(id){ if(confirm('Messwert löschen?')){ DB.measures=DB.measures.filter(m=>m.id!==id); saveDB(); render(); } },
  // Gewicht
  weightForm(pid, medId){ weightForm(pid, medId); },
  saveWeight(pid, medId){
    const v=parseNum($('#wVal').value);
    if(!(v>0)){ alert('Bitte ein gültiges Gewicht eingeben, z. B. 12,5'); return; }
    const med=DB.meds.find(m=>m.id===medId);
    DB.measures.push({ id:uid(), profileId:pid, medId:medId||undefined, type:'weight', value:Math.round(v*1000)/1000, unit:'kg', ts:Date.now(), note: med?('zu '+med.name):'' });
    saveDB(); closeModal(); render();
  },
  skipWeight(pid){ markWeightSkipped(pid); closeModal(); render(); },
  // Personen & Tiere
  setProfileFilter(pid){ DB.settings.profileFilter=pid; saveDB({ skipBackup:true }); render(); },
  profileForm(id){ profileForm(id); },
  saveProfile(id){
    const name=$('#pName').value.trim(), kind=$('#pKind').value;
    if(!name){ alert('Bitte einen Namen eingeben.'); return; }
    if(id){ Object.assign(DB.profiles.find(p=>p.id===id), { name, kind }); }
    else{ DB.profiles.push({ id:uid(), name, kind }); }
    saveDB(); closeModal(); render(); refreshReminders();
  },
  deleteProfile(id){
    const p=DB.profiles.find(x=>x.id===id); if(!p || DB.profiles.length<2) return;
    const n=DB.meds.filter(m=>!m.archived&&m.profileId===id).length, w=DB.measures.filter(m=>m.profileId===id).length;
    if(!confirm(`„${p.name}" löschen?\n\nDabei werden auch ${n} Medikament(e) und ${w} Messwert(e) von ${p.name} gelöscht.`)) return;
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
        if(!ln){ alert('Benachrichtigungen werden auf diesem Gerät nicht unterstützt.'); DB.settings.notify=false; render(); return; }
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
        if(!granted){ alert('Bitte erlaube Benachrichtigungen für Dosia in den Android-Einstellungen.'); }
        else { await ensureChannel(); }
      } else {
        if(!('Notification' in window)){ alert('Dieser Browser unterstützt keine Benachrichtigungen.'); DB.settings.notify=false; render(); return; }
        const perm = await Notification.requestPermission();
        DB.settings.notify = perm==='granted';
        if(perm!=='granted') alert('Benachrichtigungen wurden nicht erlaubt.');
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
        await P.Share.share({ title:'Dosia-Backup', text:`Dosia-Backup vom ${new Date().toLocaleDateString('de-DE')}`, files:[r.uri], dialogTitle:'Backup speichern oder teilen' });
      }catch(e){
        if(!/cancel/i.test((e && e.message)||'')) alert('Backup konnte nicht exportiert werden: '+((e && e.message)||e));
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
        if(confirm('Backup einspielen? Aktuelle Daten werden ersetzt.')){ replaceDB(d); alert('Backup eingespielt.'); } }
        catch(e){ alert('Ungültige Backup-Datei.'); } };
      r.readAsText(f); };
    inp.click();
  },
  wipe(){ if(confirm('Wirklich ALLE Daten unwiderruflich löschen?')){ DB=defaultDB(); saveDB(); render(); refreshReminders(); } },
  install(){ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; } },
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
const NOTIF_WINDOW = 48;   // so viele kommende Dosen im Voraus einplanen (plus je Medikament die nächste)
const SNOOZE_MIN = 10;
// Benachrichtigungs-IDs je Art: Dosis 1–999, Nachhaken 1000–1999, Schlummern 2000–2999, Nachkauf 3000–3999
const NID = { dose:1, followup:1000, snooze:2000, restock:3000 };
let channelReady = false;

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
  return [time, med.strength || 'Zeit für die Einnahme', med.trackWeight ? 'Gewicht erfassen' : ''].filter(Boolean).join(' · ');
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
  const recent = dosesBetween(new Date(now.getTime()-86400000), 62).filter(doseOpen);   // ab gestern (Nachhaken über Mitternacht)
  const doses = recent.filter(o=>o.when>now).sort((a,b)=>a.when-b.when).slice(0, NOTIF_WINDOW);
  for(const med of DB.meds.filter(m=>!m.archived)){
    if(doses.some(o=>o.med.id===med.id)) continue;
    const nxt=nextDoseOf(med, now); if(nxt) doses.push(nxt);
  }
  doses.forEach(o=>plan.push({ kind:'dose', at:o.when, med:o.med, key:o.key, time:o.time }));

  // 2) Nachhaken: für geplante und bereits fällige, noch offene Dosen
  if(s.followUp){
    const ms=(s.followUpMin||30)*60000, seen=new Set();
    for(const o of recent.filter(o=>o.when<=now).concat(doses)){
      const id=o.key+'|'+o.med.id+'|'+o.time; if(seen.has(id)) continue; seen.add(id);
      const at=new Date(o.when.getTime()+ms);
      if(at>now) plan.push({ kind:'followup', at, med:o.med, key:o.key, time:o.time });
    }
  }

  // 3) Schlummern ("In 10 Min.")
  for(const sn of getSnoozes()){
    const med=DB.meds.find(m=>m.id===sn.medId);
    if(med && !med.archived && sn.at>now.getTime() && !intakeState(sn.key, sn.medId, sn.time))
      plan.push({ kind:'snooze', at:new Date(sn.at), med, key:sn.key, time:sn.time });
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
  const counters={ dose:0, followup:0, snooze:0, restock:0 };
  return plan.map(p=>{
    const n={ id: NID[p.kind] + (counters[p.kind]++), schedule:{ at:p.at, allowWhileIdle:true },
              extra:{ kind:p.kind, medId:p.med.id, key:p.key||'', time:p.time||'' } };
    if(p.kind==='restock'){
      n.title = `🛒 Nachkaufen: ${p.med.name}`;
      n.body  = `Noch etwa ${p.left} übrig${p.extraText?' · '+p.extraText:''}${multiProfile()?' · für '+profileById(p.med.profileId).name:''}`;
    } else {
      n.title = (p.kind==='followup' ? '⏰ Noch offen · ' : '') + reminderTitle(p.med);
      n.body  = p.kind==='followup' ? `Noch nicht abgehakt · ${reminderBody(p.med, p.time)}` : reminderBody(p.med, p.time);
      n.actionTypeId = 'DOSE';
    }
    if(channelReady) n.channelId='dosia-reminders';
    return n;
  });
}

async function ensureChannel(){
  const ln=LN(); if(!ln || !ln.createChannel) return;
  try{
    await ln.createChannel({ id:'dosia-reminders', name:'Einnahme-Erinnerungen',
      description:'Erinnert an die Medikamenten-Einnahme', importance:5, visibility:1, vibration:true });
    channelReady = true;
  }catch(e){ console.warn('createChannel', e); channelReady=false; }
}

// Alle geplanten Benachrichtigungen neu aufbauen (rollierendes Fenster)
async function nativeReschedule(){
  const ln=LN(); if(!ln) return;
  try{
    const pend = await ln.getPending();
    if(pend && pend.notifications && pend.notifications.length){
      await ln.cancel({ notifications: pend.notifications.map(n=>({id:n.id})) });
    }
    if(!DB.settings.notify) return;
    // Einstellung kann z. B. aus einer Sicherung auf ein neues Handy kommen,
    // wo Android die Erlaubnis noch nicht erteilt hat -> einmal nachfragen, sonst sichtbar ausschalten.
    let perm = await ln.checkPermissions();
    if(perm.display !== 'granted'){ perm = await ln.requestPermissions(); }
    if(perm.display !== 'granted'){
      DB.settings.notify = false; saveDB({ skipBackup:true }); render();
      alert('Erinnerungen wurden ausgeschaltet, weil Android keine Benachrichtigungen für Dosia erlaubt. Du kannst sie unter „Mehr" wieder aktivieren.');
      return;
    }
    if(!channelReady) await ensureChannel();
    const notifications = planToNotifications(reminderPlan());
    if(notifications.length) await ln.schedule({ notifications });

    // Bereits angezeigte Erinnerungen zu inzwischen erledigten Dosen aus der Leiste entfernen
    try{
      const del = await ln.getDeliveredNotifications();
      const done = (del.notifications||[]).filter(n=>{ const x=n.extra||{}; return x.key && x.medId && intakeState(x.key, x.medId, x.time); });
      if(done.length) await ln.removeDeliveredNotifications({ notifications: done });
    }catch{}
  }catch(e){ console.warn('nativeReschedule', e); }
}

/* ---- Knöpfe in der Benachrichtigung: "✓ Genommen" / "⏰ In 10 Min." ---- */
let visibleSince = Date.now();
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') visibleSince = Date.now(); });

async function setupNotificationActions(){
  const ln=LN(); if(!ln || !ln.registerActionTypes) return;
  try{
    await ln.registerActionTypes({ types:[{ id:'DOSE', actions:[
      { id:'take',   title:'✓ Genommen' },
      { id:'snooze', title:`⏰ In ${SNOOZE_MIN} Min.` }
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

applyTheme();
render();
// Beim Start: Kanal sicherstellen und Erinnerungen (neu) einplanen
(async()=>{ if(isNative){ await ensureChannel(); await setupNotificationActions(); } await refreshReminders(); })();
// Beim Zurückkehren in die App: Ansicht und Erinnerungen auffrischen (z. B. nach Tageswechsel)
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible'){ render(); refreshReminders(); } });
// Google-Drive-Sicherung: spätestens alle 24 h
GDrive.onStart();
