const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../favorite-refresh');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(refresh){const favorites=new Set(['a']),saved=new Map();const store={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};const manager=create({storage:store,isFavorite:id=>favorites.has(id),getSwimmer:id=>({id}),refresh,delayMs:0});return {manager,favorites,saved};}
test('static swimmers are never checked; a favorite requests just one check',async()=>{
  const calls=[],f=fixture(async sw=>{calls.push(sw.id);return 'updated';});f.manager.resume();await tick();assert.deepEqual(calls,[]);f.manager.request('b');await tick();assert.deepEqual(calls,[]);
  f.manager.request('a');f.manager.request('a');await tick();assert.deepEqual(calls,['a']);assert.equal(f.manager.status('a').status,'updated');
});
test('unfavoriting cancels inflight work and removes its local queue record',async()=>{
  let release,signal;const f=fixture((_sw,s)=>{signal=s;return new Promise(r=>release=r);});f.manager.request('a');await tick();f.favorites.delete('a');f.manager.remove('a');assert.equal(signal.aborted,true);release('updated');await tick();assert.equal(f.manager.status('a'),null);
});
test('blocked checks wait for the signed-in browser and only newer imports satisfy them',async()=>{
  const f=fixture(async()=> 'blocked');f.manager.request('a');await tick();assert.equal(f.manager.status('a').status,'waiting');f.manager.reconcile('a','2020-01-01');assert.equal(f.manager.status('a').status,'waiting');f.manager.reconcile('a',new Date(Date.now()+1000).toISOString());assert.equal(f.manager.status('a').status,'updated');
});
