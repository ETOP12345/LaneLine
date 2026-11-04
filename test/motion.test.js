const test=require('node:test');
const assert=require('node:assert/strict');
const createMotion=require('../motion');
function element(){
  const calls=[];
  return {calls,dataset:{},isConnected:true,getClientRects:()=>[{}],animate(frames,options){
    const record={frames,options,cancelled:false};calls.push(record);
    return {finished:new Promise(()=>{}),cancel(){record.cancelled=true;}};
  }};
}
test('page motion is directional, quick and interruptible',()=>{
  const motion=createMotion({matchMedia:()=>({matches:false})});
  const page=element();page.querySelectorAll=()=>[];
  motion.enter(page,-1);
  assert.equal(page.calls[0].frames[0].transform,'translateX(-14px)');
  assert.equal(page.calls[0].options.duration,260);
  motion.enter(page,1);
  assert.equal(page.calls[0].cancelled,true);
  assert.equal(page.calls[1].frames[0].transform,'translateX(14px)');
});
test('reduced motion performs no animations',()=>{
  const motion=createMotion({matchMedia:()=>({matches:true})});
  const page=element();page.querySelectorAll=()=>[];
  motion.enter(page);motion.dialog(page);motion.reveal(page);
  assert.equal(page.calls.length,0);
});
test('reveals never animate hidden pages or queue hundreds of entrance effects',()=>{
  const motion=createMotion({matchMedia:()=>({matches:false})});
  const items=Array.from({length:300},element);
  items[0].getClientRects=()=>[];
  const root={querySelectorAll:()=>items};motion.reveal(root);
  assert.equal(items[0].calls.length,0);
  assert.equal(items.filter(x=>x.calls.length).length,11);
  assert.ok(items.every(x=>!x.calls.length||x.calls[0].options.delay<=90));
  motion.reveal(root);assert.ok(items.every(x=>x.calls.length<=1));
});
test('observer entrances are bounded for large rosters and reserve staggered frames',()=>{
  let observed=[];let callback;
  const doc={readyState:'complete',hidden:false,documentElement:{classList:{toggle(){}}},querySelector:()=>null,addEventListener(){}};
  const motion=createMotion({document:doc,matchMedia:()=>({matches:false}),IntersectionObserver:class{
    constructor(fn){callback=fn;}observe(item){observed.push(item);}unobserve(){}
  }});
  motion.init();
  const items=Array.from({length:500},element);
  motion.reveal({querySelectorAll:()=>items});
  assert.equal(observed.length,36);
  callback([{isIntersecting:true,target:items[0]}]);
  assert.equal(items[0].calls[0].options.fill,'backwards');
  assert.equal(items[0].calls[0].options.duration,460);
});
