(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlannerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const START = 9 * 60, END = 27 * 60;
  const pad = n => String(n).padStart(2, '0');
  function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function parseDate(key) { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); }
  function addDays(key, n) { const d = parseDate(key); d.setDate(d.getDate()+n); return dateKey(d); }
  function today(now = new Date()) {
    const d = new Date(now);
    if (d.getHours() < 3) d.setDate(d.getDate()-1);
    return dateKey(d);
  }
  function currentMinute(now) {
    return now.getHours()*60 + now.getMinutes() + (now.getHours()<3 ? 1440 : 0) + (now.getSeconds() || now.getMilliseconds() ? 1 : 0);
  }
  function nextId(state, prefix='event') {
    state.sequence = (state.sequence || 1000) + 1;
    return `${prefix}-${state.sequence}`;
  }
  function overlaps(events, date, start, duration, exclude) {
    return events.some(e => e.id !== exclude && e.date === date && start < e.startMin+e.durMin && start+duration > e.startMin);
  }
  function findSlot(events, duration, now, fromDate=today(now), fromMinute=START, horizon=60) {
    const todayKey = today(now);
    const first = fromDate < todayKey ? todayKey : fromDate;
    if (duration <= 0 || duration > END-START) return null;
    for (let offset=0; offset<horizon; offset++) {
      const date = addDays(first, offset);
      let start = Math.max(START, date===fromDate ? fromMinute : START,
        date===todayKey ? currentMinute(now) : START);
      start = Math.ceil(start/5)*5;
      for (; start+duration<=END; start+=5) {
        if (!overlaps(events,date,start,duration)) return {date,startMin:start};
      }
    }
    return null;
  }
  function validState(s) {
    const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value))===value;
    return !!s && s.version===15 && Array.isArray(s.events) && Array.isArray(s.tasks) && Array.isArray(s.memos)
      && s.events.every(e=>e && typeof e.id==='string' && validDate(e.date) && typeof e.title==='string'
        && Number.isFinite(e.startMin) && Number.isFinite(e.durMin) && e.durMin>0
        && e.startMin>=START && e.startMin+e.durMin<=END && ['task','regular','break','free'].includes(e.type))
      && new Set(s.events.map(e=>e.id)).size===s.events.length
      && s.tasks.every(t=>t && typeof t.id==='string' && typeof t.text==='string' && validDate(t.createdDate))
      && new Set(s.tasks.map(t=>t.id)).size===s.tasks.length
      && s.memos.every(m=>m && typeof m.text==='string' && typeof m.date==='string');
  }
  function markEvent(state, id, done) {
    const event = state.events.find(e=>e.id===id);
    if (!event) return;
    event.done = done;
    if (event.taskId) { const task=state.tasks.find(t=>t.id===event.taskId); if(task) task.done=done; }
  }
  function markTask(state, id, done) {
    const task=state.tasks.find(t=>t.id===id);
    if (!task) return;
    task.done=done;
    state.events.filter(e=>e.taskId===id).forEach(e=>{e.done=done;});
  }
  function placeWork(state, event, now, fromDate, fromMinute=START, extraRest=0) {
    const slot=findSlot(state.events,event.durMin+5+extraRest,now,fromDate,fromMinute);
    if(!slot) return null;
    const previousDate=event.date;
    if(state.events.includes(event)) {
      event.history=event.history||[];
      event.history.push({date:event.date,startMin:event.startMin,durMin:event.durMin});
    } else state.events.push(event);
    Object.assign(event,slot);
    if(previousDate) event.originDate=event.originDate||previousDate;
    state.events.push({id:nextId(state,'break'),date:slot.date,startMin:slot.startMin+event.durMin,durMin:5,
      title:'休憩',type:'break',ownerEventId:event.id,auto:event.auto||false});
    if(extraRest) state.events.push({id:nextId(state,'free'),date:slot.date,startMin:slot.startMin+event.durMin+5,
      durMin:extraRest,title:'自由時間',type:'free',ownerEventId:event.id,auto:event.auto||false});
    return event;
  }
  function rollover(state, now=new Date(), options={}) {
    const day=today(now), manual=!!options.manual;
    const fromDate=manual ? addDays(day,1) : day;
    const queue=state.events.filter(e=>e.type==='task' && !e.done && (manual ? e.date<=day : e.date<day))
      .map(event=>({event,date:event.date,start:event.startMin}));
    state.tasks.filter(t=>!t.done && (manual || t.createdDate<day)
      && !state.events.some(e=>e.taskId===t.id))
      .forEach(task=>queue.push({task,date:task.createdDate,start:END}));
    queue.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
    let moved=0, waiting=0;
    for(const item of queue) {
      const event=item.event || {id:nextId(state),title:item.task.text,url:item.task.url,type:'task',durMin:25,
        taskId:item.task.id,done:false,originDate:item.task.createdDate};
      const extraRest=(moved+1)%3===0 ? 30 : 0;
      if(!placeWork(state,event,now,fromDate,START,extraRest)) {waiting++;continue;}
      event.carryover=true;
      moved++;
    }
    if(moved || waiting) state.lastRollover={at:now.toISOString(),moved,waiting};
    return {moved,waiting};
  }
  return {START,END,dateKey,parseDate,addDays,today,currentMinute,nextId,overlaps,findSlot,validState,
    markEvent,markTask,placeWork,rollover};
});
