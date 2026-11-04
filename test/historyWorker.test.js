const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('history worker batches parsed data and skips unchanged versions',async()=>{
  const messages=[];let parsed=0,version='first';
  const histories=Object.fromEntries(Array.from({length:25},(_,i)=>[String(i),[{event:'50 Free SCY',time:'30.00'}]]));
  const context=vm.createContext({self:{postMessage:message=>messages.push(message)},fetch:async()=>({ok:true,headers:{get:name=>name==='etag'?version:null},json:async()=>{parsed++;return histories;}}),setTimeout:fn=>fn()});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../history-worker.js'),'utf8'),context);
  await context.self.onmessage({data:{type:'refresh'}});
  assert.equal(parsed,1);assert.equal(messages.filter(m=>m.type==='batch').length,3);
  assert.equal(messages.filter(m=>m.type==='batch').flatMap(m=>m.entries).length,25);
  messages.length=0;await context.self.onmessage({data:{type:'refresh'}});
  assert.equal(parsed,1);assert.equal(messages.length,1);assert.equal(messages[0].unchanged,true);
  version='updated';await context.self.onmessage({data:{type:'refresh'}});assert.equal(parsed,2);
});
test('best-row caches invalidate when imported times are replaced',()=>{
  const insights=require('../insights-engine');
  const swimmer={bestTimes:[{event:'50 Free SCY',time:'30.00'}]};
  const first=insights.bestRows(swimmer,'SCY');
  assert.equal(insights.bestRows(swimmer,'SCY'),first);
  swimmer.bestTimes=[{event:'50 Free SCY',time:'29.00'}];
  assert.notEqual(insights.bestRows(swimmer,'SCY'),first);
  assert.equal(insights.bestRows(swimmer,'SCY')[0].time,'29.00');
});
test('focus refreshes share one job and are throttled for a minute',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  let now=100000,calls=0,finish;
  const context=vm.createContext({Date:{now:()=>now},Map,Promise,refreshSharedSwimmerCache(){calls++;return new Promise(resolve=>{finish=resolve;});}});
  vm.runInContext(html.slice(html.indexOf('let historyRefreshJob='),html.indexOf('async function refreshSharedSwimmerCache()')),context);
  const first=context.refreshSeededSwimmersFromDataHubCache();
  assert.equal(context.refreshSeededSwimmersFromDataHubCache(),first);assert.equal(calls,1);
  finish();await first;
  await context.refreshSeededSwimmersFromDataHubCache();assert.equal(calls,1);
  now+=61000;const second=context.refreshSeededSwimmersFromDataHubCache();assert.equal(calls,2);finish();await second;
});
