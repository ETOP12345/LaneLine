const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { refresh, mergeRows } = require('../scripts/refresh-swimmer-history');
const {fetchUsaSwimmingTimeHistory}=require('../server');
test('history lookup does not try alternate course requests after a rate limit',async()=>{
  let calls=0;
  await assert.rejects(fetchUsaSwimmingTimeHistory('ABCDEF01234567',async()=>{calls++;throw Object.assign(Error('Too many requests'),{status:429});}),/Too many/);
  assert.equal(calls,1);
});

const row = {event:'100 Free SCY',time:'58.84',date:'10/04/2026',meet:'2026 PN CSC Fall Classic',source:'USA Swimming',course:'SCY'};
test('history keeps older swims, includes both courses, and deduplicates', () => {
  const older = {...row,time:'1:03.94',date:'11/23/2025'};
  const lcm = {...row,event:'100 Free LCM',course:'LCM',time:'1:10.19'};
  assert.equal(mergeRows([older,row], [row,lcm]).length, 3);
  assert.throws(() => mergeRows([older], []));
  assert.throws(() => mergeRows([older], [{...row,time:'DQ'}]));
});
test('failed access preserves history and last successful check', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'laneline-refresh-'));
  try {
    await fs.writeFile(path.join(directory,'datahub-history.json'),JSON.stringify({ethan:[row]}));
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),JSON.stringify({swimmers:{ethan:{lastSuccessAt:'2026-10-08'}}}));
    assert.equal(await refresh({directory,fetchHistory:async()=>{throw new Error('403');}}),1);
    const history = JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'));
    assert.deepEqual(history.ethan,[row]);
    const status = JSON.parse(await fs.readFile(path.join(directory,'datahub-refresh-status.json'),'utf8'));
    assert.equal(status.swimmers.ethan.lastSuccessAt,'2026-10-08');
    assert.equal(status.status,'failed');
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
test('successful refresh adds latest swim to the published cache', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'laneline-refresh-'));
  try {
    await fs.writeFile(path.join(directory,'datahub-history.json'),JSON.stringify({ethan:[{...row,time:'1:03.94',date:'11/23/2025'}]}));
    assert.equal(await refresh({directory,fetchHistory:async()=>[row]}),0);
    const history = JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'));
    assert.equal(history.ethan[0].time,'58.84');
    assert.equal(history.ethan.length,2);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
test('refresh spaces swimmers and stops requests on an upstream rate limit',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-paced-'));
  try{
    await fs.writeFile(path.join(directory,'datahub-history.json'),JSON.stringify({a:[row],b:[row],c:[row]}));
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),JSON.stringify({swimmers:{c:{lastImportedAt:'2026-10-01'}}}));
    const calls=[],pauses=[];
    await refresh({directory,requestDelayMs:15000,pause:async ms=>pauses.push(ms),fetchHistory:async id=>{calls.push(id);if(id==='b')throw Error('HTTP 429');return[row];}});
    assert.deepEqual(calls,['a','b']);assert.deepEqual(pauses,[15000]);
    const status=JSON.parse(await fs.readFile(path.join(directory,'datahub-refresh-status.json'),'utf8'));
    assert.equal(status.swimmers.c.status,'deferred');assert.equal(status.swimmers.c.lastImportedAt,'2026-10-01');
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8')).c.length,1);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('best times includes history results and does not match undefined IDs', async () => {
  const html = await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  const body = html.slice(html.indexOf('async function refreshSwimmerBestTimes('),html.indexOf('function mergeBestTimeRows('));
  const a = {id:'a',usaSwimmingMemberId:'first',bestTimes:[]};
  const b = {id:'b',usaSwimmingMemberId:'second',bestTimes:[]};
  const document = {getElementById:()=>null};
  const context = {appState:{swimmers:[a,b]},document,console,
    fetch:async url=>({ok:true,json:async()=>url.includes('time-history')?{timeHistory:[row]}:{bestTimes:[]}}),
    mergeTimeHistoryRows:(a,b)=>a.concat(b),mergeBestTimeRows:(a,b)=>a.concat(b),
    saveState(){},refreshOpenInsights(){},renderProfilesPage(){},renderBestTimesPicker(){},renderGrowthPickers(){},renderBestTimes(){},renderGrowthPage(){}};
  vm.createContext(context);
  vm.runInContext(body,context);
  await context.refreshSwimmerBestTimes({usaSwimmingMemberId:'second'});
  assert.equal(a.bestTimes.length,0);
  assert.equal(b.bestTimes[0].time,'58.84');
});
test('browser refresh stops on access limits without requesting best-time fallback',async()=>{
  const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  const body=html.slice(html.indexOf('async function refreshSwimmerBestTimes('),html.indexOf('function mergeBestTimeRows('));
  const sw={id:'a',usaSwimmingMemberId:'one',bestTimes:[row]};let requests=0;
  const context={appState:{swimmers:[sw]},fetch:async()=>{requests++;return{ok:false,status:429};},console};
  vm.createContext(context);vm.runInContext(body,context);
  assert.equal(await context.refreshSwimmerBestTimes(sw),'blocked');assert.equal(requests,1);assert.equal(sw.bestTimes.length,1);
});
test('authoritative rows correct screenshot history and best metadata', async () => {
  const html = await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  const body = html.slice(html.indexOf('function mergeBestTimeRows('), html.indexOf('// \u2500\u2500\u2500 INIT'));
  const context = {normalizeEventKey:s=>s.toLowerCase(),parseRaceTime:s=>Number(s),parseGrowthDate:s=>new Date(s)};
  vm.createContext(context);
  vm.runInContext(body,context);
  const screenshot = {...row,source:'Meet Mobile',meet:'CSC Cascade Fall Classic'};
  assert.equal(context.mergeTimeHistoryRows([screenshot],[row]).length,1);
  assert.equal(context.mergeBestTimeRows([screenshot],[row])[0].source,'USA Swimming');
});
