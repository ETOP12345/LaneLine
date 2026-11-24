const test=require('node:test');
const assert=require('node:assert/strict');
const {importScores}=require('../scripts/import-imx-imr');
const state=()=>({data:{swimmers:{}},queue:{swimmers:{abc:{name:'Example Swimmer',status:'pending'}}}});
const snapshot=(programs=['IMX','IMR'],records=[])=>({memberId:'abc',name:'Example Swimmer',programs,records});
test('verified empty scores are checked, not left pending or fabricated',()=>{
  const s=state();importScores(snapshot(),s);
  assert.equal(s.queue.swimmers.abc.status,'complete');
  assert.deepEqual(s.data.swimmers.abc.records,[]);
});
test('one program remains partial until both programs are verified',()=>{
  const s=state();importScores(snapshot(['IMX']),s);
  assert.equal(s.queue.swimmers.abc.status,'partial');
  importScores(snapshot(['IMR']),s);
  assert.equal(s.queue.swimmers.abc.status,'complete');
});
test('mismatched identity and invalid official ranks cannot change saved data',()=>{
  const s=state();assert.throws(()=>importScores({...snapshot(),name:'Other Swimmer'},s),/identity/);
  assert.throws(()=>importScores(snapshot(['IMX'],[['IMX','SCY','2026-2027',13,2500,1,0,30,100,6]]),s),/rank/);
  assert.deepEqual(s.data.swimmers,{});
});
test('six-event IMX format and season-age identity survive compact imports',()=>{
  const s=state();importScores(snapshot(['IMX'],[['IMX','SCY','2026-2027',13,2500,1,2,30,100,6]]),s);
  assert.equal(s.data.swimmers.abc.records[0].eventCount,6);
});
test('summary reimports preserve verified detailed events at the same score',()=>{
  const s=state(),row={program:'IMX',course:'SCY',season:'2026-2027',age:13,score:2500,ranks:{club:1,lsc:2,zone:30,national:100},events:[{event:'200 IM'}]};
  importScores(snapshot(['IMX'],[row]),s);
  importScores(snapshot(['IMX'],[['IMX','SCY','2026-2027',13,2500,1,2,30,100,6]]),s);
  assert.deepEqual(s.data.swimmers.abc.records[0].events,row.events);
});
