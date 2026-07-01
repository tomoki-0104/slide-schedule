/* =========================================================================
 * app.js — スライド式スケジュール 本体ロジック
 *   描画・操作（スクロール / 連日選択 / D&D / 追加・編集 / 月ジャンプ）
 *   ルーティン行・フリーコメント欄
 *   保存は store.js（Store）に委譲：AES-GCM 暗号化 + localStorage / schedule.json
 * ========================================================================= */
const DAY_W=46, LANE_H=30, HEAD_H=70, LABEL_W=52, NOTE_H=67;
const WD=['日','月','火','水','木','金','土'];
const RANGE_START='2026-01-01', RANGE_END='2026-12-31';

const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const fmt=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const[y,m,dd]=s.split('-').map(Number);return new Date(y,m-1,dd);};

const days=[];
for(let d=parse(RANGE_START); d<=parse(RANGE_END); d.setDate(d.getDate()+1)) days.push(fmt(d));
const idxOf=s=>days.indexOf(s);

// 月の区切り（月ジャンプ用）
const months=[];
days.forEach((s,i)=>{const d=parse(s);const key=d.getFullYear()+'-'+d.getMonth();
  if(!months.length||months[months.length-1].key!==key)
    months.push({key,label:`${d.getFullYear()}年${d.getMonth()+1}月`,idx:i});});

// ---------- state / セッションパスワード ----------
let state = Store.emptyState();
let sessionPwd = null;

function id(){ return 'k'+Math.random().toString(36).slice(2,9); }
function stamp(t){ if(t) t.updatedAt = Store.nowISO(); }

function markPendingSync(){
  const b=$('btnCloudSync'); if(b) b.classList.add('sync-pending');
}
function clearPendingSync(){
  const b=$('btnCloudSync'); if(b) b.classList.remove('sync-pending');
}

async function save(){
  if(!state.meta) state.meta={updatedAt:'',owner:''};
  state.meta.updatedAt = Store.nowISO();
  await Store.saveLocalEnc(state, sessionPwd);
  markPendingSync();
}

function seed(){return[
  {id:id(),type:'plan',title:'DR会議',start:'2026-06-08',end:'',lane:0,updatedAt:Store.nowISO()},
  {id:id(),type:'plan',title:'AI定例報告会',start:'2026-06-09',end:'',lane:1,updatedAt:Store.nowISO()},
  {id:id(),type:'fix', title:'栃木工場出張',start:'2026-06-09',end:'2026-06-11',lane:2,updatedAt:Store.nowISO()},
  {id:id(),type:'fix', title:'食事会',start:'2026-06-09',end:'',lane:4,time:'18:00',place:'横浜駅',updatedAt:Store.nowISO()},
  {id:id(),type:'ms',  title:'本番立ち上げ',start:'2026-06-24',end:'',lane:0,updatedAt:Store.nowISO()},
];}

const isWeekend=s=>{const w=parse(s).getDay();return w===0||w===6;};
const isGrey=s=>isWeekend(s)||state.holidays.includes(s)||(s in (state.holidayMaster||{}));
const markerOf=t=>t==='plan'?'■':t==='fix'?'□':'★';
function laneCount(){let m=0;state.tasks.forEach(t=>m=Math.max(m,t.lane||0));return Math.max(m+3,14);}
function durationDays(t){const si=idxOf(t.start),ei=t.end?idxOf(t.end):-1;return (t.end&&ei>si)?(ei-si+1):1;}

// 背景色に対するテキスト色（黒/白）
function contrastColor(hex){
  if(!hex||hex[0]!=='#')return'#333';
  const r=parseInt(hex.slice(1,3),16)||0,g=parseInt(hex.slice(3,5),16)||0,b=parseInt(hex.slice(5,7),16)||0;
  return(0.299*r+0.587*g+0.114*b)>140?'#333':'#fff';
}

let selectedId=null;
let selectedNote=null;
let selectedNote2=null;
let selectedNote3=null;
let selectedNote4=null;
let selectedNote5=null;
let selectedRR=null;  // {rid,date} ルーティンセル選択

function updateTodayLine(){
  const tIdx=idxOf(fmt(new Date()));
  const today=$('today');
  if(!today||tIdx<0)return;
  const now=new Date(), minOfDay=now.getHours()*60+now.getMinutes();
  today.style.left=(tIdx*DAY_W+minOfDay/1440*DAY_W)+'px';
}

function render(){
  const colbg=$('colbg'),head=$('head'),lanes=$('lanes'),grid=$('grid');
  const LANES=laneCount(), lanesH=LANES*LANE_H, fullH=HEAD_H+lanesH;
  const totalW=days.length*DAY_W;
  const routineH=(state.routineRows||[]).length*LANE_H;
  const totalH=fullH+routineH+NOTE_H*5;
  grid.style.width=totalW+'px'; grid.style.height=totalH+'px';

  let bg=''; colbg.style.width=totalW+'px'; colbg.style.height=totalH+'px';
  days.forEach((s,i)=>{
    if(isGrey(s)) bg+=`<div class="col grey" style="left:${i*DAY_W}px;height:${totalH}px"></div>`;
    const ms=(parse(s).getDate()===1)||i===0;
    bg+=`<div class="vline${ms?' month':''}" style="left:${i*DAY_W}px;height:${totalH}px"></div>`;
  });
  colbg.innerHTML=bg;

  const tIdx=idxOf(fmt(new Date())), today=$('today');
  if(tIdx>=0){today.style.display='block';today.style.height=totalH+'px';updateTodayLine();}
  else today.style.display='none';

  // header month groups
  let h='',i=0;
  while(i<days.length){
    const d=parse(days[i]),y=d.getFullYear(),mo=d.getMonth();
    let span=0; while(i+span<days.length){const dd=parse(days[i+span]); if(dd.getFullYear()!==y||dd.getMonth()!==mo)break; span++;}
    h+=`<div class="mcell" style="left:${i*DAY_W}px;width:${span*DAY_W}px">${y}年${mo+1}月</div>`;
    i+=span;
  }
  let drow='',wrow='';
  days.forEach((s,i)=>{
    const w=parse(s).getDay();
    const isHol=(s in (state.holidayMaster||{}));
    const cls=w===6?'sat':(w===0||isHol)?'sun':'';
    drow+=`<div class="dcell ${cls}" data-d="${s}" style="left:${i*DAY_W}px">${s.slice(8)}</div>`;
    wrow+=`<div class="wcell ${cls}" style="left:${i*DAY_W}px">${WD[w]}</div>`;
  });
  head.style.width=totalW+'px';
  head.innerHTML=`<div class="mrow" style="width:${totalW}px">${h}</div>`+
                 `<div class="drow" style="width:${totalW}px">${drow}</div>`+
                 `<div class="wrow" style="width:${totalW}px">${wrow}</div>`;

  lanes.style.width=totalW+'px'; lanes.style.height=lanesH+'px';
  let ll='';
  for(let k=0;k<=LANES;k++) ll+=`<div class="laneline" style="top:${k*LANE_H}px;width:${totalW}px"></div>`;
  state.tasks.filter(t=>!t.deleted).forEach(t=>{
    const si=idxOf(t.start); if(si<0)return;
    const cls=['task']; if(t.type==='ms')cls.push('ms'); if(t.id===selectedId)cls.push('sel');
    ll+=`<div class="${cls.join(' ')}" data-id="${t.id}" style="left:${si*DAY_W+2}px;top:${(t.lane||0)*LANE_H+3}px">${labelHTML(t)}</div>`;
  });
  lanes.innerHTML=ll;

  renderRoutines();
  renderNotes();
  renderNotes2();
  renderNotes3();
  renderNotes4();
  renderNotes5();
}

