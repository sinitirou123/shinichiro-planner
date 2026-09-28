const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../public/planner-core.js');
const fresh=()=>({version:15,sequence:1000,events:[],tasks:[],memos:[]});
const event=(id,date,startMin,durMin,type='task',extra={})=>({id,date,startMin,durMin,type,title:id,done:false,...extra});
const now=new Date(2026,8,28,10,2);
function noOverlaps(s,date) {
  const entries=s.events.filter(e=>e.date===date).sort((a,b)=>a.startMin-b.startMin);
  for(let i=1;i<entries.length;i++)assert.ok(entries[i-1].startMin+entries[i-1].durMin<=entries[i].startMin);
}
test('過去の未完了だけを、固定予定を避けて現在時刻より後へ移す',()=>{
  const s=fresh();s.events=[event('old','2026-09-25',1200,25),event('finished','2026-09-25',1230,25,'task',{done:true}),event('stream','2026-09-25',1320,300,'regular'),event('meeting','2026-09-28',600,60,'regular'),event('break','2026-09-25',1225,5,'break')];
  assert.deepEqual(C.rollover(s,now),{moved:1,waiting:0});
  assert.equal(s.events[0].date,'2026-09-28');assert.equal(s.events[0].startMin,660);
  assert.equal(s.events[1].date,'2026-09-25');assert.equal(s.events[2].date,'2026-09-25');
  assert.deepEqual(s.events[0].history,[{date:'2026-09-25',startMin:1200,durMin:25}]);noOverlaps(s,'2026-09-28');
});
test('再実行・保存復元で繰り越しが重複しない',()=>{
  const s=fresh();s.events=[event('old','2026-09-25',1200,25)];
  s.tasks=[{id:'todo',text:'todo',createdDate:'2026-09-25',done:false}];
  C.rollover(s,now);const restored=JSON.parse(JSON.stringify(s)),before=JSON.stringify(restored);
  assert.deepEqual(C.rollover(restored,now),{moved:0,waiting:0});assert.equal(JSON.stringify(restored),before);
});
test('完了済みTODOと今日追加したTODOを除外し、古いTODOを25分で配置',()=>{
  const s=fresh();s.tasks=[{id:'old',text:'old',createdDate:'2026-09-25',done:false},{id:'done',text:'done',createdDate:'2026-09-25',done:true},{id:'new',text:'new',createdDate:'2026-09-28',done:false}];
  assert.equal(C.rollover(s,now).moved,1);assert.equal(s.events.filter(e=>e.type==='task').length,1);
  assert.equal(s.events[0].taskId,'old');assert.equal(s.events[0].durMin,25);assert.ok(s.events[0].startMin>=605);
});
test('週・月・年をまたいで空きを探す',()=>{
  const s=fresh();s.events=[event('old','2026-12-30',600,25),event('full','2026-12-31',540,1080,'regular')];
  C.rollover(s,new Date(2026,11,31,10));assert.equal(s.events[0].date,'2027-01-01');assert.equal(s.events[0].startMin,540);
});
test('深夜3時の境界を守り、残り時間に入らなければ翌9時へ',()=>{
  assert.equal(C.today(new Date(2026,8,28,2,59)),'2026-09-27');assert.equal(C.today(new Date(2026,8,28,3,0)),'2026-09-28');
  const s=fresh();s.events=[event('old','2026-09-26',600,25)];C.rollover(s,new Date(2026,8,28,2,40));
  assert.equal(s.events[0].date,'2026-09-28');assert.equal(s.events[0].startMin,540);
});
test('深夜の現在時刻より前へ戻さない',()=>{
  const s=fresh();s.events=[event('old','2026-09-25',600,25)];C.rollover(s,new Date(2026,8,28,0,15));
  assert.equal(s.events[0].date,'2026-09-27');assert.equal(s.events[0].startMin,1455);
});
test('休憩5分・3タスクごとの自由時間30分を含めて重なりを避ける',()=>{
  const s=fresh();s.events=Array.from({length:6},(_,i)=>event('old-'+i,'2026-09-25',600+i*30,25));
  C.rollover(s,new Date(2026,8,28,8));const working=s.events.filter(e=>e.type==='task');
  assert.deepEqual(working.map(e=>e.startMin),[540,570,600,660,690,720]);
  assert.equal(s.events.filter(e=>e.type==='break').length,6);assert.equal(s.events.filter(e=>e.type==='free').length,2);noOverlaps(s,'2026-09-28');
});
test('空き不足でも元のタスクを失わない',()=>{
  const s=fresh();s.events=[event('old','2026-09-25',540,1080)];const original=JSON.stringify(s.events[0]);
  assert.deepEqual(C.rollover(s,now),{moved:0,waiting:1});assert.equal(JSON.stringify(s.events[0]),original);
});
test('先60日が埋まっていたら未配置として保持',()=>{
  const s=fresh();s.events=[event('old','2026-09-25',600,25),...Array.from({length:60},(_,i)=>event('busy-'+i,C.addDays('2026-09-28',i),540,1080,'regular'))];
  assert.equal(C.rollover(s,now).waiting,1);assert.equal(s.events[0].date,'2026-09-25');
});
test('翌日も未完了なら同じIDを移動、TODOの重複を作らない',()=>{
  const s=fresh();s.tasks=[{id:'todo',text:'todo',createdDate:'2026-09-25',done:false}];C.rollover(s,now);
  const id=s.events.find(e=>e.taskId==='todo').id;C.rollover(s,new Date(2026,8,29,9));
  const tasks=s.events.filter(e=>e.taskId==='todo');assert.equal(tasks.length,1);assert.equal(tasks[0].id,id);assert.equal(tasks[0].date,'2026-09-29');
});
test('予定とTODOの完了状態を双方向に同期し完了後は動かさない',()=>{
  const s=fresh();s.tasks=[{id:'todo',text:'todo',createdDate:'2026-09-25',done:false}];C.rollover(s,now);
  const e=s.events.find(e=>e.taskId==='todo');C.markEvent(s,e.id,true);assert.equal(s.tasks[0].done,true);
  assert.equal(C.rollover(s,new Date(2026,8,29,9)).moved,0);C.markTask(s,'todo',false);assert.equal(e.done,false);
  assert.equal(C.rollover(s,new Date(2026,8,29,9)).moved,1);
});
test('手動繰り越しは翌日以降、固定予定を動かさない',()=>{
  const s=fresh();s.events=[event('task','2026-09-28',660,25),event('meeting','2026-09-28',720,60,'regular')];
  C.rollover(s,now,{manual:true});assert.equal(s.events[0].date,'2026-09-29');assert.equal(s.events[1].date,'2026-09-28');
  assert.equal(C.rollover(s,now,{manual:true}).moved,0);
});
test('保存データの検証は壊れたデータを拒否する',()=>{
  const s=fresh();assert.equal(C.validState(s),true);s.events=[event('e','2026-09-31',600,25)];assert.equal(C.validState(s),false);
  s.events=[event('e','2026-09-28',1600,60)];assert.equal(C.validState(s),false);
});

