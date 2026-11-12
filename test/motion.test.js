const test=require('node:test');
const assert=require('node:assert/strict');
const createMotion=require('../motion');

test('celebrations are bounded, clean up their particles and respect reduced motion',async()=>{
  const pieces=[],finish=[];
  const document={body:{append(piece){pieces.push(piece);}},createElement(){return {style:{},setAttribute(){},remove(){this.removed=true;},animate(){return {finished:new Promise(resolve=>finish.push(resolve))};}};}};
  const anchor={getBoundingClientRect:()=>({left:20,top:30,width:80,height:36})};
  const motion=createMotion({document,matchMedia:()=>({matches:false})});
  assert.equal(motion.celebrate(anchor),true);assert.equal(pieces.length,14);
  assert.equal(motion.celebrate(anchor),false,'rapid clicks never stack particle bursts');
  finish.forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));
  assert.ok(pieces.every(piece=>piece.removed));
  assert.equal(motion.celebrate(anchor),true,'the control works again after cleanup');
  const calm=createMotion({document,matchMedia:()=>({matches:true})});
  assert.equal(calm.celebrate(anchor),false);
});
test('all twelve banner lanes have mixed strokes and appropriately sized sprites',()=>{
  const {bannerSwimmer,bannerSwimmerScale}=createMotion({});
  const swimmers=Array.from({length:12},(_,lane)=>bannerSwimmer(lane,0,100,true));
  assert.equal(new Set(swimmers.map(swimmer=>swimmer.lane)).size,12);
  assert.equal(new Set(swimmers.map(swimmer=>swimmer.stroke)).size,4);
  assert.equal(swimmers.filter(swimmer=>swimmer.female).length,6);
  assert.equal(swimmers.filter(swimmer=>swimmer.up).length,6);
  assert.ok(swimmers.every(swimmer=>swimmer.color&&swimmer.lane>.04&&swimmer.lane<.96));
  assert.ok(swimmers.every(swimmer=>swimmer.color==='#8cdcff'));
  assert.equal(bannerSwimmerScale(984),2);
  assert.equal(bannerSwimmerScale(1800),3);
  assert.equal(bannerSwimmerScale(360),1);
  assert.ok(swimmers.every(swimmer=>swimmer.duration<=5000));
  assert.notEqual(bannerSwimmer(0,1,200).stroke,swimmers[0].stroke);
});
test('breaststroke holds a long glide while butterfly cycles through wide recovery',()=>{
  const {bannerStrokePhase}=createMotion({});
  assert.equal(bannerStrokePhase('breast',600),0);
  assert.equal(bannerStrokePhase('breast',800),1);
  assert.equal(bannerStrokePhase('breast',1050),2);
  assert.equal(bannerStrokePhase('breast',1300),3);
  assert.equal(bannerStrokePhase('fly',600),2);
  assert.equal(bannerStrokePhase('fly',800),3);
});
test('stroke travel has distinct propulsion and recovery phases without changing average lap pace',()=>{
  const {bannerStrokePace}=createMotion({});
  assert.equal(bannerStrokePace('free',400),1);
  assert.equal(bannerStrokePace('back',700),1);
  assert.ok(bannerStrokePace('breast',100)<.2);
  assert.ok(bannerStrokePace('breast',1050)>2);
  assert.ok(bannerStrokePace('fly',250)<.3);
  assert.ok(bannerStrokePace('fly',500)>1.5);
  for(const [stroke,duration] of [['breast',1450],['fly',880]]){
    let total=0;for(let t=0;t<duration;t++)total+=bannerStrokePace(stroke,t);
    assert.ok(Math.abs(total/duration-1)<.01);
  }
});
test('each crossed lane rope weakens water equally in either direction',()=>{
  const {laneTransmission}=createMotion({});
  assert.equal(laneTransmission(.06,.1),1);
  assert.equal(laneTransmission(.06,.15),.62);
  assert.equal(laneTransmission(.06,.23),.62**2);
  assert.equal(laneTransmission(.23,.06),.62**2);
  assert.ok(laneTransmission(.01,.99)<.04);
});
test('water letter displacement is local, bounded and returns to rest',()=>{
  const motion=createMotion({});
  assert.deepEqual(motion.waterLetterTarget(100,100,0,null),{x:0,y:0});
  const nearby=motion.waterLetterTarget(120,110,2,{x:100,y:100});
  assert.ok(nearby.x>0&&nearby.y>0);
  assert.deepEqual(motion.waterLetterTarget(500,500,0,{x:100,y:100}),{x:0,y:0});
  const large=motion.waterLetterTarget(101,101,1000,{x:100,y:100});
  assert.ok(Math.abs(large.x)<=3&&Math.abs(large.y)<=4);
});
test('rope tension transfers movement between floats and keeps both ends anchored',()=>{
  const motion=createMotion({});
  const nodes=Array.from({length:33},()=>({x:0,v:0}));nodes[16].v=4;
  for(let i=0;i<20;i++)motion.stepWaterRope(nodes);
  assert.ok(Math.abs(nodes[12].x)>.1);
  assert.equal(nodes[0].x,0);assert.equal(nodes[32].x,0);
  for(let i=0;i<1800;i++)motion.stepWaterRope(nodes);
  assert.ok(nodes.every(node=>Math.abs(node.x)<.01&&Math.abs(node.v)<.01));
});
test('water canvas pauses when hidden and respects reduced motion',()=>{
  const listeners={},docListeners={};let preferenceChange;let next=0;const queued=new Map();
  let swimmerHeads=0;
  const ctx=new Proxy({fillRect(){swimmerHeads++;}},{get:(target,key)=>target[key]||(()=>{})});
  const canvas={getContext:()=>ctx,setAttribute(){}};
  const doc={hidden:false,createElement:()=>canvas,addEventListener:(name,fn)=>docListeners[name]=fn};
  const preferences={matches:false,addEventListener:(name,fn)=>preferenceChange=fn};
  const hero={prepend(){},classList:{add(){}},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:400}),addEventListener:(name,fn)=>listeners[name]=fn};
  const motion=createMotion({document:doc,matchMedia:()=>preferences,performance:{now:()=>100},requestAnimationFrame:fn=>{queued.set(++next,fn);return next;},cancelAnimationFrame:id=>queued.delete(id)});
  motion.waterLanes(hero);assert.equal(queued.size,1);
  const first=[...queued.values()][0];queued.clear();first(3000);
  assert.ok(swimmerHeads>0,'occasional swimmers render in the water');
  assert.equal(queued.size,1);
  listeners.pointermove({clientX:380,clientY:200,pointerType:'mouse'});
  doc.hidden=true;docListeners.visibilitychange();assert.equal(queued.size,0);
  doc.hidden=false;docListeners.visibilitychange();assert.equal(queued.size,1);
  preferences.matches=true;preferenceChange();assert.equal(queued.size,0);
  listeners.pointermove({clientX:400,clientY:200,pointerType:'mouse'});assert.equal(queued.size,0);
});
test('fluid input is press-and-drag only, with coalesced GPU splats',()=>{
  const handlers={},docHandlers={},queue=new Map(),splats=[];let next=0,now=100,samples=0;
  const ctx=new Proxy({},{get:(target,key)=>target[key]||(()=>{})});
  const doc={hidden:false,createElement:()=>({getContext:()=>ctx,setAttribute(){},remove(){}}),addEventListener:(name,fn)=>docHandlers[name]=fn};
  const hero={prepend(){},classList:{add(){}},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:400}),addEventListener:(name,fn)=>handlers[name]=fn};
  const fluid={resize(){},advance(){},clear(){},splat(...args){splats.push(args);},sampleRopes(){samples++;return new Float32Array(13*17).fill(60);}};
  const motion=createMotion({document:doc,LaneLineFluid:{create:()=>fluid},performance:{now:()=>now},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:fn=>{queue.set(++next,fn);return next;},cancelAnimationFrame:id=>queue.delete(id)});
  const flush=()=>{now+=40;const tasks=[...queue.values()];queue.clear();tasks.forEach(fn=>fn(now));};
  const move=x=>{now+=40;handlers.pointermove({clientX:x,clientY:200,pointerType:'mouse'});};
  motion.waterLanes(hero);move(200);flush();assert.equal(splats.length,0);
  handlers.pointerdown({button:0});move(210);move(240);flush();assert.equal(splats.length,1);
  assert.ok(splats[0][2]>0);
  assert.ok(samples>0,'active fluid velocity is sampled to drive the rope nodes');
  docHandlers.pointerup();move(300);flush();assert.equal(splats.length,1);
  handlers.pointerdown({button:2});move(320);flush();assert.equal(splats.length,1);
});
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
  const next=element();next.querySelectorAll=()=>[];
  motion.enter(next,-1);
  assert.equal(page.calls[1].cancelled,true);
});
test('growth motion only runs on selection changes and respects reduced motion',()=>{
  const preference={matches:false};
  const motion=createMotion({matchMedia:()=>preference});
  const marks=element(),scoreboard=element();
  const chart={querySelector:selector=>selector.includes('clip-path')?marks:scoreboard};
  motion.chart(chart,'swimmer/scy/50 free');
  motion.chart(chart,'swimmer/scy/50 free');
  assert.equal(marks.calls.length,1);
  assert.equal(scoreboard.calls.length,1);
  motion.chart(chart,'swimmer/scy/100 free');
  assert.equal(marks.calls[0].cancelled,true);
  preference.matches=true;
  motion.chart(chart,'swimmer/lcm/100 free');
  assert.equal(marks.calls.length,2);
});
test('the tab highlight retargets from its current position and stays still on layout updates',()=>{
  const tab=left=>({offsetLeft:left,offsetTop:0,offsetWidth:80,offsetHeight:40});
  let active=tab(0),left=0;
  const indicator={...element(),style:{},setAttribute(){},getBoundingClientRect:()=>({left,top:0,width:80,height:40})};
  const nav={querySelector:()=>active,prepend(){},classList:{add(){}},
    clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0})};
  const doc={readyState:'complete',documentElement:{classList:{toggle(){}}},addEventListener(){},
    querySelector:selector=>selector==='.page-tabs'?nav:null,createElement:()=>indicator};
  const motion=createMotion({document:doc});
  motion.init();
  assert.equal(indicator.calls.length,0);
  active=tab(80);
  motion.updateTab();
  left=45;active=tab(160);
  motion.updateTab();
  assert.equal(indicator.calls[0].cancelled,true);
  assert.equal(indicator.calls[1].frames[0].transform,'translate(-115px,0px) scale(1,1)');
  assert.equal(indicator.style.left,'160px');
  motion.updateTab();
  assert.equal(indicator.calls.length,2);
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
