const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../standards-engine');
const data=require('../time-standards.json');
const meet=id=>data.meets.find(m=>m.id===id);
const girls={division:'girls',ageGroup:'12'};
const boys={division:'boys',ageGroup:'12'};

test('official PNS girls and boys cuts are independent of motivational B',()=>{
  assert.equal(engine.meetCut(meet('pns-champs'),'100 Breast SCY',girls),'1:20.89');
  assert.equal(engine.meetCut(meet('pns-champs'),'100 Breast SCY',boys),'1:20.19');
  assert.equal(engine.motivationalCuts(data,'100 Breast SCY',girls).B,'1:36.49');
  assert.equal(engine.meetCut(meet('pns-champs'),'100 IM LCM',girls),null);
});
test('regional cuts use single age and remain reference-only',()=>{
  assert.equal(engine.meetCut(meet('regionals'),'50 Free SCY',{...girls,ageGroup:'11'}),'29.39');
  assert.equal(engine.meetCut(meet('regionals'),'50 Free SCY',girls),'27.79');
  assert.equal(engine.meetCut(meet('regionals'),'50 Free SCY',{...girls,ageGroup:'11-12'}),null);
  assert.equal(meet('regionals').reference,true);
});
test('girls national tables cover every age group and supported course',()=>{
  assert.equal(Object.keys(data.motivational).length,446);
  for(const age of ['10','11','12','13','14','15','16','17','18']) {
    for(const course of ['SCY','LCM','SCM']) assert.ok(engine.motivationalCuts(data,'50 Free '+course,{...girls,ageGroup:age}));
  }
  assert.equal(engine.motivationalCuts(data,'50 Free SCY',girls).AAAA,'25.79');
});
test('current Washington Open and Spring Sectionals are correctly transcribed',()=>{
  assert.equal(engine.meetCut(meet('washington-open'),'200 Breast SCY',boys),'2:24.00');
  assert.equal(engine.meetCut(meet('washington-open'),'200 Free SCY',boys),'1:52.50');
  assert.equal(engine.meetCut(meet('washington-open'),'1500 Free LCM',boys),'18:40.00');
  assert.equal(engine.meetCut(meet('sectionals'),'50 Free SCY',girls),'24.99');
  assert.equal(engine.meetCut(meet('sectionals'),'1650 Free SCY',girls),'18:19.78');
  assert.equal(engine.meetCut(meet('sectionals'),'100 Breast SCY',boys),'1:01.53');
});
test('every applicable tier has exact nonnegative drop and met status',()=>{
  const targets=engine.targets(data,{event:'50 Breast SCY',time:'30.91'},boys);
  assert.equal(targets.find(t=>t.id==='washington-open').dropSeconds,0.41);
  assert.equal(targets.find(t=>t.id==='futures').dropSeconds,4.62);
  assert.equal(targets.find(t=>t.id==='nat-AAAA').met,true);
  assert.equal(engine.nextTarget(data,{event:'50 Breast SCY',time:'30.91'},boys).id,'washington-open');
  const exact=engine.targets(data,{event:'200 Breast SCY',time:'2:24.00'},boys).find(t=>t.id==='washington-open');
  assert.equal(exact.met,true);assert.equal(exact.dropSeconds,0);
  const one=engine.targets(data,{event:'200 Breast SCY',time:'2:24.01'},boys).find(t=>t.id==='washington-open');
  assert.equal(one.dropSeconds,0.01);
});
test('distance courses, unavailable events, and age limits do not invent cuts',()=>{
  assert.equal(engine.meetCut(meet('futures'),'500 Free SCY',girls),'5:02.59');
  assert.equal(engine.meetCut(meet('futures'),'400 Free LCM',girls),'4:28.79');
  assert.equal(engine.meetCut(meet('futures'),'500 Free LCM',girls),null);
  assert.equal(engine.meetCut(meet('futures'),'100 IM SCY',girls),null);
  assert.equal(engine.meetCut(meet('futures'),'100 Free SCM',girls),null);
  assert.equal(engine.meetCut(meet('futures'),'100 Free SCY',{...girls,ageGroup:'19'}),null);
  assert.equal(engine.meetCut(meet('pns-champs'),'100 Free SCY',{...girls,ageGroup:'15'}),null);
  assert.equal(engine.targets(data,{event:'50 Free SCY',time:'DQ'},girls).some(t=>t.met),false);
});
test('all published data contain valid times and motivational levels tighten monotonically',()=>{
  for(const m of data.meets)for(const value of Object.values(m.cuts))assert.ok(Number.isFinite(engine.centiseconds(value)),m.id+' '+value);
  for(const cuts of Object.values(data.motivational)){
    const values=['B','BB','A','AA','AAA','AAAA'].map(k=>engine.centiseconds(cuts[k]));
    assert.ok(values.every((n,i)=>Number.isFinite(n)&&(!i||n<values[i-1])));
  }
});