test('固定予定を追加すると重なる作業と休憩をまとめて移し、TODOの対応を保つ',()=>{
  const s=fresh();s.tasks=[{id:'todo',text:'確認',createdDate:'2026-09-28',done:false}];
  s.events=[event('work','2026-09-28',600,25,'task',{taskId:'todo'}),event('rest','2026-09-28',625,5,'break',{ownerEventId:'work'}),event('meeting','2026-09-28',870,150,'regular')];
  const result=C.addFixedPlan(s,{date:'2026-09-28',title:'配達',startMin:570,durMin:300},now);
  assert.deepEqual(result,{ok:true,moved:1});assert.ok(C.validState(s));noOverlaps(s,'2026-09-28');
  assert.equal(s.events.find(e=>e.id==='work').startMin,1020);assert.equal(s.events.some(e=>e.id==='rest'),false);
  assert.equal(s.events.find(e=>e.id==='meeting').startMin,870);C.markEvent(s,'work',true);assert.equal(s.tasks[0].done,true);
});
test('固定予定や完了済みの作業と重なる追加は元のデータを変えずに拒否する',()=>{
  for(const existing of [event('meeting','2026-09-28',600,60,'regular'),event('done','2026-09-28',600,25,'task',{done:true})]){
    const s=fresh();s.events=[existing];const before=JSON.stringify(s);
    assert.deepEqual(C.addFixedPlan(s,{date:'2026-09-28',title:'追加',startMin:600,durMin:60},now),{ok:false,error:'conflict'});
    assert.equal(JSON.stringify(s),before);
  }
});
test('移動先がない場合は固定予定の追加を取り消し、作業も休憩も失わない',()=>{
  const s=fresh();s.events=[event('work','2026-09-28',600,25),event('rest','2026-09-28',625,5,'break',{ownerEventId:'work'}),...Array.from({length:59},(_,i)=>event('busy-'+i,C.addDays('2026-09-28',i+1),540,1080,'regular'))];
  const before=JSON.stringify(s);
  assert.deepEqual(C.addFixedPlan(s,{date:'2026-09-28',title:'終日',startMin:540,durMin:1080},now),{ok:false,error:'no-space'});
  assert.equal(JSON.stringify(s),before);
});
test('作業後の休憩だけ重なる場合も移動し、翌3時までの固定予定を扱える',()=>{
  const s=fresh();s.events=[event('work','2026-09-28',1470,25),event('rest','2026-09-28',1495,5,'break',{ownerEventId:'work'})];
  assert.deepEqual(C.addFixedPlan(s,{date:'2026-09-28',title:'深夜配信',startMin:1495,durMin:125},now),{ok:true,moved:1});
  noOverlaps(s,'2026-09-28');assert.ok(C.validState(s));
  const before=JSON.stringify(s);
  assert.deepEqual(C.addFixedPlan(s,{date:'2026-09-28',title:'範囲外',startMin:1500,durMin:150},now),{ok:false,error:'invalid'});
  assert.equal(JSON.stringify(s),before);
});
