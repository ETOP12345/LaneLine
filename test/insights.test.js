const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../insights-engine.js');
const data=require('../time-standards.json');
const rated=(stroke,ratio)=>({row:{event:'100 '+stroke+' SCY',time:'1:00.00'},ratio});
test('event comparisons isolate age, division and course, deduplicate IDs, and rank ties',()=>{
  const me={...swimmer('me','28.00'),name:'Selected',usaSwimmingMemberId:'one'};
  const faster={...swimmer('fast','27.50'),name:'Faster'};
  const slower={...swimmer('slow','29.00'),name:'Slower'};
  const tied={...swimmer('tie','28.00'),name:'Tied'};
  const otherAge={...swimmer('old','25.00','13'),name:'Older'};
  const otherDivision={...swimmer('girl','25.00','12','girls'),name:'Other division'};
  const result=I.eventComparison(me,[me,{...me,id:'duplicate'},faster,slower,tied,otherAge,otherDivision,swimmer('invalid','0.00')],'50 Free SCY','SCY');
  assert.equal(result.rows.length,4);assert.equal(result.rank,2);
  assert.equal(result.ahead,1);assert.equal(result.behind,1);assert.equal(result.tied,1);
  assert.equal(result.rows[0].name,'Faster');assert.equal(result.rows[0].gapSeconds,.5);
  assert.ok(result.rows[0].pace>100);assert.equal(result.rows.find(r=>r.isSelf).pace,100);
  assert.equal(I.eventComparison(me,[me],'100 Fly SCY','SCY'),null);
  assert.equal(I.eventComparison(me,[me,faster],'50 Free LCM','LCM').ahead,0);
});
test('yearly types isolate calendar years, course, and deduplicate history and bests',()=>{
  const motivational={};
  for(const stroke of ['breast','free','fly'])motivational['boys|11-12|100 '+stroke+' scy']={AAAA:'1:00.00'};
  const race=(stroke,time,date)=>({event:'100 '+stroke+' SCY',time,date,meet:'Test meet'});
  const old=race('breast','1:00.00','2024-05-10');
  const recent=race('fly','55.00','10/10/2025');
  const sw={id:'me',division:'boys',ageGroup:'12',timeHistory:[old,race('fly','1:20.00','May 11, 2024'),race('free','1:22.00','05/12/2024'),recent,race('breast','1:20.00','10/11/2025'),race('free','1:22.00','10/12/2025'),race('free','40.00','unknown'),{...recent,event:'100 Fly LCM'}],bestTimes:[old,recent]};
  const years=I.yearlyArchetypes(sw,'SCY',{motivational});
  assert.deepEqual(years.map(y=>y.year),[2025,2024]);
  assert.equal(years[0].label,'Specialized Butterfly');
  assert.equal(years[1].label,'Specialized Breaststroke');
  assert.equal(years[0].raceCount,3);assert.equal(years[1].raceCount,3);
  assert.equal(years[1].groups.find(g=>g.key==='fly').best.row.time,'1:20.00');
  assert.equal(I.yearlyArchetypes(sw,'SCM',{motivational}).length,0);
});
test('yearly coverage does not invent missing years or rate undated swims',()=>{
  const sw=swimmer('me','28.00');
  assert.equal(I.yearlyArchetypes(sw,'SCY',data).length,0);
  sw.timeHistory=[{event:'25 Free SCY',time:'15.00',date:'2023-05-01'}];
  const years=I.yearlyArchetypes(sw,'SCY',data);
  assert.equal(years.length,1);assert.equal(years[0].year,2023);assert.equal(years[0].provisional,true);
  assert.equal(years[0].groups.length,0);
});
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