function labelHTML(t){
  if(t.type==='ms') return `★${escapeHTML(t.title)}`;
  const mk=markerOf(t.type);
  const ei=t.end?idxOf(t.end):-1, si=idxOf(t.start);
  if(t.end&&ei>si){
    const n=ei-si+1;
    let inner='';
    for(let j=0;j<n;j++){
      if(j>0) inner+=`<span class="lnk" style="left:${(j-1)*DAY_W+13}px;width:${DAY_W-13}px"></span>`;
      inner+=`<span class="mk" style="left:${j*DAY_W}px">${mk}</span>`;
    }
    const w=(n-1)*DAY_W+16;
    return `<span class="spanwrap" style="width:${w}px">${inner}</span>`+escapeHTML(t.title)+optsText(t);
  }
  return `<span class="mk">${mk}</span>`+escapeHTML(t.title)+optsText(t);
}
function optsText(t){
  let s='';
  if(t.time) s+='@'+t.time;
  if(t.place) s+=' in '+t.place;
  if(t.who) s+=' with '+t.who;
  return escapeHTML(s);
}
const escapeHTML=s=>(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// オプション解析： @時間 / in 場所 / with 人
function parseInline(raw){
  const out={title:'',time:'',place:'',who:''};
  let s=' '+raw.trim()+' ';
  let m;
  if((m=s.match(/@(\S+)/)))                       { out.time =m[1].trim();         s=s.replace(m[0],' '); }
  if((m=s.match(/\sin\s+(.+?)(?=\swith\s|$)/i)))  { out.place=m[1].trim();         s=s.replace(m[0],' '); }
  if((m=s.match(/\swith\s+(.+?)\s*$/i)))          { out.who  =m[1].trim();         s=s.replace(m[0],' '); }
  out.title=s.replace(/\s+/g,' ').trim();
  return out;
}

// ---------- ルーティン行描画 ----------
function renderRoutines(){
  const el=$('routines'); if(!el)return;
  const rows=state.routineRows||[];
  const fullH=HEAD_H+laneCount()*LANE_H;
  const totalW=days.length*DAY_W;
  el.style.top=fullH+'px';
  el.style.width=totalW+'px';
  el.style.height=(rows.length*LANE_H)+'px';

  let html='';
  rows.forEach(row=>{
    const bg=row.color||'#f0f0f0';
    const tc=contrastColor(bg);
    html+=`<div class="routine-row" style="background:${bg}">`;
    html+=`<div class="rr-label" style="background:${bg};color:${tc}">${escapeHTML(row.label)}</div>`;
    days.forEach((s,i)=>{
      const val=(row.cells&&row.cells[s])||'';
      const gc=isGrey(s)?' rcell-grey':'';
      const sc=(selectedRR&&selectedRR.rid===row.id&&selectedRR.date===s)?' sel':'';
      html+=`<div class="rcell${gc}${sc}" data-rid="${row.id}" data-date="${s}" style="left:${i*DAY_W}px;color:${tc}">${escapeHTML(val)}</div>`;
    });
    html+='</div>';
  });
  el.innerHTML=html;
}
// onclick属性から呼ぶグローバル関数（最もシンプルで確実なアプローチ）
function rrCellClick(rid,date){
  const row=(state.routineRows||[]).find(r=>r.id===rid);
  if(!row){ alert('エラー: 行が見つかりません rid='+rid); return; }
  const markers=row.markers||[];
  if(!markers.length){
    alert('マーカーが設定されていません！\n⚙ ルーティンボタンから行を編集してマーカーを入力してください。\n例: ジ　または　MH,MY');
    return;
  }
  const cur=(row.cells&&row.cells[date])||'';
  const idx=markers.indexOf(cur);
  const next=idx<markers.length-1?markers[idx+1]:'';
  if(!row.cells)row.cells={};
  if(next==='') delete row.cells[date]; else row.cells[date]=next;
  save(); renderRoutines();
}

// ---------- ノート欄描画 ----------
let noteInline=null, noteInline2=null, noteInline3=null, noteInline4=null, noteInline5=null;

function _renderNotesRow(elId, notesObj, cellClass, selectedDate, topPx, labelText){
  const dn=$(elId); if(!dn)return;
  const totalW=days.length*DAY_W;
  dn.style.top=topPx+'px'; dn.style.width=totalW+'px'; dn.style.height=NOTE_H+'px';
  let html='<div class="note-label" style="'+(labelText?'':'background:#fffde7')+'">'+(labelText||'')+'</div>';
  days.forEach((s,i)=>{
    const gc=isGrey(s)?' ncell-grey':'';
    const raw=(notesObj||{})[s]||'';
    const hc=raw?' has':''; const sc=(selectedDate===s)?' sel':'';
    html+='<div class="'+cellClass+gc+hc+sc+'" data-date="'+s+'" data-left="'+(i*DAY_W)+'" style="left:'+(i*DAY_W)+'px">'+escapeHTML(raw)+'</div>';
  });
  dn.innerHTML=html;
}
function _notesTop(){
  const rows=state.routineRows||[];
  return HEAD_H+laneCount()*LANE_H+rows.length*LANE_H;
}
const ni1={val:null},ni2={val:null},ni3={val:null},ni4={val:null},ni5={val:null};
function renderNotes(){  if(noteInline)return;  _renderNotesRow('daynotes', state.dayNotes,'ncell',selectedNote,_notesTop(),'メモ'); }
function renderNotes2(){ if(noteInline2)return; _renderNotesRow('daynotes2',state.dayNotes2,'ncell2',selectedNote2,_notesTop()+NOTE_H,''); }
function renderNotes3(){ if(noteInline3)return; _renderNotesRow('daynotes3',state.dayNotes3,'ncell3',selectedNote3,_notesTop()+NOTE_H*2,''); }
function renderNotes4(){ if(noteInline4)return; _renderNotesRow('daynotes4',state.dayNotes4,'ncell4',selectedNote4,_notesTop()+NOTE_H*3,''); }
function renderNotes5(){ if(noteInline5)return; _renderNotesRow('daynotes5',state.dayNotes5,'ncell5',selectedNote5,_notesTop()+NOTE_H*4,''); }

function _openNoteEdit(elId, notesKey, date, leftPx, inlineRef, closeFn){
  closeFn();
  const dn=$(elId);
  const ta=document.createElement('textarea');
  ta.className='noteEditTa';
  ta.value=(state[notesKey]||{})[date]||'';
  ta.style.left=leftPx+'px'; ta.style.top='0'; ta.style.width=(DAY_W*5)+'px'; ta.style.height=NOTE_H+'px';
  ta.dataset.date=date;
  dn.appendChild(ta); ta.focus(); inlineRef.val=ta;
  ta.addEventListener('input',()=>{
    if(!state[notesKey])state[notesKey]={};
    if(ta.value.trim()==='') delete state[notesKey][date];
    else state[notesKey][date]=ta.value;
    save();
  });
  ta.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closeFn(); }
    else if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); closeFn(); }
  });
  ta.addEventListener('blur',()=>setTimeout(closeFn,80));
}
function openNoteEdit(date,leftPx){  _openNoteEdit('daynotes', 'dayNotes', date,leftPx,ni1,closeNoteEdit);  noteInline=ni1.val; }
function closeNoteEdit(){  if(!ni1.val)return; ni1.val.remove(); ni1.val=null; noteInline=null;  renderNotes(); }
function openNoteEdit2(date,leftPx){ _openNoteEdit('daynotes2','dayNotes2',date,leftPx,ni2,closeNoteEdit2); noteInline2=ni2.val; }
function closeNoteEdit2(){ if(!ni2.val)return; ni2.val.remove(); ni2.val=null; noteInline2=null; renderNotes2(); }
function openNoteEdit3(date,leftPx){ _openNoteEdit('daynotes3','dayNotes3',date,leftPx,ni3,closeNoteEdit3); noteInline3=ni3.val; }
function closeNoteEdit3(){ if(!ni3.val)return; ni3.val.remove(); ni3.val=null; noteInline3=null; renderNotes3(); }
function openNoteEdit4(date,leftPx){ _openNoteEdit('daynotes4','dayNotes4',date,leftPx,ni4,closeNoteEdit4); noteInline4=ni4.val; }
function closeNoteEdit4(){ if(!ni4.val)return; ni4.val.remove(); ni4.val=null; noteInline4=null; renderNotes4(); }
function openNoteEdit5(date,leftPx){ _openNoteEdit('daynotes5','dayNotes5',date,leftPx,ni5,closeNoteEdit5); noteInline5=ni5.val; }
function closeNoteEdit5(){ if(!ni5.val)return; ni5.val.remove(); ni5.val=null; noteInline5=null; renderNotes5(); }

