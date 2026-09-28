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
