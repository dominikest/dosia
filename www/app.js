/* Dosia – lokale Medikamentenverwaltung (PWA, offline).
   Eigener Code, eigenes Datenmodell. Alle Daten bleiben im Gerät (localStorage). */
'use strict';

/* ---------- Speicher ---------- */
const APP_VERSION = '1.0.1';
const DB_KEY = 'dosia.db.v1';
const defaultDB = () => ({
  version: 1,
  meds: [],          // {id,name,form,strength,color,icon,stock,stockThreshold,schedule,notes,interact,createdAt,archived}
  intake: {},        // { "YYYY-MM-DD": { "medId|HH:MM": {status:'taken'|'skipped', ts} } }
  measures: [],      // {id,type,value,value2,unit,ts,note}
  settings: { notify:false, theme:'auto', medfriend:'' }
});

let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return defaultDB();
    const d = JSON.parse(raw);
    return Object.assign(defaultDB(), d);
  }catch(e){ console.warn('DB load failed', e); return defaultDB(); }
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch(e){ alert('Speichern fehlgeschlagen – evtl. ist der Speicher voll.'); }
}

/* ---------- Helfer ---------- */
const $ = (s,el=document)=>el.querySelector(s);
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const pad = n=> String(n).padStart(2,'0');
const todayKey = (d=new Date())=> `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtDate = d => d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WD = ['So','Mo','Di','Mi','Do','Fr','Sa']; // getDay(): 0=So

const FORMS = [
  {v:'tablette',t:'Tablette',ic:'💊'},{v:'kapsel',t:'Kapsel',ic:'💊'},
  {v:'tropfen',t:'Tropfen',ic:'💧'},{v:'spritze',t:'Spritze/Injektion',ic:'💉'},
  {v:'inhalator',t:'Inhalator',ic:'🫁'},{v:'salbe',t:'Salbe/Creme',ic:'🧴'},
  {v:'saft',t:'Saft',ic:'🥤'},{v:'pflaster',t:'Pflaster',ic:'🩹'},{v:'sonstige',t:'Sonstige',ic:'➕'}
];
const formIcon = f => (FORMS.find(x=>x.v===f)||{}).ic || '💊';

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
  if(s.start && dateKey < s.start) return false;
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
  }
  saveDB();
}
function adjustStock(medId, delta){
  const med = DB.meds.find(m=>m.id===medId);
  if(med && typeof med.stock==='number'){
    med.stock = Math.max(0, med.stock + delta);
  }
}

/* ---------- Adhärenz-Statistik ---------- */
function adherence(days=7){
  let taken=0, planned=0;
  const now=new Date();
  for(let i=0;i<days;i++){
    const d=new Date(now); d.setDate(now.getDate()-i);
    const key=todayKey(d);
    for(const dose of dosesForDay(key)){
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
  const doses=dosesForDay(key);
  const ad=adherence(1);
  let html = `<h2 class="section">Heute · ${doses.length} ${doses.length===1?'Dosis':'Dosen'}</h2>`;

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
          <div class="sub">${esc(d.med.strength||'')} ${skip?'· <span style="color:var(--danger)">übersprungen</span>':''} ${taken?'· <span style="color:var(--ok)">genommen</span>':''}</div></div>
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
  const meds=DB.meds.filter(m=>!m.archived);
  let html=`<h2 class="section">Medikamente · ${meds.length}</h2>`;
  if(!meds.length){
    html+=`<div class="empty"><div class="big">💊</div>Noch keine Medikamente.<br><span class="muted">Tippe auf „+", um eines anzulegen.</span></div>`;
    view.innerHTML=html; return;
  }
  for(const med of meds){
    const low = typeof med.stock==='number' && med.stock<= (med.stockThreshold??0) && (med.stockThreshold>0);
    const sched=scheduleSummary(med.schedule);
    html+=`<div class="card"><div class="row">
      <div class="pill" style="background:${med.color||'var(--surface-2)'}22">${formIcon(med.form)}</div>
      <div class="grow" onclick="act.editMed('${med.id}')">
        <div class="title">${esc(med.name)}</div>
        <div class="sub">${esc(med.strength||'')} · ${esc(sched)}</div>
        <div style="margin-top:6px">
          ${typeof med.stock==='number'?`<span class="tag ${low?'danger':'ok'}">Bestand: ${med.stock}${low?' · niedrig':''}</span>`:''}
          ${med.interact?`<span class="tag warn">⚠ Wechselwirkung</span>`:''}
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
  let html=`<h2 class="section">Messwerte</h2>`;
  const byType={};
  for(const m of DB.measures){ (byType[m.type]=byType[m.type]||[]).push(m); }
  if(!DB.measures.length){
    html+=`<div class="empty"><div class="big">📈</div>Noch keine Messwerte.<br><span class="muted">„+" erfasst Blutdruck, Blutzucker, Gewicht …</span></div>`;
    view.innerHTML=html; return;
  }
  for(const type of Object.keys(byType)){
    const t=mType(type);
    const list=byType[type].sort((a,b)=>b.ts-a.ts);
    const last=list[0];
    html+=`<div class="card"><div class="row"><div class="pill">${t.ic}</div>
      <div class="grow"><div class="title">${t.t}</div>
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
function fmtMeasure(m){
  const t=mType(m.type);
  if(t.two) return `${m.value}/${m.value2} ${t.unit}`;
  return `${m.value} ${m.unit||t.unit}`;
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
  let html=`<h2 class="section">Verlauf &amp; Therapietreue</h2>`;
  html+=`<div class="card"><div class="stat">
     <div><div class="k">${ad7.pct??'–'}${ad7.pct!=null?'%':''}</div><div class="l">7 Tage</div></div>
     <div><div class="k">${ad30.pct??'–'}${ad30.pct!=null?'%':''}</div><div class="l">30 Tage</div></div>
     <div><div class="k">${ad7.taken}/${ad7.planned}</div><div class="l">Dosen (7 T.)</div></div>
   </div></div>`;

  // Letzte 14 Tage
  html+=`<div class="card"><div class="title" style="margin-bottom:8px">Letzte 14 Tage</div>`;
  for(let i=0;i<14;i++){
    const d=new Date(); d.setDate(d.getDate()-i); const key=todayKey(d);
    const doses=dosesForDay(key);
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
    <div class="title">Erinnerungen</div>
    <div class="sub">${isNative
      ? 'Geplante Benachrichtigungen zu den Einnahmezeiten – auch bei geschlossener App.'
      : 'Benachrichtigungen, solange Dosia geöffnet ist (Browser-Version).'}</div>
    <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
      <input type="checkbox" id="setNotify" ${s.notify?'checked':''}> Erinnerungen aktivieren</label>
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
    <div class="sub">Nur lokal gespeichert – wird bei ausgelassenen Dosen angezeigt.</div>
    <label>Name / Telefon</label>
    <input id="setMedfriend" value="${esc(s.medfriend||'')}" placeholder="z. B. Anna · 0170 …">
  </div>`;

  html+=`<div class="card">
    <div class="title">Datensicherung</div>
    <div class="sub">Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig.</div>
    <div class="actions" style="margin-top:10px">
      <button class="btn-primary btn-sm" onclick="act.exportData()">⤓ Backup exportieren</button>
      <button class="btn-ghost btn-sm" onclick="act.importData()">⤒ Backup importieren</button>
    </div>
  </div>`;

  html+=`<div class="card">
    <div class="title">Installieren</div>
    <div class="sub">Im Browser-Menü „Zum Startbildschirm hinzufügen" wählen – dann läuft Dosia wie eine App, offline.</div>
    <div class="actions" style="margin-top:10px"><button class="btn-ghost btn-sm" id="installBtn" style="display:none">App installieren</button></div>
  </div>`;

  html+=`<div class="card">
    <button class="btn-danger btn-sm" onclick="act.wipe()">Alle Daten löschen</button>
  </div>`;

  html+=`<div class="hint">Dosia ersetzt keine ärztliche oder pharmazeutische Beratung. Prüfe Dosierungen und Wechselwirkungen immer mit Arzt oder Apotheke.</div>`;
  html+=`<div class="sub center" style="margin-top:14px">Dosia ${APP_VERSION} · ${isNative?'App':'Browser'}${isNative&&!LN()?' · Benachrichtigungs-Plugin fehlt':''}</div>`;

  view.innerHTML=html;

  $('#setNotify').onchange=e=>{ act.toggleNotify(e.target.checked); };
  $('#setMedfriend').onchange=e=>{ DB.settings.medfriend=e.target.value.trim(); saveDB(); };
  $('#themeChips').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ act.setTheme(c.dataset.theme); });
  if(deferredPrompt){ const b=$('#installBtn'); b.style.display='inline-block'; b.onclick=()=>act.install(); }
}

