const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../insights-engine.js');
const data=require('../time-standards.json');
const rated=(stroke,ratio)=>({row:{event:'100 '+stroke+' SCY',time:'1:00.00'},ratio});
test('archetypes distinguish specialized, dual and all-round without event-count bias',()=>{
  const rows=[rated('breast',1.02),rated('im',0.97),rated('free',0.90),rated('fly',0.88),rated('back',0.89)];
  const type=I.archetype(rows);
  assert.equal(type.label,'Specialized Breaststroke');
  assert.ok(Math.abs(type.groups.reduce((s,g)=>s+g.share,0)-1)<1e-12);
  assert.deepEqual(I.archetype([...rows,rated('breast',0.9)]).groups.map(g=>g.share),type.groups.map(g=>g.share));
  assert.equal(I.archetype([rated('free',1),rated('fly',0.98),rated('back',0.9)]).label,'Dual Freestyle / Butterfly');
  assert.equal(I.archetype([rated('free',1),rated('fly',0.98),rated('back',0.99)]).label,'All-Round Swimmer');
});
test('archetypes handle missing standards, sparse coverage and courses',()=>{
  assert.equal(I.archetype([rated('free',null)]).groups.length,0);
  assert.equal(I.archetype([rated('breast',1)]).label,'Emerging Breaststroke');
  assert.equal(I.archetype([rated('breast',1)]).provisional,true);
});
const swimmer=(id,time,age='12',division='boys')=>({id,ageGroup:age,division,bestTimes:[{event:'50 Free SCY',time},{event:'50 Free LCM',time:'32.00'}]});
test('strength comparisons isolate age, division, course and handle ties',()=>{
  const me=swimmer('me','28.00');
  const peers=[me,swimmer('a','27.00'),swimmer('b','28.00'),swimmer('c','26.00','11'),swimmer('d','26.00','12','girls')];
  const [r]=I.strengths(me,peers,'SCY',data);
  assert.equal(r.rank,2);assert.equal(r.total,3);assert.equal(r.tied,1);assert.equal(r.level,'A');
  assert.equal(I.bestRows(me,'LCM').length,1);
});
test('duplicate rows use fastest legal time and unknown events have no pace index',()=>{
  const me=swimmer('me','28.00');me.bestTimes.push({event:'50 Free SCY',time:'DQ'},{event:'50 Free SCY',time:'27.00'},{event:'25 Free SCY',time:'15.00'});
  const rows=I.strengths(me,[me],'SCY',data);
  assert.equal(rows[0].row.time,'27.00');assert.equal(rows[1].ratio,null);
});
test('goal progress is exact, bounded, and recognizes reached goals',()=>{
  const goal={baseline:'30.91',cut:'30.50'};
  assert.equal(I.goalProgress(goal,'30.91').progress,0);
  assert.equal(I.goalProgress(goal,'30.70').drop,0.20);
  assert.equal(I.goalProgress(goal,'31.00').progress,0);
  assert.equal(I.goalProgress(goal,'30.49').progress,100);
  assert.equal(I.goalProgress(goal,'30.49').met,true);
  assert.equal(I.goalProgress(goal,'DQ'),null);
});
