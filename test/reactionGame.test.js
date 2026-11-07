const test=require('node:test');
const assert=require('node:assert/strict');
const factory=require('../reaction-game');
function fixture(storage){
  let now=0,next=0;
  const timers=new Map(),frames=new Map(),states=[];
  const env={performance:{now:()=>now},Math:{random:()=>.5},setTimeout(fn,delay){timers.set(++next,{fn,delay});return next;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);}};
  const game=factory(env).create(state=>states.push(state),storage);
  return {game,states,timers,frames,setTime(value){now=value;},go(){const item=[...timers.values()][0];assert.ok(item.delay>=1400);timers.clear();item.fn();const fn=[...frames.values()][0];frames.clear();fn();}};
}
test('reaction challenge waits for a painted signal and records a result',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const f=fixture(storage);f.game.press();assert.equal(f.game.getState().phase,'waiting');
  f.setTime(2500);f.go();assert.equal(f.game.getState().phase,'go');
  f.setTime(2734);f.game.press();assert.equal(f.game.getState().last,234);assert.equal(f.game.getState().best,234);
  assert.equal(fixture(storage).game.getState().best,234);
  const restored=fixture(storage).game;
  assert.equal(restored.replayScore(),234);
  assert.deepEqual(restored.getState().attempts,[234],'replay does not record another attempt');
  restored.press();assert.equal(restored.replayScore(),null,'replay cannot interrupt a live start');
});
test('early presses are false starts and never write a score',()=>{
  const f=fixture();f.game.press();f.game.press();
  assert.equal(f.game.getState().phase,'falseStart');assert.equal(f.game.getState().best,null);assert.equal(f.timers.size,0);
});
test('leaving the challenge cancels pending signal callbacks',()=>{
  const f=fixture();f.game.press();const callback=[...f.timers.values()][0].fn;f.game.reset();callback();
  assert.equal(f.game.getState().phase,'idle');assert.equal(f.frames.size,0);
});
test('recent attempts stay bounded and reset clears only reaction results',()=>{
  const removed=[],storage={getItem:()=>null,setItem(){},removeItem:key=>removed.push(key)};
  const f=fixture(storage);
  for(let i=0;i<7;i++){f.game.press();f.setTime(10000*i);f.go();f.setTime(10000*i+200+i);f.game.press();}
  assert.equal(f.game.getState().attempts.length,5);assert.equal(f.game.getState().best,200);
  f.game.clear();assert.equal(f.game.getState().best,null);assert.deepEqual(f.game.getState().attempts,[]);assert.deepEqual(removed,['laneline-reaction-results']);
});
test('malformed or unavailable storage never breaks the challenge',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  const f=fixture(storage);f.game.press();f.setTime(3000);f.go();f.setTime(3250);assert.doesNotThrow(()=>f.game.press());assert.equal(f.game.getState().last,250);
});
