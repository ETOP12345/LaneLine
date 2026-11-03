const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../relay-engine');
const sw=(id,times,division='boys',team='Club')=>({id,name:id,team,ageGroup:'12',division,bestTimes:Object.entries(times).map(([event,time])=>({event:event+' SCY',time,meet:'Meet',date:'2026-10-01'}))});
const options={age:'11-12',course:'SCY',division:'boys',event:'200-free'};
test('swimmers who left PNS are not assigned to relays',()=>{
  const swimmers=Array.from({length:4},(_,i)=>sw('S'+i,{'50 Free':'25.00'}));
  swimmers[0].activePns=false;
  assert.ok(E.predict(swimmers,options).every(row=>!row.complete));
});
test('A, B and C use twelve unique swimmers and sum exact centiseconds',()=>{
  const swimmers=Array.from({length:12},(_,i)=>sw('S'+i,{'50 Free':(20+i)+'.01'}));
  const rows=E.predict([...swimmers,swimmers[0]],options);
  assert.deepEqual(rows.map(r=>r.squad),['A','B','C']);
  assert.deepEqual(rows.map(r=>r.total),[8604,10204,11804]);
  assert.equal(new Set(rows.flatMap(r=>r.lineup.map(l=>l.id))).size,12);
  assert.equal(rows[0].time,'1:26.04');
});
test('medley assignment finds the optimum instead of greedily reusing a specialist',()=>{
  const swimmers=[sw('A',{'50 Back':'10.00','50 Breast':'10.00'}),sw('B',{'50 Back':'11.00','50 Breast':'50.00'}),sw('C',{'50 Fly':'12.00'}),sw('D',{'50 Free':'13.00'})];
  const row=E.predict(swimmers,{...options,event:'200-medley'})[0];
  assert.equal(row.total,4600);assert.deepEqual(row.lineup.map(l=>l.name),['B','A','C','D']);
  assert.equal(row.lineup[0].meet,'Meet');
});
test('mixed squads each contain two boys and two girls with no reuse',()=>{
  const swimmers=Array.from({length:8},(_,i)=>sw('S'+i,{'50 Free':(20+i)+'.00'},i<4?'boys':'girls'));
  const rows=E.predict(swimmers,{...options,division:'mixed'});
  assert.equal(rows.filter(r=>r.complete).length,2);
  for(const row of rows.filter(r=>r.complete))assert.equal(row.lineup.filter(l=>l.division==='boys').length,2);
  assert.equal(new Set(rows.flatMap(r=>r.lineup.map(l=>l.id))).size,8);
});
test('predictions isolate age, course, division and team and handle missing times honestly',()=>{
  const swimmers=[sw('A',{'50 Free':'20.00'}),sw('B',{'50 Free':'21.00'}),sw('C',{'50 Free':'22.00'}),sw('Girl',{'50 Free':'19.00'},'girls'),{...sw('Older',{'50 Free':'18.00'}),ageGroup:'13'},sw('Other',{'50 Free':'17.00'},'boys','Other Club')];
  assert.ok(E.predict(swimmers,options).every(r=>!r.complete&&r.rank===null));
  assert.ok(E.predict(swimmers,{...options,course:'LCM'}).every(r=>!r.complete));
  assert.ok(E.predict(swimmers,{...options,event:'200-medley'}).every(r=>!r.complete));
});
test('equal predicted totals share a rank',()=>{
  const swimmers=['Club 1','Club 2'].flatMap(team=>Array.from({length:4},(_,i)=>sw(team+i,{'50 Free':'20.00'},'boys',team)));
  const rows=E.predict(swimmers,options).filter(r=>r.complete);
  assert.deepEqual(rows.map(r=>r.rank),[1,1]);
});
