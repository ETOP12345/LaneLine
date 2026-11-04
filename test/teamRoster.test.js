const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {importSnapshot} = require('../scripts/import-datahub-history');
const {centiseconds} = require('../standards-engine');

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

test('paced imports checkpoint only verified profiles and retain remaining candidates',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-queue-'));
  try{
    await fs.writeFile(path.join(directory,'datahub-history.json'),'{}');
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),'{"swimmers":{}}');
    const profile={name:'Test Swimmer',usaSwimmingMemberId:'ABCDEF01234567',ageGroup:'12',division:'girls',team:'Wave Aquatics'};
    const pending=[{...profile},{...profile,name:'Still Pending'}];
    await fs.writeFile(path.join(directory,'roster-import-progress.json'),JSON.stringify({pending}));
    await importSnapshot({profiles:[profile],events:['50 FR SCY'],meets:['Meet'],swimmers:{[profile.usaSwimmingMemberId]:[[0,'28.00',0,'10/04/2026']]}},directory);
    const progress=JSON.parse(await fs.readFile(path.join(directory,'roster-import-progress.json'),'utf8'));
    const roster=JSON.parse(await fs.readFile(path.join(directory,'swimmer-roster.json'),'utf8'));
    assert.equal(progress.status,'in-progress');assert.equal(progress.pending.length,1);
    assert.equal(progress.pending[0].name,'Still Pending');assert.equal(roster.pendingCandidates,1);
    assert.equal(roster.complete,false);assert.equal(roster.importStatus,'in-progress');
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('expanded PNS scope verifies ages 10-14, any PN team, and current-age A cuts',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-pns-'));
  try{
    await fs.writeFile(path.join(directory,'datahub-history.json'),'{}');
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),'{"swimmers":{}}');
    const profile={name:'PNS Test',usaSwimmingMemberId:'ABCDEF01234567',ageGroup:'14',division:'girls',team:'King Aquatic Club',lsc:'PN'};
    const snap={scope:'pns-a-10-14',profiles:[profile],events:['50 FR SCY'],meets:['Meet'],swimmers:{[profile.usaSwimmingMemberId]:[[0,'25.00',0,'10/04/2026']]}};
    await importSnapshot(snap,directory);
    const saved=JSON.parse(await fs.readFile(path.join(directory,'swimmer-roster.json'),'utf8'));
    assert.equal(saved.swimmers[0].lsc,'PN');assert.equal(saved.swimmers[0].ageGroup,'14');
    await assert.rejects(importSnapshot({...snap,profiles:[{...profile,lsc:'PC'}]},directory));
    await assert.rejects(importSnapshot({...snap,profiles:[{...profile,ageGroup:'15'}]},directory));
    await assert.rejects(importSnapshot({...snap,swimmers:{[profile.usaSwimmingMemberId]:[[0,'35.00',0,'10/04/2026']]}},directory),/A-or-faster/);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'))[profile.usaSwimmingMemberId].length,1);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
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
  const context={appState:{swimmers:[{id:'favorite',usaSwimmingMemberId:'one',timeHistory:[shared,manual]}]},swimmerFavorites:()=>new Set(['favorite']),sharedHistoryKeys:new Map([['one',new Set(['shared'])]]),timeHistoryKey:r=>r.key};
  vm.createContext(context);vm.runInContext(body,context);
  assert.equal(context.persistedSwimmers()[0].timeHistory.length,1);
  assert.equal(context.persistedSwimmers()[0].timeHistory[0].key,'manual');
  assert.equal(context.appState.swimmers[0].timeHistory.length,2);
});

test('published roster has valid unique identities and verified times',async()=>{
  const roster=JSON.parse(await fs.readFile(path.join(__dirname,'../swimmer-roster.json'),'utf8'));
  const histories=JSON.parse(await fs.readFile(path.join(__dirname,'../datahub-history.json'),'utf8'));
  assert.equal(new Set(roster.swimmers.map(s=>s.usaSwimmingMemberId)).size,roster.swimmers.length);
  for(const sw of roster.swimmers){
    assert.ok((sw.lsc==='PN'?['9','10','11','12','13','14']:['11','12']).includes(sw.ageGroup));
    if(sw.importMode==='best-times-only'){
      assert.ok(sw.bestTimes?.length>0,sw.name);
      assert.ok(sw.bestTimes.every(row=>centiseconds(row.time)>0),sw.name);
    }else{
      assert.ok(histories[sw.usaSwimmingMemberId]?.length>0,sw.name);
    }
    assert.ok(sw.lsc==='PN'||['Bellevue Club Swim Team','Wave Aquatics','Pacific Dragons Swim Team'].includes(sw.team));
  }
});
