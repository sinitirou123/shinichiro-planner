(async function () {
  'use strict';
  const C=window.PlannerCore, KEY='shinichiro-planner-v15', DAYS=['月','火','水','木','金','土','日'];
  const $=id=>document.getElementById(id), clone=value=>JSON.parse(JSON.stringify(value));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  const fmt=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const short=key=>{const d=C.parseDate(key);return `${d.getMonth()+1}/${d.getDate()}`;};
  const link=(label,url)=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer" style="color:inherit">${esc(label)}</a>`:esc(label);
  let state, storageError='', locked=false;
  try {
    const saved=localStorage.getItem(KEY);
    if(saved!==null) {
      const parsed=JSON.parse(saved);
      if(!C.validState(parsed)) throw new Error('invalid saved data');
      state=parsed;
    }
  } catch(error) {
    locked=true; storageError='保存データを読み込めませんでした。上書きを防ぐため編集を止めています。';
  }
  if(!state && !locked) {
    state=clone(window.PLANNER_SEED);
    if(['127.0.0.1','localhost'].includes(location.hostname)) {
      try {
        const response=await fetch('/migration.json',{cache:'no-store'});
        if(response.ok) {
          const migration=await response.json();
          if(!C.validState(migration)) throw new Error('Invalid migration');
          state=migration;
        }
      } catch(error) {
        locked=true;storageError='前の入力を引き継げませんでした。内容を守るため、再読み込みしてからお使いください。';
      }
    }
  }
  if(!state) state=clone(window.PLANNER_SEED);
  let today=C.today(), monday, weekOffset=0, selectedDay=(C.parseDate(today).getDay()+6)%7, modalDate;
  function updateCalendar() {
    const next=C.today();
    if(next!==today) {today=next;weekOffset=0;selectedDay=(C.parseDate(today).getDay()+6)%7;}
    monday=C.addDays(today,-((C.parseDate(today).getDay()+6)%7));
  }
  const dateForDay=i=>C.addDays(monday,weekOffset*7+i);
  function save() {
    if(locked)return false;
    try {
      state.updatedAt=Date.now();
      localStorage.setItem(KEY,JSON.stringify(state));
      storageError='';
    } catch(error) {storageError='保存できませんでした。この画面を閉じると変更が失われます。';}
    renderSave(); return !storageError;
  }
  function latest() {
    if(locked)return false;
    try {
      const raw=localStorage.getItem(KEY);
      if(raw) {
        const saved=JSON.parse(raw);
        if(!C.validState(saved)) throw new Error('invalid state');
        if((saved.updatedAt||0)>(state.updatedAt||0)) state=saved;
      }
    } catch(error) {storageError='保存データを確認できません。再読み込みしてから操作してください。';renderSave();return false;}
    return true;
  }
  function renderSave() { $('saveStatus').textContent=storageError||'このブラウザに自動保存しています（別の端末・ブラウザとは同期しません）'; }
  function renderNotice(result) {
    const info=result||state.lastRollover;
    if(!info || (!info.moved&&!info.waiting)) {$('autoStatus').textContent='未完了タスクを自動で繰り越します。作業時間は9:00〜翌3:00、固定予定を優先します。';return;}
    const date=info.at?short(C.today(new Date(info.at))):short(today);
    $('autoStatus').textContent=`${date}：未完了タスク${info.moved}件を空き時間へ配置しました。`+
      (info.waiting?` ${info.waiting}件は60日先までに休憩込みの空きがなく、元の場所に残っています。`:' 完了済み・固定予定・休憩は繰り越しません。');
  }
  function autoRollover() {
    if(!latest())return;
    updateCalendar();
    const result=C.rollover(state,new Date());
    if(result.moved||result.waiting) {save();renderNotice();}
    renderAll();
  }
  function renderWeek() {
    const first=dateForDay(0),last=dateForDay(6);
    $('weekLabel').textContent=`${first.slice(0,4)}/${short(first)} - ${short(last)}`;
    const mobile=matchMedia('(max-width:760px)').matches;
    $('mobileDaybar').innerHTML=DAYS.map((day,i)=>`<button class="mobile-day${i===selectedDay?' active':''}" data-day="${i}"><div class="mdow">${day}</div><div class="mnum">${C.parseDate(dateForDay(i)).getDate()}</div></button>`).join('');
    const grid=$('weekGrid');grid.replaceChildren();
    const head=document.createElement('div');head.className='time-head';head.innerHTML='<div style="padding-top:18px;text-align:center;font-size:10px;color:var(--muted)">TIME</div>';grid.append(head);
    for(let i=0;i<7;i++) {
      const date=dateForDay(i),h=document.createElement('div');h.className=`day-head${date===today?' today':''}${mobile&&i===selectedDay?' mobile-active':''}`;
      h.innerHTML=`<div class="dow">${DAYS[i]}曜日</div><div class="day-num">${short(date)}</div>`;grid.append(h);
    }
    const times=document.createElement('div');times.className='time-col';
    for(let h=9;h<27;h++){const c=document.createElement('div');c.className='time-cell';c.textContent=fmt(h*60);times.append(c);}
    grid.append(times);
    for(let i=0;i<7;i++) {
      const date=dateForDay(i),col=document.createElement('div');col.className=`day-col${date===today?' today':''}${mobile&&i===selectedDay?' mobile-active':''}`;
      for(let min=C.START;min<C.END;min+=30){const slot=document.createElement('div');slot.className='slot';slot.style.top=((min-C.START)*.8)+'px';slot.onclick=()=>openModal(i,min);col.append(slot);}
      const display=state.events.filter(e=>e.date===date).map(e=>({...e}));
      for(const e of state.events)for(const h of e.history||[])if(h.date===date)display.push({...e,...h,historyOnly:true,destination:e.date});
      for(const e of display) {
        const el=document.createElement('div');el.className=`event ${e.type}${e.done?' done':''}${e.historyOnly?' history':''}${e.durMin<45?' compact':''}${e.durMin<15?' sliver':''}`;
        el.style.top=((e.startMin-C.START)*.8+1)+'px';el.style.height=Math.max(3,e.durMin*.8-2)+'px';
        const suffix=e.historyOnly?` → ${short(e.destination)}へ繰越`:e.carryover?' / ↪ 繰越':'';
        el.title=`${e.title} ${fmt(e.startMin)}–${fmt(e.startMin+e.durMin)}${suffix}`;
        el.innerHTML=`<b>${e.historyOnly?esc(e.title):link(e.title,e.url)}</b><small>${fmt(e.startMin)}–${fmt(e.startMin+e.durMin)}${esc(suffix)}</small>`;
        if(!e.historyOnly && ['task','regular'].includes(e.type)) {
          el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`${short(e.date)} ${e.title} ${e.done?'完了済み・未完了に戻す':'完了にする'}`);
          const toggle=()=>{if(!latest())return;C.markEvent(state,e.id,!state.events.find(x=>x.id===e.id)?.done);save();renderAll();};
          el.onclick=evt=>{if(!evt.target.closest('a'))toggle();};
          el.onkeydown=evt=>{if(evt.target===el && ['Enter',' '].includes(evt.key)){evt.preventDefault();toggle();}};
        }
        col.append(el);
      }
      grid.append(col);
    }
  }
  function renderToday() {
    $('todayDateLabel').textContent=`（${today.replaceAll('-','/')} / 翌3:00まで）`;
    const events=state.events.filter(e=>e.date===today).sort((a,b)=>a.startMin-b.startMin);
    $('todayEvents').innerHTML=events.length?events.map(e=>{
      if(['break','free'].includes(e.type))return `<div class="taskline"><strong style="width:55px">${fmt(e.startMin)}</strong><span>${esc(e.title)}</span></div>`;
      const origin=e.carryover?`<small class="cp-origin">${e.originDate?esc(short(e.originDate))+'から':''}繰り越し</small>`:'';
      return `<label class="checkpoint-item${e.done?' done':''}"><input aria-label="${esc(e.title)}" type="checkbox" data-event="${esc(e.id)}" ${e.done?'checked':''}><div class="cp-time">${fmt(e.startMin)}</div><div class="cp-title">${link(e.title,e.url)}${origin}</div><div class="cp-state">${e.done?'完了':'未完了'}</div></label>`;
    }).join(''):'<div class="empty">予定なし</div>';
  }
  function renderTasks() {
    $('tasks').innerHTML=state.tasks.map(t=>{
      const event=state.events.find(e=>e.taskId===t.id);
      const status=t.done?'完了':event?`${short(event.date)} ${fmt(event.startMin)}に配置`:'';
      return `<label class="taskline${t.done?' done':''}"><input aria-label="${esc(t.text)}" type="checkbox" data-task="${esc(t.id)}" ${t.done?'checked':''}><span>${link(t.text,t.url)}</span><small style="margin-left:auto;color:var(--muted);white-space:nowrap">${esc(status)}</small></label>`;
    }).join('');
  }
  function renderMemos() {$('memoGrid').innerHTML=state.memos.map(m=>`<div class="note"><div class="date">${esc(m.date)}</div>${esc(m.text)}</div>`).join('');}
  function renderAll() {renderWeek();renderToday();renderTasks();renderMemos();renderSave();renderNotice();}
  function fillSelects() {
    for(const id of ['planDay','eventDay']) {
      const previous=$(id).value;
      $(id).innerHTML=DAYS.map((d,i)=>`<option value="${i}">${d} ${short(dateForDay(i))}</option>`).join('');
      $(id).value=previous||String(selectedDay);
    }
    for(const id of ['planStart','eventStart']) {
      if($(id).options.length)continue;
      for(let m=C.START;m<C.END;m+=30)$(id).add(new Option(fmt(m),String(m)));
    }
  }
  function openModal(day=selectedDay,start=19*60) {
    if(locked)return;
    fillSelects();modalDate=dateForDay(day);
    $('eventDay').value=day;$('eventStart').value=Math.floor(start/30)*30;
    $('eventTitle').value='';$('eventType').value='regular';$('eventError').textContent='';$('modal').classList.add('open');$('eventTitle').focus();
  }
  const closeModal=()=>$('modal').classList.remove('open');
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.tab,.view').forEach(el=>el.classList.remove('active'));
    b.classList.add('active');$(b.dataset.view).classList.add('active');
  });
  $('mobileDaybar').onclick=e=>{const b=e.target.closest('[data-day]');if(b){selectedDay=+b.dataset.day;renderWeek();}};
  $('todayEvents').onchange=e=>{if(!e.target.dataset.event||!latest())return;C.markEvent(state,e.target.dataset.event,e.target.checked);save();renderAll();};
  $('tasks').onchange=e=>{if(!e.target.dataset.task||!latest())return;C.markTask(state,e.target.dataset.task,e.target.checked);save();renderAll();};
  $('rolloverBtn').onclick=()=>{
    if(!latest())return;updateCalendar();const result=C.rollover(state,new Date(),{manual:true});save();renderAll();
    $('rolloverStatus').textContent=result.moved?`${result.moved}件を明日以降の空き時間へ送りました。`:result.waiting?'休憩込みの空き時間が見つかりませんでした。':'明日へ送る未完了タスクはありません。';
  };
  $('fab').onclick=()=>openModal();$('cancelModal').onclick=closeModal;
  $('eventDay').onchange=()=>{modalDate=dateForDay(+$('eventDay').value);};
  $('saveEvent').onclick=()=>{
    if(!latest())return;
    const date=modalDate,startMin=+$('eventStart').value,durMin=+$('eventDuration').value;
    if(startMin+durMin>C.END){$('eventError').textContent='予定は翌3:00までに収まる長さにしてください。';return;}
    if(C.overlaps(state.events,date,startMin,durMin)){$('eventError').textContent='この時間には予定があります。空いている時間を選んでください。';return;}
    state.events.push({id:C.nextId(state),date,startMin,durMin,title:$('eventTitle').value.trim()||'予定',type:$('eventType').value,done:false,auto:false});
    C.rollover(state,new Date());save();closeModal();renderAll();
  };
  $('addTask').onclick=()=>{
    const text=$('taskInput').value.trim();if(!text||!latest())return;
    state.tasks.push({id:C.nextId(state,'todo'),text,createdDate:C.today(),done:false});$('taskInput').value='';save();renderTasks();
  };
  $('addMemo').onclick=()=>{
    const text=$('memoInput').value.trim();if(!text||!latest())return;
    state.memos.unshift({date:C.today().replaceAll('-','/'),text});$('memoInput').value='';save();renderMemos();
  };
  const backupKey=KEY+'-before-import';
  function exportedData() {if(!latest())return null;return JSON.stringify(state,null,2);}
  $('exportData').onclick=()=>{const data=exportedData();if(data){$('backupData').value=data;$('backupStatus').textContent='表示した内容をすべてコピーして、別の端末へ引き継げます。';}};
  $('downloadData').onclick=()=>{
    const data=exportedData();if(!data)return;
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download=`shinichiro-planner-${C.today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    $('backupStatus').textContent='バックアップファイルを保存しました。';
  };
  function readBackup(raw) {
    if(raw.length>2000000)throw new Error('too large');
    const parsed=JSON.parse(raw);
    if(!C.validState(parsed))throw new Error('invalid backup');
    if(parsed.events.some(e=>e.history!==undefined&&(!Array.isArray(e.history)||e.history.some(h=>!h||!C.validState({...parsed,events:[{...e,...h,history:undefined}]})))))throw new Error('invalid history');
    parsed.sequence=Math.max(1000,Number.isSafeInteger(parsed.sequence)?parsed.sequence:1000,...[...parsed.events,...parsed.tasks].map(e=>Number(e.id.match(/-(\d+)$/)?.[1])||0));
    return parsed;
  }
  try {$('undoImport').hidden=!localStorage.getItem(backupKey);}catch{$('undoImport').hidden=true;}
  $('importData').onclick=()=>{
    if(!latest())return;
    try {
      const incoming=readBackup($('backupData').value);
      localStorage.setItem(backupKey,JSON.stringify(state));
      const previous=state;state=incoming;C.rollover(state,new Date());
      if(!save()){state=previous;throw new Error('save failed');}
      $('backupData').value='';$('undoImport').hidden=false;renderAll();
      $('backupStatus').textContent=`取り込みました：予定${state.events.filter(e=>['task','regular'].includes(e.type)).length}件、TODO${state.tasks.length}件、メモ${state.memos.length}件。`;
    } catch(error) {$('backupStatus').textContent='取り込めませんでした。バックアップの内容と保存領域を確認してください。';}
  };
  $('undoImport').onclick=()=>{
    if(!latest())return;
    try {
      const previous=state;state=readBackup(localStorage.getItem(backupKey)||'');
      if(!save()){state=previous;throw new Error('save failed');}
      localStorage.removeItem(backupKey);$('undoImport').hidden=true;renderAll();$('backupStatus').textContent='取り込み前の内容に戻しました。';
    } catch(error){$('backupStatus').textContent='取り込み前の内容を復元できませんでした。';}
  };
  function buildPlan() {
    if(!latest())return;
    const label=$('planInput').value.trim()||'作業',date=dateForDay(+$('planDay').value),start=+$('planStart').value;
    const steps=label.includes('動画')?['素材確認・読み込み','使う素材を選別','不要部分をカット','構成・テンポを整える','テロップを入れる','BGM・効果音を入れる','音量バランスを整える','色味・見た目を整える','最終確認・書き出し']:
      [`${label}の準備・ゴール確認`,...Array.from({length:5},(_,i)=>`${label} ${i+1}`)];
    const working=clone(state),made=[];
    for(let i=0;i<steps.length;i++) {
      const e={id:C.nextId(working),title:steps[i],type:'task',durMin:25,auto:true,done:false};
      if(!C.placeWork(working,e,new Date(),date,start,(i+1)%3===0?30:0)){
        $('planSummary').textContent='空き時間が足りず予定を作れませんでした。元の予定はそのままです。';return;
      }
      made.push(e);
    }
    state=working;save();renderAll();
    $('planSummary').className='timeline';$('planSummary').innerHTML=`<div class="hint">${esc(label)}を${made.length}個の25分タスクに分け、既存予定を避けて配置しました。</div>`+
      made.map(e=>`<div class="trow"><div class="time">${short(e.date)}<br>${fmt(e.startMin)}</div><div>${esc(e.title)}</div><div class="badge task">作業</div></div>`).join('');
  }
  $('buildPlan').onclick=buildPlan;
  $('clearAuto').onclick=()=>{
    if(!latest())return;
    state.events=state.events.filter(e=>!e.auto);save();renderAll();$('planSummary').textContent='「AIで組む」で追加した予定を消しました。';
  };
  $('prevWeek').onclick=()=>{weekOffset--;fillSelects();renderWeek();};
  $('nextWeek').onclick=()=>{weekOffset++;fillSelects();renderWeek();};
  $('todayBtn').onclick=()=>{updateCalendar();weekOffset=0;selectedDay=(C.parseDate(today).getDay()+6)%7;fillSelects();renderAll();document.querySelector('[data-view="week"]').click();};
  window.addEventListener('storage',e=>{if(e.key===KEY){latest();updateCalendar();renderAll();}});
  window.addEventListener('focus',()=>{autoRollover();fillSelects();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){autoRollover();fillSelects();}});
  let resize;window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(renderWeek,120);});
  setInterval(()=>{if(!document.hidden){autoRollover();fillSelects();}},60000);
  updateCalendar();fillSelects();$('planStart').value=C.START;
  if(!locked){C.rollover(state,new Date());save();}
  renderAll();
  if(locked)document.querySelectorAll('input,select,button').forEach(el=>{el.disabled=true;});
})();