// ---------- パスワード画面 ----------
const pwScreen=$('pwScreen');

function showPwScreen(mode, hasMigration){
  pwScreen.style.display='flex';
  if(mode==='login'){
    $('pwLogin').style.display='';
    $('pwRegister').style.display='none';
    $('pwScreenTitle').textContent='パスワードを入力';
    $('pwScreenSub').textContent='';
    $('pwInput').value=''; $('pwErr').textContent='';
    setTimeout(()=>$('pwInput').focus(), 50);
  } else {
    $('pwLogin').style.display='none';
    $('pwRegister').style.display='';
    $('pwScreenTitle').textContent='パスワードを設定';
    $('pwScreenSub').textContent=hasMigration
      ? '既存のデータを暗号化して保護します'
      : '4桁の数字でパスワードを設定してください';
    $('pwNew1').value=''; $('pwNew2').value=''; $('pwRegErr').textContent='';
    setTimeout(()=>$('pwNew1').focus(), 50);
  }
}

function hidePwScreen(){ pwScreen.style.display='none'; }

async function afterAuth(){
  render();
  $('btnToday').click();
  if(localStorage.getItem('cloudSyncKey')) await cloudSync(true);
}

$('pwSubmit').onclick=async()=>{
  const pwd=$('pwInput').value;
  if(pwd.length!==4){ $('pwErr').textContent='4桁で入力してください'; return; }
  const raw=Store.loadLocalRaw();
  try{
    state=await Store.decrypt(raw, pwd);
    sessionPwd=pwd;
    hidePwScreen();
    await afterAuth();
  }catch(e){
    $('pwErr').textContent='パスワードが違います';
    $('pwInput').value=''; $('pwInput').focus();
  }
};
$('pwInput').addEventListener('keydown',e=>{ if(e.key==='Enter') $('pwSubmit').click(); });

$('pwRegSubmit').onclick=async()=>{
  const p1=$('pwNew1').value, p2=$('pwNew2').value;
  if(p1.length!==4){ $('pwRegErr').textContent='4桁で入力してください'; return; }
  if(p1!==p2){ $('pwRegErr').textContent='パスワードが一致しません'; $('pwNew2').focus(); return; }
  sessionPwd=p1;
  await save();
  hidePwScreen();
  await afterAuth();
};
$('pwNew1').addEventListener('keydown',e=>{ if(e.key==='Enter') $('pwNew2').focus(); });
$('pwNew2').addEventListener('keydown',e=>{ if(e.key==='Enter') $('pwRegSubmit').click(); });

