const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function fixture(value){
  const saved=new Map([['laneline-favorite-swimmers',value]]);
  const context=vm.createContext({localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},saveState(){},appState:{user:null},renderProfilesPage(){},alert(){}});
  vm.runInContext(html.slice(html.indexOf("let rosterScope='favorites'"),html.indexOf('function renderProfilesPage()')),context);
  return {context,saved};
}
test('favorites always include Ethan and persist IDs without copying swimmer data',()=>{
  const {context,saved}=fixture(null);
  assert.equal(context.swimmerFavorites().has('usas_9DCE8A4B52EF4A'),true);
  context.toggleSwimmerFavorite('ethan');
  assert.deepEqual(JSON.parse(saved.get('laneline-favorite-swimmers')),['usas_9DCE8A4B52EF4A','ethan']);
  assert.equal(context.swimmerFavorites().has('ethan'),true);
  context.toggleSwimmerFavorite('ethan');
  assert.equal(saved.get('laneline-favorite-swimmers'),'["usas_9DCE8A4B52EF4A"]');
  context.toggleSwimmerFavorite('usas_9DCE8A4B52EF4A');
  assert.equal(context.swimmerFavorites().has('usas_9DCE8A4B52EF4A'),true);
});
test('malformed favorites recover safely',()=>{
  for(const input of ['oops','{}','null'])assert.equal(fixture(input).context.swimmerFavorites().size,1);
  assert.deepEqual([...fixture('["a",12,"a"]').context.swimmerFavorites()],['usas_9DCE8A4B52EF4A','a']);
});
test('local storage migrates to favorites only without filtering the in-memory comparison roster',()=>{
  const swimmers=[{id:'favorite',name:'Favorite',bestTimes:[{time:'25.00'}]},{id:'other',name:'Other',bestTimes:[{time:'26.00'}]}];
  const saved=new Map([
    ['laneline-favorite-swimmers','["favorite"]'],
    ['laneline_state',JSON.stringify({swimmers})],
    ['ll_swimmers_old-account',JSON.stringify(swimmers)]
  ]);
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),key:i=>[...saved.keys()][i],get length(){return saved.size;}};
  const context=vm.createContext({localStorage:storage,renderProfilesPage(){},alert(message){throw Error(message);}});
  vm.runInContext(html.slice(html.indexOf('let appState ='),html.indexOf('const ethanWangUsaSwimmingProfile')),context);
  vm.runInContext(html.slice(html.indexOf("let rosterScope='favorites'"),html.indexOf('function renderProfilesPage()')),context);
  vm.runInContext('loadState();saveState();',context);
  assert.deepEqual(JSON.parse(saved.get('laneline_state')).swimmers.map(s=>s.id),['favorite']);
  assert.deepEqual(JSON.parse(saved.get('ll_swimmers_old-account')).map(s=>s.id),['favorite']);
  // Shared roster hydration stays in memory, but never spills back into storage.
  context.sharedSwimmers=swimmers;
  vm.runInContext('appState.swimmers=sharedSwimmers;saveState();',context);
  assert.equal(vm.runInContext('appState.swimmers.length',context),2);
  assert.equal(JSON.parse(saved.get('laneline_state')).swimmers.length,1);
  context.toggleSwimmerFavorite('favorite');
  assert.equal(JSON.parse(saved.get('laneline_state')).swimmers.length,0);
  assert.equal(JSON.parse(saved.get('ll_swimmers_old-account')).length,0);
  assert.equal(vm.runInContext('appState.swimmers.length',context),2);
  context.toggleSwimmerFavorite('other');
  assert.deepEqual(JSON.parse(saved.get('laneline_state')).swimmers.map(s=>s.id),['other']);
});
