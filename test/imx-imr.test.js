const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const imx=require('../imx-imr');
const id='9DCE8A4B52EF4A';
test('leaderboard matches score cohort, sorts descending, deduplicates and ranks ties',()=>{
  const current={program:'IMX',course:'SCY',season:'2026-2027',age:12,score:1000};
  const roster=['a','b','c','d','e','f','g','h'].map(memberId=>({usaSwimmingMemberId:memberId,name:memberId,division:memberId==='d'?'girls':'boys',team:'BCST'}));
  const data={swimmers:{}};
  for(const s of roster)data.swimmers[s.usaSwimmingMemberId]={records:[{...current,score:2000}]};
  data.swimmers.a.records=[current];
  data.swimmers.b.records.push({...current,score:1900});
  data.swimmers.e.records[0].age=13;
  data.swimmers.f.records[0].course='LCM';
  data.swimmers.g.records[0].season='2025-2026';
  data.swimmers.h.records[0].program='IMR';
  const rows=imx.leaderboard(current,roster[0],roster,data);
  assert.deepEqual(rows.map(r=>[r.memberId,r.score,r.rank]),[['b',2000,1],['c',2000,1],['a',1000,3]]);
  assert.deepEqual(imx.leaderboard(current,{usaSwimmingMemberId:'unknown'},roster,data),[]);
  assert.deepEqual(imx.leaderboard(null,roster[0],roster,data),[]);
});
test('official IMX history is newest first and course-filtered',()=>{
  const rows=imx.records(id,'IMX','All');
  assert.equal(rows.length,5);
  assert.equal(rows[0].score,3097);
  assert.deepEqual(rows[0].ranks,{club:1,lsc:2,zone:24,national:95});
  assert.equal(imx.records(id,'IMX','SCY').length,2);
  assert.equal(imx.records(id,'IMX','SCM').length,0);
});
test('official IMR history preserves separate age records in one season',()=>{
  const rows=imx.records(id,'IMR');
  assert.equal(rows.length,9);
  assert.equal(rows[0].score,2950);
  assert.deepEqual(imx.records(id,'IMR','SCY').filter(r=>r.season==='2025-2026').map(r=>r.age),[12,11]);
});
test('counted events reconcile exactly to official totals',()=>{
  for(const program of ['IMX','IMR'])for(const r of imx.records(id,program)){
    if(!r.events.length)continue;
    assert.equal(r.events.length,5);
    assert.equal(r.events.reduce((total,e)=>total+e.points,0),r.score);
    for(const e of r.events)assert.match(e.date,/^\d{4}-\d{2}-\d{2}$/);
  }
});
test('unknown athletes never inherit another athlete official scores',()=>{
  assert.deepEqual(imx.records('unknown','IMX'),[]);
  assert.deepEqual(imx.records(undefined,'IMR'),[]);
});
test('extended imports are accessible by the selected swimmer member ID',()=>{
  assert.equal(imx.records('C8B64773962AF0','IMX').length,2);
  assert.equal(imx.records('C8B64773962AF0','IMR').length,5);
  assert.equal(imx.records('03A64F943FE144','IMX')[0].eventCount,6);
  assert.equal(imx.records('529E741DB1114E','IMX').length,0);
  assert.equal(imx.records('529E741DB1114E','IMR')[0].score,3697);
});
test('tab, local server and deployment package include the feature',()=>{
  const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.match(read('index.html'),/id="ptab-imx"/);
  assert.match(read('index.html'),/id="imx-page"/);
  assert.match(read('server.js'),/"\/imx-imr.js"/);
  assert.match(read('.github/workflows/deploy-laneline.yml'),/cp imx-imr.js _site\//);
});