const pwChangeOv=$('pwChangeOv');
$('btnChangePw').onclick=()=>{
  $('pwCurr').value=''; $('pwChNew1').value=''; $('pwChNew2').value='';
  $('pwChErr').textContent='';
  pwChangeOv.classList.add('show');
  setTimeout(()=>$('pwCurr').focus(), 50);
};
$('pwChCancel').onclick=()=>pwChangeOv.classList.remove('show');
pwChangeOv.addEventListener('click',e=>{ if(e.target===pwChangeOv) pwChangeOv.classList.remove('show'); });
$('pwChSave').onclick=async()=>{
  const curr=$('pwCurr').value, n1=$('pwChNew1').value, n2=$('pwChNew2').value;
  if(curr!==sessionPwd){ $('pwChErr').textContent='現在のパスワードが違います'; $('pwCurr').focus(); return; }
  if(n1.length!==4){ $('pwChErr').textContent='新しいパスワードを4桁で入力してください'; return; }
  if(n1!==n2){ $('pwChErr').textContent='パスワードが一致しません'; $('pwChNew2').focus(); return; }
  sessionPwd=n1;
  await save();
  pwChangeOv.classList.remove('show');
  alert('パスワードを変更しました！');
};

// ---------- scroll / select / inline / task-drag ----------
const scroll=$('scroll'), lanes=$('lanes');
let mode=null, sx=0, sy=0, sl=0, st=0, moved=false, startCell=null, selStart=0, selEnd=0, selLane=0, selBox=null;
let taskDrag=null;
let noteDrag=null; // {kind, sourceKey, sourceDate, sourceLane, el, startX, startY, moved}
let noteDragOver=null;
let pendingCell=null;
let lastTapId=null, lastTapTime=0;
const DBL_MS=320;

function cellFromEvent(e){
  const r=lanes.getBoundingClientRect();
  const di=Math.floor((e.clientX-r.left)/DAY_W);
  const ln=Math.floor((e.clientY-r.top)/LANE_H);
  return {di,ln};
}