/* ======================================================================
   MODALS (Formulare)
====================================================================== */
const modalBg=$('#modalBg'), modal=$('#modal');
function openModal(html){ modal.innerHTML=html; modalBg.classList.add('open'); }
function closeModal(){ modalBg.classList.remove('open'); modal.innerHTML=''; }
modalBg.addEventListener('click',e=>{ if(e.target===modalBg) closeModal(); });

function medForm(med){
  const m = med || {id:'',name:'',form:'tablette',strength:'',color:'#1f8a70',stock:'',stockThreshold:'',
                    notes:'',interact:false, schedule:{type:'daily',times:['08:00'],weekdays:[1,2,3,4,5],everyDays:2,onDays:21,offDays:7}};
  const s=m.schedule||{type:'daily',times:['08:00']};
  openModal(`
    <div class="modal-head"><h3>${med?'Medikament bearbeiten':'Neues Medikament'}</h3><button class="btn-ghost btn-sm" onclick="act.closeModal()">Schließen</button></div>
    <label>Name</label><input id="mName" value="${esc(m.name)}" placeholder="z. B. Ramipril">
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
      <div><label>Warnen ab</label><input type="number" id="mThresh" value="${m.stockThreshold??''}" placeholder="z. B. 7" min="0"></div>
    </div>

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
    <label>Art</label>
    <select id="xType" onchange="act.measureTypeChange()">${MEASURE_TYPES.map(t=>`<option value="${t.v}">${t.ic} ${t.t}</option>`).join('')}</select>
    <div id="xFields"></div>
    <label>Notiz (optional)</label><input id="xNote" placeholder="z. B. nach dem Essen">
    <div class="actions" style="margin-top:16px"><button class="btn-primary grow" onclick="act.saveMeasure()">Speichern</button></div>
  `);
  act.measureTypeChange();
}

