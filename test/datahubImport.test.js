const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {importSnapshot,checkEligibility} = require('../scripts/import-datahub-history');
const standards=require('../standards-engine');
const standardsData=require('../time-standards.json');

test('A-only snapshot saves personal bests without manufacturing race history',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-bests-'));
  try{
    const id='ABCDEF12345678',profile={name:'Test Swimmer',ageGroup:'12',division:'boys',team:'Club',lsc:'PN',usaSwimmingMemberId:id};
    const cuts=standards.motivationalCuts(standardsData,'100 Free SCY',profile);
    assert.equal(checkEligibility({profile,bestTimes:[{event:'100 Free SCY',time:cuts.A}]}).importMode,'best-times-only');
    assert.equal(checkEligibility({profile,bestTimes:[{event:'100 Free SCY',time:cuts.AA}]}).importMode,'full-history');
    await fs.writeFile(path.join(directory,'datahub-history.json'),JSON.stringify({[id]:[{event:'50 Free SCY',time:'30.00',date:'2026-01-01',meet:'Previous'}]}));
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),'{"swimmers":{}}');
    const snapshot={scope:'pns-a-10-14',bestTimesOnly:true,events:['100 FR SCY'],meets:[],swimmers:{[id]:[[0,cuts.A]]},profiles:[profile]};
    await importSnapshot(snapshot,directory);
    const roster=JSON.parse(await fs.readFile(path.join(directory,'swimmer-roster.json'),'utf8'));
    assert.equal(roster.swimmers[0].bestTimes[0].time,cuts.A);
    assert.equal(roster.swimmers[0].bestTimes[0].date,undefined);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'))[id].length,1);
    await assert.rejects(importSnapshot({...snapshot,swimmers:{[id]:[[0,cuts.AA]]}},directory),/below AA/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('younger PNS scope accepts age nine, preserves older queue, and rejects age eleven', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-younger-'));
  try {
    await fs.writeFile(path.join(directory,'datahub-history.json'),'{}');
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),'{"swimmers":{}}');
    await fs.writeFile(path.join(directory,'pns-a-import-progress.json'),'{"pending":[]}');
    const id='AAAAAAAAAAAAAA';
    const snapshot={scope:'pns-a-9-10',events:['50 FR SCY'],meets:['Verified meet'],
      swimmers:{[id]:[[0,'25.00',0,'10/20/2026']]},
      profiles:[{name:'Test Swimmer',ageGroup:'9',division:'boys',team:'Test Club',lsc:'PN',usaSwimmingMemberId:id}],
      discovery:{status:'in-progress',pending:[],pages:[],screened:[]}};
    assert.equal((await importSnapshot(snapshot,directory))[id].addedRows,1);
    const younger=JSON.parse(await fs.readFile(path.join(directory,'pns-a-9-10-import-progress.json'),'utf8'));
    assert.equal(younger.scope,'pns-a-9-10');
    assert.equal(await fs.readFile(path.join(directory,'pns-a-import-progress.json'),'utf8'),'{"pending":[]}');
    await assert.rejects(importSnapshot({...snapshot,profiles:[{...snapshot.profiles[0],ageGroup:'11'}]},directory));
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('verified import preserves history, deduplicates, and records manual status', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-import-'));
  try {
    await fs.writeFile(path.join(directory,'datahub-history.json'),JSON.stringify({ethan:[]}));
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),JSON.stringify({swimmers:{}}));
    const snapshot={events:['50 BR SCY','400 FR SCM'],meets:['Fall Invite'],swimmers:{ethan:[[0,'30.91',0,'10/25/2026'],[1,'4:49.92',0,'10/18/2026']]}};
    assert.equal((await importSnapshot(snapshot,directory)).ethan.addedRows,2);
    assert.equal((await importSnapshot(snapshot,directory)).ethan.addedRows,0);
    const saved=JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'));
    assert.equal(saved.ethan[0].event,'50 Breast SCY');
    assert.equal(saved.ethan[1].course,'SCM');
    const status=JSON.parse(await fs.readFile(path.join(directory,'datahub-refresh-status.json'),'utf8'));
    assert.equal(status.swimmers.ethan.status,'manual');
    const before=JSON.stringify(saved);
    await assert.rejects(importSnapshot({...snapshot,swimmers:{unknown:snapshot.swimmers.ethan}},directory));
    assert.equal(JSON.stringify(JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'))),before);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