scroll.addEventListener('pointerdown',e=>{
  // ルーティン行・メモのセルは記録だけして、スクロール処理に合流（ドラッグ移動可・ダブルクリックで入力）
  const rcell=e.target.closest('.rcell');
  const ncell=e.target.closest('.ncell');
  const ncell2=e.target.closest('.ncell2');
  const ncell3=e.target.closest('.ncell3');
  const ncell4=e.target.closest('.ncell4');
  const ncell5=e.target.closest('.ncell5');
  pendingCell = rcell   ? {kind:'rr',    cell:rcell}
              : ncell   ? {kind:'note',   cell:ncell}
              : ncell2  ? {kind:'note2',  cell:ncell2}
              : ncell3  ? {kind:'note3',  cell:ncell3}
              : ncell4  ? {kind:'note4',  cell:ncell4}
              : ncell5  ? {kind:'note5',  cell:ncell5}
              : null;
  // メモセルのドラッグ開始（入力済みの場合）
  const noteCell = ncell||ncell2||ncell3||ncell4||ncell5;
  if(noteCell && noteCell.classList.contains('has')){
    const kind = ncell?'note':ncell2?'note2':ncell3?'note3':ncell4?'note4':'note5';
    const key  = ncell?'dayNotes':ncell2?'dayNotes2':ncell3?'dayNotes3':ncell4?'dayNotes4':'dayNotes5';
    noteDrag={kind,sourceKey:key,sourceDate:noteCell.dataset.date,el:noteCell,
              startX:e.clientX,startY:e.clientY,moved:false};
    pendingCell=null;
  }
  if(!ncell  && selectedNote!==null){  selectedNote=null;  renderNotes();  }
  if(!ncell2 && selectedNote2!==null){ selectedNote2=null; renderNotes2(); }
  if(!ncell3 && selectedNote3!==null){ selectedNote3=null; renderNotes3(); }
  if(!ncell4 && selectedNote4!==null){ selectedNote4=null; renderNotes4(); }
  if(!ncell5 && selectedNote5!==null){ selectedNote5=null; renderNotes5(); }
  if(!rcell && selectedRR!==null){ selectedRR=null; renderRoutines(); }
  if(noteDrag) return;
  if(!rcell && !ncell){
    const taskEl=e.target.closest('.task');
    if(taskEl){
      const t=state.tasks.find(x=>x.id===taskEl.dataset.id);
      if(t){
        taskDrag={t,el:taskEl,onMk:e.target.classList.contains('mk'),
          startX:e.clientX,startY:e.clientY,
          grabDi:cellFromEvent(e).di-idxOf(t.start),
          moved:false,previewDi:null,previewLn:null};
      }
      return;
    }
    if(e.target.closest('.inlineEdit')) return;
    if(e.target.closest('.noteEditTa')) return;
    if(selectedId!==null){selectedId=null; render();}
    removeInline();
    const overLanes=e.target.closest('#lanes');
    if(e.shiftKey && overLanes){
      const c=cellFromEvent(e); if(c.di<0||c.di>=days.length)return;
      mode='range'; selLane=c.ln; selStart=selEnd=c.di;
      drawSel();
      e.preventDefault();
      return;
    }
    startCell=(overLanes&&!e.target.closest('.dcell'))?cellFromEvent(e):null;
  } else {
    startCell=null;
  }
  mode='scroll'; sx=e.clientX; sy=e.clientY; sl=scroll.scrollLeft; st=scroll.scrollTop; moved=false;
  scroll.classList.add('drag');
});
window.addEventListener('pointermove',e=>{
  if(taskDrag){
    const dx=e.clientX-taskDrag.startX, dy=e.clientY-taskDrag.startY;
    if(!taskDrag.moved && (Math.abs(dx)>4||Math.abs(dy)>4)){taskDrag.moved=true; taskDrag.el.classList.add('dragging');}
    if(taskDrag.moved){
      const c=cellFromEvent(e);
      const dur=durationDays(taskDrag.t);
      let di=c.di-taskDrag.grabDi;
      di=Math.max(0,Math.min(days.length-dur,di));
      const ln=Math.max(0,c.ln);
      taskDrag.el.style.left=(di*DAY_W+2)+'px';
      taskDrag.el.style.top=(ln*LANE_H+3)+'px';
      taskDrag.previewDi=di; taskDrag.previewLn=ln;
    }
    return;
  }
  if(noteDrag){
    const dx=e.clientX-noteDrag.startX, dy=e.clientY-noteDrag.startY;
    if(!noteDrag.moved&&(Math.abs(dx)>4||Math.abs(dy)>4)){
      noteDrag.moved=true;
      noteDrag.el.classList.add('note-dragging');
      noteDrag.el.style.pointerEvents='none';
      selectedNote=null; selectedNote2=null; selectedNote3=null; selectedNote4=null; selectedNote5=null;
      document.querySelectorAll('.ncell.sel,.ncell2.sel,.ncell3.sel,.ncell4.sel,.ncell5.sel').forEach(el=>el.classList.remove('sel'));
    }
    if(noteDrag.moved){
      const gridEl=document.getElementById('grid');
      const gr=gridEl.getBoundingClientRect();
      const absX=e.clientX-gr.left;
      const absY=e.clientY-gr.top;
      const nt=_notesTop();
      const rowIdx=Math.floor((absY-nt)/NOTE_H);
      const colIdx=Math.floor(absX/DAY_W);
      let tcell=null;
      if(rowIdx>=0&&rowIdx<5&&colIdx>=0&&colIdx<days.length){
        const ctnr=document.getElementById(['daynotes','daynotes2','daynotes3','daynotes4','daynotes5'][rowIdx]);
        if(ctnr) tcell=ctnr.querySelector('[data-date="'+days[colIdx]+'"]');
      }
      if(noteDragOver&&noteDragOver!==tcell){ noteDragOver.classList.remove('note-drag-over'); noteDragOver=null; }
      if(tcell&&tcell!==noteDrag.el){ tcell.classList.add('note-drag-over'); noteDragOver=tcell; }
    }
    return;
  }
  if(mode==='scroll'){
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)>5||Math.abs(dy)>5)moved=true;
    scroll.scrollLeft=sl-dx;
    scroll.scrollTop=st-dy;
  }else if(mode==='range'){
    const c=cellFromEvent(e);
    selEnd=Math.max(0,Math.min(days.length-1,c.di));
    drawSel();
  }
});
window.addEventListener('pointerup',e=>{
  if(taskDrag){
    const td=taskDrag; taskDrag=null;
    td.el.classList.remove('dragging');
    if(td.moved && td.previewDi!=null){
      const dur=durationDays(td.t);
      const conflict=state.tasks.some(t=>
        !t.deleted && t.id!==td.t.id &&
        (t.lane||0)===td.previewLn &&
        t.start===days[td.previewDi]
      );
      if(conflict){
        alert('このセルにはすでにタスクが入っています');
        render();
      }else{
        td.t.start=days[td.previewDi];
        td.t.end=dur>1?days[td.previewDi+dur-1]:'';
        td.t.lane=td.previewLn;
        stamp(td.t); selectedId=td.t.id; save(); render();
      }
    }else if(td.onMk){
      if(td.t.type==='plan') askConfirm(td.t);
      else openEdit(td.t);
    }else{
      const nowT=Date.now();
      if(lastTapId===td.t.id && (nowT-lastTapTime)<DBL_MS){
        lastTapId=null; lastTapTime=0;
        openEdit(td.t);
      }else{
        lastTapId=td.t.id; lastTapTime=nowT;
        selectedId=td.t.id; render();
      }
    }
    return;
  }
  if(noteDrag){
    const nd=noteDrag; noteDrag=null;
    nd.el.classList.remove('note-dragging');
    nd.el.style.pointerEvents='';
    const dropCell=noteDragOver;
    if(noteDragOver){ noteDragOver.classList.remove('note-drag-over'); noteDragOver=null; }
    if(nd.moved){
      const tcell=dropCell;
      if(tcell){
        const tKind=tcell.classList.contains('ncell5')?'note5':
                    tcell.classList.contains('ncell4')?'note4':
                    tcell.classList.contains('ncell3')?'note3':
                    tcell.classList.contains('ncell2')?'note2':'note';
        const tKey= tKind==='note5'?'dayNotes5':tKind==='note4'?'dayNotes4':
                    tKind==='note3'?'dayNotes3':tKind==='note2'?'dayNotes2':'dayNotes';
        const tDate=tcell.dataset.date;
        const tVal=(state[tKey]||{})[tDate]||'';
        if(tVal!==''){
          alert('このセルにはすでにコメントが入力されています');
          render();
        }else{
          const srcVal=(state[nd.sourceKey]||{})[nd.sourceDate]||'';
          if(!state[tKey])state[tKey]={};
          state[tKey][tDate]=srcVal;
          delete state[nd.sourceKey][nd.sourceDate];
          selectedNote=null; selectedNote2=null; selectedNote3=null; selectedNote4=null; selectedNote5=null;
          save(); render();
        }
      }
    }else{
      const cid='note:'+nd.kind+':'+nd.sourceDate;
      const now2=Date.now();
      if(lastTapId===cid&&now2-lastTapTime<DBL_MS){
        lastTapId=null; lastTapTime=0;
        const leftPx=parseInt(nd.el.dataset.left||0);
        if(nd.kind==='note')       openNoteEdit(nd.sourceDate,leftPx);
        else if(nd.kind==='note2') openNoteEdit2(nd.sourceDate,leftPx);
        else if(nd.kind==='note3') openNoteEdit3(nd.sourceDate,leftPx);
        else if(nd.kind==='note4') openNoteEdit4(nd.sourceDate,leftPx);
        else                       openNoteEdit5(nd.sourceDate,leftPx);
      }else{
        lastTapId=cid; lastTapTime=now2;
        selectedId=null; selectedRR=null;
        selectedNote=null; selectedNote2=null; selectedNote3=null; selectedNote4=null; selectedNote5=null;
        if(nd.kind==='note')       selectedNote=nd.sourceDate;
        else if(nd.kind==='note2') selectedNote2=nd.sourceDate;
        else if(nd.kind==='note3') selectedNote3=nd.sourceDate;
        else if(nd.kind==='note4') selectedNote4=nd.sourceDate;
        else                       selectedNote5=nd.sourceDate;
        render();
      }
    }
    return;
  }
  if(mode==='scroll'){
    scroll.classList.remove('drag');
    if(!moved){
      if(pendingCell){
        // ルーティン/メモ：ダブルクリックで入力発動
        const c=pendingCell.cell, now=Date.now();
        const cid=pendingCell.kind==='rr'
          ? 'rr:'+c.dataset.rid+':'+c.dataset.date
          : 'note:'+c.dataset.date;
        if(lastTapId===cid && now-lastTapTime<DBL_MS){
          lastTapId=null; lastTapTime=0;
          if(pendingCell.kind==='rr')    rrCellClick(c.dataset.rid,c.dataset.date);
          else if(pendingCell.kind==='note2') openNoteEdit2(c.dataset.date,parseInt(c.dataset.left));
          else if(pendingCell.kind==='note3') openNoteEdit3(c.dataset.date,parseInt(c.dataset.left));
          else if(pendingCell.kind==='note4') openNoteEdit4(c.dataset.date,parseInt(c.dataset.left));
          else if(pendingCell.kind==='note5') openNoteEdit5(c.dataset.date,parseInt(c.dataset.left));
          else openNoteEdit(c.dataset.date,parseInt(c.dataset.left));
        }else{
          lastTapId=cid; lastTapTime=now;
          if(pendingCell.kind==='rr'){
            selectedId=null; selectedNote=null; selectedNote2=null; selectedNote3=null; selectedNote4=null; selectedNote5=null;
            selectedRR={rid:c.dataset.rid,date:c.dataset.date}; render();
          }
        }
      }else if(startCell && startCell.di>=0 && startCell.di<days.length){
        const cid='cell:'+startCell.di+':'+startCell.ln;
        const now=Date.now();
        if(lastTapId===cid && now-lastTapTime<DBL_MS){
          lastTapId=null; lastTapTime=0;
          openInline(startCell.di,startCell.di,startCell.ln);
        }else{
          lastTapId=cid; lastTapTime=now;
        }
      }
    }
  }else if(mode==='range'){
    const a=Math.min(selStart,selEnd), b=Math.max(selStart,selEnd);
    clearSel();
    openInline(a,b,selLane);
  }
  mode=null; startCell=null; pendingCell=null;
});

