const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {importSnapshot} = require('../scripts/import-datahub-history');

test('new verified profiles are added by member ID and age-out profiles rejected',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-roster-'));
  try {
    await fs.writeFile(path.join(directory,'datahub-history.json'),'{}');
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),'{"swimmers":{}}');
    const id='ABCDEF01234567';
    const profile={name:'Alex Wang',usaSwimmingMemberId:id,ageGroup:'12',division:'boys',team:'Wave Aquatics'};
    const snapshot={profiles:[profile],events:['50 FR SCY'],meets:['Fall Meet'],swimmers:{[id]:[[0,'25.00',0,'10/04/2026']]}};
    await importSnapshot(snapshot,directory);
    const roster=JSON.parse(await fs.readFile(path.join(directory,'swimmer-roster.json'),'utf8'));
    assert.equal(roster.swimmers[0].usaSwimmingMemberId,id);
    assert.equal(roster.complete,false);
    await assert.rejects(importSnapshot({...snapshot,profiles:[{...profile,ageGroup:'13'}]},directory));
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('same-name swimmers with separate member IDs are not combined',async()=>{
  const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  const body=html.slice(html.indexOf('function seedUsaSwimmingProfile('),html.indexOf('async function refreshSeededSwimmersFromUsaSwimming('));
  const existing={id:'old',name:'Alex Wang',team:'Bellevue Club Swim Team',usaSwimmingMemberId:'first',bestTimes:[]};
  const context={appState:{swimmers:[existing]},mergeBestTimeRows:(a,b)=>a.concat(b),mergeTimeHistoryRows:(a,b)=>a.concat(b)};
  vm.createContext(context);vm.runInContext(body,context);
  context.seedUsaSwimmingProfile({id:'new',name:'Alex Wang',team:'Wave Aquatics',usaSwimmingMemberId:'second',bestTimes:[]});
  assert.equal(context.appState.swimmers.length,2);
  assert.equal(context.appState.swimmers[0].usaSwimmingMemberId,'first');
});

test('shared history is not duplicated in browser storage but manual history stays',async()=>{
  const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  const body=html.slice(html.indexOf('function persistedSwimmers('),html.indexOf('const ethanWangUsaSwimmingProfile'));
  const shared={key:'shared'},manual={key:'manual'};
  const context={appState:{swimmers:[{usaSwimmingMemberId:'one',timeHistory:[shared,manual]}]},sharedHistoryKeys:new Map([['one',new Set(['shared'])]]),timeHistoryKey:r=>r.key};
  vm.createContext(context);vm.runInContext(body,context);
  assert.equal(context.persistedSwimmers()[0].timeHistory.length,1);
  assert.equal(context.persistedSwimmers()[0].timeHistory[0].key,'manual');
  assert.equal(context.appState.swimmers[0].timeHistory.length,2);
});

test('published roster has valid unique identities and race history',async()=>{
  const roster=JSON.parse(await fs.readFile(path.join(__dirname,'../swimmer-roster.json'),'utf8'));
  const histories=JSON.parse(await fs.readFile(path.join(__dirname,'../datahub-history.json'),'utf8'));
  assert.equal(new Set(roster.swimmers.map(s=>s.usaSwimmingMemberId)).size,roster.swimmers.length);
  for(const sw of roster.swimmers){
    assert.ok(['11','12'].includes(sw.ageGroup));
    assert.ok(histories[sw.usaSwimmingMemberId].length>0);
    assert.ok(['Bellevue Club Swim Team','Wave Aquatics','Pacific Dragons Swim Team'].includes(sw.team));
  }
});