/* ======================================================================
   AKTIONEN
====================================================================== */
const act = {
  closeModal,
  // Heute
  take(key,medId,time){ const cur=intakeState(key,medId,time); setIntake(key,medId,time, cur?.status==='taken'?null:'taken'); render(); refreshReminders(); },
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
    if(!name){ alert('Bitte einen Namen eingeben.'); return; }
    tmpTimes=[...new Set(tmpTimes)].sort();
    const sched={ type:$('#mType').value, times:tmpTimes,
      everyDays:tmpSched.everyDays, weekdays:tmpSched.weekdays, onDays:tmpSched.onDays, offDays:tmpSched.offDays, anchor:tmpSched.anchor,
      start:$('#mStart').value||'', end:$('#mEnd').value||'' };
    const data={
      name, form:$('#mForm').value, strength:$('#mStrength').value.trim(), color:$('#mColor').value,
      stock: $('#mStock').value===''?null:Math.max(0,+$('#mStock').value),
      stockThreshold: $('#mThresh').value===''?0:Math.max(0,+$('#mThresh').value),
      notes:$('#mNotes').value.trim(), interact:$('#mInteract').checked, schedule:sched
    };
    if(id){ Object.assign(DB.meds.find(m=>m.id===id), data); }
    else{ DB.meds.push(Object.assign({id:uid(),createdAt:new Date().toISOString(),archived:false}, data)); }
    saveDB(); closeModal(); render(); refreshReminders();
  },
  archiveMed(id){ if(confirm('Dieses Medikament löschen? Der Verlauf bleibt erhalten.')){ const m=DB.meds.find(x=>x.id===id); if(m)m.archived=true; saveDB(); closeModal(); render(); refreshReminders(); } },
  // Messwerte
  newMeasure(){ measureForm(); },
  measureTypeChange(){
    const t=mType($('#xType').value); const el=$('#xFields');
    if(t.two){ el.innerHTML=`<div class="grid2"><div><label>${t.ph[0]} (${t.unit})</label><input type="number" id="xVal" inputmode="decimal"></div>
      <div><label>${t.ph[1]}</label><input type="number" id="xVal2" inputmode="decimal"></div></div>`; }
    else{ el.innerHTML=`<label>Wert ${t.unit?'('+t.unit+')':''}</label><input type="number" id="xVal" inputmode="decimal">${t.v==='custom'?'<label>Einheit</label><input id="xUnit" placeholder="z. B. mg/l">':''}`; }
  },
  saveMeasure(){
    const type=$('#xType').value, t=mType(type);
    const v=$('#xVal').value; if(v===''){ alert('Bitte einen Wert eingeben.'); return; }
    DB.measures.push({ id:uid(), type, value:+v, value2: t.two? (+($('#xVal2').value||0)) : undefined,
      unit: type==='custom'? ($('#xUnit')?.value||'') : t.unit, ts:Date.now(), note:$('#xNote').value.trim() });
    saveDB(); closeModal(); render();
  },
  delMeasure(id){ if(confirm('Messwert löschen?')){ DB.measures=DB.measures.filter(m=>m.id!==id); saveDB(); render(); } },
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
  exportData(){
    const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`dosia-backup-${todayKey()}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  importData(){
    const inp=document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange=()=>{ const f=inp.files[0]; if(!f)return; const r=new FileReader();
      r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.meds){throw 0;}
        if(confirm('Backup einspielen? Aktuelle Daten werden ersetzt.')){ DB=Object.assign(defaultDB(),d); saveDB(); render(); refreshReminders(); alert('Backup eingespielt.'); } }
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
const NOTIF_WINDOW = 64;   // so viele kommende Dosen im Voraus einplanen
let channelReady = false;

// Nächste fällige Dosen über alle Medikamente (nur Zukunft, offene)
function nextDoseOccurrences(limit){
  const out=[]; const now=new Date();
  for(let d=0; d<30 && out.length<limit*2; d++){
    const day=new Date(now); day.setDate(now.getDate()+d); const key=todayKey(day);
    for(const dose of dosesForDay(key)){
      const [h,m]=dose.time.split(':').map(Number);
      const when=new Date(day); when.setHours(h,m,0,0);
      if(when.getTime() > now.getTime()+20000){
        if(!(key===todayKey() && intakeState(key,dose.medId,dose.time))){
          out.push({ when, med:dose.med, time:dose.time });
        }
      }
    }
  }
  out.sort((a,b)=>a.when-b.when);
  return out.slice(0,limit);
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
    const occ = nextDoseOccurrences(NOTIF_WINDOW);
    if(!occ.length) return;
    const notifications = occ.map((o,i)=>{
      const n = {
        id: i+1,
        title: 'Dosia · '+o.med.name,
        body: (o.time+' · '+(o.med.strength||'Zeit für die Einnahme')).trim(),
        schedule: { at: o.when, allowWhileIdle: true }
      };
      if(channelReady) n.channelId='dosia-reminders';
      return n;
    });
    await ln.schedule({ notifications });
  }catch(e){ console.warn('nativeReschedule', e); }
}

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
        try{ new Notification('Dosia · Zeit für '+dose.med.name, { body:(dose.time+' · '+(dose.med.strength||'')).trim(), tag:fk }); }catch{}
      }
      addFired(fk);
    }
  }
}

// Einheitlicher Einstiegspunkt: nach jeder zeitplanrelevanten Änderung aufrufen
async function refreshReminders(){
  if(isNative){ await nativeReschedule(); }
  else { webReminderLoop(); }
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
(async()=>{ if(isNative){ await ensureChannel(); } await refreshReminders(); })();