function drawSel(){
  const a=Math.min(selStart,selEnd), b=Math.max(selStart,selEnd);
  if(!selBox){selBox=document.createElement('div');selBox.className='selbox';lanes.appendChild(selBox);}
  selBox.style.left=(a*DAY_W+1)+'px';
  selBox.style.top=(selLane*LANE_H+2)+'px';
  selBox.style.width=((b-a+1)*DAY_W-2)+'px';
}
function clearSel(){ if(selBox){selBox.remove();selBox=null;} }

// インライン入力
let inlineEl=null;
function openInline(diStart,diEnd,lane){
  removeInline();
  const inp=document.createElement('input');
  inp.className='inlineEdit';
  inp.placeholder='タイトル… (@時間 in 場所 with 人)';
  inp.style.left=(diStart*DAY_W+2)+'px';
  inp.style.top=(lane*LANE_H+3)+'px';
  inp.style.width=Math.max((diEnd-diStart+1)*DAY_W,160)+'px';
  inp.dataset.s=days[diStart]; inp.dataset.e=diEnd>diStart?days[diEnd]:''; inp.dataset.lane=lane;
  lanes.appendChild(inp); inp.focus(); inlineEl=inp;
  inp.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ commitInline(); }
    else if(ev.key==='Escape'){ removeInline(); }
  });
  inp.addEventListener('blur',()=>{ setTimeout(()=>{ if(inlineEl===inp) removeInline(); },120); });
}
function commitInline(){
  if(!inlineEl)return;
  const raw=inlineEl.value.trim();
  if(raw){
    const p=parseInline(raw);
    if(p.title){
      state.tasks.push({id:id(),type:'plan',title:p.title,
        start:inlineEl.dataset.s,end:inlineEl.dataset.e,
        lane:parseInt(inlineEl.dataset.lane,10)||0,time:p.time,place:p.place,who:p.who,
        updatedAt:Store.nowISO()});
      save();
    }
  }
  removeInline(); render();
}
function removeInline(){ if(inlineEl){inlineEl.remove();inlineEl=null;} }

// ---------- 確定確認 ----------
const cf=$('cf'); let cfTask=null;
function askConfirm(t){ cfTask=t; $('cfMsg').textContent='「'+t.title+'」を確定タスクにします。'; cf.classList.add('show'); }
$('cfYes').onclick=()=>{ if(cfTask){cfTask.type='fix';stamp(cfTask);save();render();} cf.classList.remove('show'); cfTask=null; };
$('cfNo').onclick=()=>{ cf.classList.remove('show'); cfTask=null; };
cf.addEventListener('click',e=>{ if(e.target===cf){cf.classList.remove('show');cfTask=null;} });

// ---------- 汎用 確認ダイアログ ----------
const ask=$('ask'); let askCb=null;
function showConfirm(title,msg,onYes){
  $('askTitle').textContent=title; $('askMsg').textContent=msg;
  askCb=onYes; ask.classList.add('show');
}
$('askYes').onclick=()=>{ const cb=askCb; askCb=null; ask.classList.remove('show'); if(cb)cb(); };
$('askNo').onclick=()=>{ askCb=null; ask.classList.remove('show'); };
ask.addEventListener('click',e=>{ if(e.target===ask){askCb=null;ask.classList.remove('show');} });

// ---------- 祝日マスター管理パネル ----------
function openHolidayPanel(){
  renderHolidayPanel();
  $('holOv').classList.add('show');
}
function renderHolidayPanel(){
  const master=state.holidayMaster||{};
  const dates=Object.keys(master).sort();
  let html='';
  const pub=dates.filter(d=>master[d].type==='public');
  const cust=dates.filter(d=>master[d].type!=='public');
  html+='<div style="font-weight:700;margin-bottom:6px;color:#1f3b57">国民の祝日</div>';
  if(pub.length){
    pub.forEach(d=>{
      html+='<div class="hol-row"><span class="hol-date">'+d+'</span><span class="hol-name">'+escapeHTML(master[d].name)+'</span></div>';
    });
  }else{ html+='<div style="font-size:12px;color:#999">なし</div>'; }
  html+='<hr style="margin:10px 0"><div style="font-weight:700;margin-bottom:6px;color:#1f3b57">会社・カスタム休日</div>';
  if(cust.length){
    cust.forEach(d=>{
      html+='<div class="hol-row"><span class="hol-date">'+d+'</span><span class="hol-name">'+escapeHTML(master[d].name)+'</span>'
           +'<button class="ghost" style="font-size:11px;padding:2px 8px" onclick="deleteHoliday(\''+d+'\')">削除</button></div>';
    });
  }else{ html+='<div style="font-size:12px;color:#999">なし</div>'; }
  $('holList').innerHTML=html;
}
function deleteHoliday(d){
  if(state.holidayMaster) delete state.holidayMaster[d];
  save(); render(); renderHolidayPanel();
}
$('holClose').onclick=()=>$('holOv').classList.remove('show');
$('holOv').addEventListener('click',e=>{ if(e.target===$('holOv'))$('holOv').classList.remove('show'); });
$('holAddBtn').onclick=()=>{
  const d=$('holDate').value; const n=$('holName').value.trim();
  if(!d||!n){ alert('日付と名称を入力してください'); return; }
  if(!state.holidayMaster)state.holidayMaster={};
  state.holidayMaster[d]={name:n,type:'company'};
  $('holDate').value=''; $('holName').value='';
  save(); render(); renderHolidayPanel();
};
$('btnHoliday').onclick=()=>openHolidayPanel();

// ---------- 追加・編集ポップ ----------
const ov=$('ov'); let editing=null, curType='plan';
function setType(t){curType=t;document.querySelectorAll('#segType button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));}
document.querySelectorAll('#segType button').forEach(b=>b.onclick=()=>setType(b.dataset.t));
function openAdd(start,lane){
  editing=null; $('mTitle').textContent='タスクを追加'; $('btnDelete').style.display='none';
  setType('plan'); $('fTitle').value=''; $('fStart').value=start||fmt(new Date()); $('fEnd').value='';
  $('fLane').value=lane||0; $('fTime').value=''; $('fPlace').value=''; $('fWho').value='';
  ov.classList.add('show'); $('fTitle').focus();
}
function openEdit(t){
  editing=t; $('mTitle').textContent='タスクを編集'; $('btnDelete').style.display='inline-block';
  setType(t.type); $('fTitle').value=t.title||''; $('fStart').value=t.start; $('fEnd').value=t.end||'';
  $('fLane').value=t.lane||0; $('fTime').value=t.time||''; $('fPlace').value=t.place||''; $('fWho').value=t.who||'';
  ov.classList.add('show');
}
$('btnCancel').onclick=()=>ov.classList.remove('show');
ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('show');});
$('btnSave').onclick=()=>{
  const title=$('fTitle').value.trim(); if(!title){$('fTitle').focus();return;}
  const obj={type:curType,title,start:$('fStart').value,end:$('fEnd').value,
    lane:Math.max(0,parseInt($('fLane').value||'0',10)),
    time:$('fTime').value.trim(),place:$('fPlace').value.trim(),who:$('fWho').value.trim()};
  if(curType==='ms')obj.end='';
  if(editing){Object.assign(editing,obj);stamp(editing);} else{obj.id=id();stamp(obj);state.tasks.push(obj);}
  save(); render(); ov.classList.remove('show');
};
$('btnDelete').onclick=()=>{ if(editing){editing.deleted=true;editing.deletedAt=Store.nowISO();stamp(editing);save();render();} ov.classList.remove('show'); };

// ---------- Deleteキーで削除 ----------
window.addEventListener('keydown',e=>{
  if(e.key==='Delete'||e.key==='Backspace'){
    const ae=document.activeElement;
    if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    if(ae?.closest('[contenteditable]')) return;
    if(ov.classList.contains('show')||cf.classList.contains('show')) return;
    if(selectedId!==null){
      e.preventDefault();
      const tid=selectedId, t=state.tasks.find(x=>x.id===tid);
      showConfirm('タスクを削除','「'+(t?t.title:'')+'」を削除しますか？',()=>{
        if(t){t.deleted=true;t.deletedAt=Store.nowISO();stamp(t);}
        selectedId=null; save(); render();
      });
    }else if(selectedNote!==null){
      e.preventDefault();
      const d=selectedNote;
      showConfirm('メモを削除','このメモを削除しますか？',()=>{
        if(state.dayNotes) delete state.dayNotes[d];
        selectedNote=null; save(); renderNotes();
      });
    }else if(selectedNote2!==null){
      e.preventDefault();
      const d=selectedNote2;
      showConfirm('メモを削除','このメモを削除しますか？',()=>{
        if(state.dayNotes2) delete state.dayNotes2[d];
        selectedNote2=null; save(); renderNotes2();
      });
    }else if(selectedNote3!==null){
      e.preventDefault();
      const d=selectedNote3;
      showConfirm('メモを削除','このメモを削除しますか？',()=>{
        if(state.dayNotes3) delete state.dayNotes3[d];
        selectedNote3=null; save(); renderNotes3();
      });
    }else if(selectedNote4!==null){
      e.preventDefault();
      const d=selectedNote4;
      showConfirm('メモを削除','このメモを削除しますか？',()=>{
        if(state.dayNotes4) delete state.dayNotes4[d];
        selectedNote4=null; save(); renderNotes4();
      });
    }else if(selectedNote5!==null){
      e.preventDefault();
      const d=selectedNote5;
      showConfirm('メモを削除','このメモを削除しますか？',()=>{
        if(state.dayNotes5) delete state.dayNotes5[d];
        selectedNote5=null; save(); renderNotes5();
      });
    }else if(selectedRR!==null){
      e.preventDefault();
      const sel=selectedRR;
      showConfirm('マーカーを削除','このマスを削除しますか？',()=>{
        const row=(state.routineRows||[]).find(r=>r.id===sel.rid);
        if(row&&row.cells) delete row.cells[sel.date];
        selectedRR=null; save(); renderRoutines();
      });
    }
  }else if(e.key==='Escape'){
    if(selectedId!==null){selectedId=null; render();}
    if(selectedNote!==null){selectedNote=null; renderNotes();}
    if(selectedNote2!==null){selectedNote2=null; renderNotes2();}
    if(selectedNote3!==null){selectedNote3=null; renderNotes3();}
    if(selectedNote4!==null){selectedNote4=null; renderNotes4();}
    if(selectedNote5!==null){selectedNote5=null; renderNotes5();}
    if(selectedRR!==null){selectedRR=null; renderRoutines();}
  }
});

// ---------- ルーティン行 設定モーダル ----------
const rrOv=$('rrOv'), rrEditOv=$('rrEditOv');
let rrEditIdx=null;

function renderRRList(){
  const rows=state.routineRows||[];
  let html='';
  if(!rows.length){
    html='<p style="font-size:12px;color:#888;text-align:center;padding:12px 0">まだ行がありません</p>';
  } else {
    rows.forEach((r,i)=>{
      const tc=contrastColor(r.color||'#f0f0f0');
      html+=`<div class="rr-list-item" style="background:${r.color||'#f0f0f0'}">
        <span style="flex:1;font-size:13px;font-weight:700;color:${tc}">${escapeHTML(r.label)}</span>
        <span style="font-size:11px;color:${tc};opacity:.8">${(r.markers||[]).join(' / ')||'—'}</span>
        <button class="ghost rr-edit-btn" data-idx="${i}" style="font-size:11px;padding:3px 9px;color:${tc};background:rgba(0,0,0,.12)">編集</button>
      </div>`;
    });
  }
  $('rrList').innerHTML=html;
  document.querySelectorAll('.rr-edit-btn').forEach(btn=>{
    btn.onclick=()=>openRREdit(parseInt(btn.dataset.idx));
  });
}

function openRRSettings(){
  renderRRList();
  rrOv.classList.add('show');
}
$('btnRR').onclick=()=>openRRSettings();
$('rrClose').onclick=()=>rrOv.classList.remove('show');
rrOv.addEventListener('click',e=>{ if(e.target===rrOv)rrOv.classList.remove('show'); });
$('rrAddBtn').onclick=()=>openRREdit(null);

function openRREdit(idx){
  rrEditIdx=idx;
  const row=idx!==null?(state.routineRows||[])[idx]:null;
  $('rrEditTitle').textContent=row?'ルーティン行を編集':'ルーティン行を追加';
  $('rrFLabel').value=row?row.label:'';
  $('rrFColor').value=row?(row.color||'#fff9c4'):'#fff9c4';
  $('rrFColorHex').textContent=row?(row.color||'#fff9c4'):'#fff9c4';
  $('rrFMarkers').value=row?(row.markers||[]).join(','):'';
  $('rrFDelete').style.display=row?'inline-block':'none';
  rrEditOv.classList.add('show');
}
$('rrFColor').addEventListener('input',e=>{ $('rrFColorHex').textContent=e.target.value; });
$('rrFCancel').onclick=()=>rrEditOv.classList.remove('show');
rrEditOv.addEventListener('click',e=>{ if(e.target===rrEditOv)rrEditOv.classList.remove('show'); });
$('rrFSave').onclick=()=>{
  const label=$('rrFLabel').value.trim();
  if(!label){ $('rrFLabel').focus(); return; }
  const color=$('rrFColor').value;
  const markers=$('rrFMarkers').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!state.routineRows)state.routineRows=[];
  if(rrEditIdx!==null){
    const row=state.routineRows[rrEditIdx];
    row.label=label; row.color=color; row.markers=markers;
  } else {
    state.routineRows.push({id:'rr'+Math.random().toString(36).slice(2,9),label,color,markers,cells:{}});
  }
  save(); rrEditOv.classList.remove('show'); render(); renderRRList();
};
$('rrFDelete').onclick=()=>{
  if(rrEditIdx!==null&&state.routineRows){
    const idx=rrEditIdx, row=state.routineRows[idx];
    showConfirm('ルーティン行を削除','「'+(row?row.label:'')+'」を削除しますか？',()=>{
      state.routineRows.splice(idx,1);
      save(); rrEditOv.classList.remove('show'); render(); renderRRList();
    });
  }
};

// ---------- 月ジャンプ ----------
function buildMonthJump(){
  $('monthJump').innerHTML=months.map((m,k)=>`<option value="${k}">${m.label}</option>`).join('');
}
function jumpMonth(k){
  k=Math.max(0,Math.min(months.length-1,k));
  scroll.scrollLeft=months[k].idx*DAY_W;
  $('monthJump').value=k;
}
function currentMonthPos(){
  const leftDi=Math.round(scroll.scrollLeft/DAY_W); let k=0;
  months.forEach((m,j)=>{ if(m.idx<=leftDi)k=j; });
  return k;
}
$('monthJump').onchange=e=>jumpMonth(parseInt(e.target.value,10));
$('btnPrevM').onclick=()=>jumpMonth(currentMonthPos()-1);
$('btnNextM').onclick=()=>jumpMonth(currentMonthPos()+1);
scroll.addEventListener('scroll',()=>{
  const k=currentMonthPos(), sel=$('monthJump');
  if(sel && parseInt(sel.value,10)!==k) sel.value=k;
});
buildMonthJump();

// ---------- 今日の縦線を1分ごとに更新 ----------
setInterval(updateTodayLine, 60000);

// ---------- toolbar ----------
$('btnAdd').onclick=()=>openAdd(fmt(new Date()),0);
$('btnToday').onclick=()=>{const i=idxOf(fmt(new Date()));if(i>=0)scroll.scrollLeft=i*DAY_W-scroll.clientWidth/2;};

// ---------- クラウド同期（Cloudflare Workers） ----------
const CLOUD_WORKER = 'https://schedule-sync.shimabukuro-tomoki.workers.dev';

async function cloudSync(silent){
  let key = localStorage.getItem('cloudSyncKey');
  if(!key){
    const ans = prompt('同期コードを入力してね（他デバイスの🔑ボタンで確認できるコード）:\n空のままOKを押すと新しいコードを自動生成します。');
    if(ans === null) return;
    key = ans.trim() || (Math.random().toString(36).slice(2,9)+Math.random().toString(36).slice(2,9));
    localStorage.setItem('cloudSyncKey', key);
    if(!ans.trim()) alert(`同期コードを発行したよ！\n\n${key}\n\n他のデバイスの🔑ボタンに入力してね。`);
  }
  try{
    const res = await fetch(`${CLOUD_WORKER}/?key=${key}`);
    if(res.ok){
      const blob = await res.json();
      const cloudState = await Store.decrypt(blob, sessionPwd);
      state = Store.mergeStates(state, cloudState);
    }
    const pushBlob = await Store.encrypt(state, sessionPwd);
    const pushRes = await fetch(`${CLOUD_WORKER}/?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pushBlob)});
    if(!pushRes.ok && !silent){ alert('クラウドへの保存に失敗しました。'); return; }
    await save(); clearPendingSync(); render();
    if(!silent) alert('☁️ 同期完了！');
  }catch(e){ if(!silent) alert('同期エラー: '+e.message); }
}

$('btnCloudSync').onclick = ()=> cloudSync(false);

$('btnCloudKey').onclick = ()=>{
  const cur = localStorage.getItem('cloudSyncKey') || '（未設定）';
  const ans = prompt(`現在の同期コード:\n${cur}\n\n変更する場合は新しいコードを入力（そのままEnterでキャンセル）:`);
  if(ans !== null && ans.trim() && ans.trim() !== cur){ localStorage.setItem('cloudSyncKey', ans.trim()); alert('同期コードを変更したよ！'); }
};

// ---------- 起動：パスワード画面を表示 ----------
(async()=>{
  const raw=Store.loadLocalRaw();
  if(!raw){
    state=Store.emptyState(); state.tasks=seed();
    showPwScreen('register', false);
  } else if(Store.isEncrypted(raw)){
    showPwScreen('login');
  } else {
    state=Store.migrate(raw) || Store.emptyState();
    showPwScreen('register', true);
  }
})();
