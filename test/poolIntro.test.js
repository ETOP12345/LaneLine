const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {lapPose,poolTransition,cameraAtProgress,snapDestination,fullLaneSwimmers}=require('../pool-intro')({});

test('large-screen rendering has a bounded pixel budget without changing aspect ratio',()=>{
  const {canvasScale}=require('../pool-intro')({});
  for(const [width,height,dpr] of [[3840,2160,2],[1920,1080,1.5],[1440,900,2],[390,844,3]]){
    const scale=canvasScale(width,height,dpr);
    assert.ok(width*scale<=1600&&height*scale<=1000);
    assert.ok(scale<=dpr&&scale>0);
    assert.ok(Math.abs((width*scale)/(height*scale)-width/height)<.000001);
  }
  assert.ok(canvasScale(1920,1080,2)**2/1.25**2<.5,'large displays draw less than half the prior pixels');
});

test('water moves nearby letters and swimmers, weakens across lanes, and settles',()=>{
  const {waterDrift}=require('../pool-intro')({});
  const impulse={x:500,y:300,dx:40,dy:20,time:100};
  const near=waterDrift(510,310,1000,800,null,impulse,120);
  const far=waterDrift(850,310,1000,800,null,impulse,120);
  const settled=waterDrift(510,310,1000,800,null,impulse,10100);
  assert.ok(near.x>0&&Math.abs(near.y)>0);
  assert.ok(Math.abs(far.x)<near.x);
  assert.ok(Math.abs(settled.x)<.01&&Math.abs(settled.y)<.01);
  const flow=Array(13*17).fill(1000),strong=waterDrift(500,300,1000,800,flow,impulse,120);
  assert.ok(Math.abs(strong.x)<=6&&Math.abs(strong.y)<=5);
});

test('fullscreen restores exactly two swimmers in every lane',()=>{
  const lanes=new Map();
  for(const swimmer of fullLaneSwimmers())lanes.set(swimmer.laneIndex,(lanes.get(swimmer.laneIndex)||0)+1);
  assert.equal(lanes.size,18);assert.ok([...lanes.values()].every(count=>count===2));
});

test('magnetic settling picks the nearest end without pulling normal app scrolling',()=>{
  assert.equal(snapDestination(100,720),0);
  assert.equal(snapDestination(359,720),0);
  assert.equal(snapDestination(360,720),720);
  assert.equal(snapDestination(600,720),720);
  for(const y of [0,.5,719.5,720,1000])assert.equal(snapDestination(y,720),null);
  assert.equal(snapDestination(100,0),null);
  assert.equal(snapDestination(100,240,true),240,'a small upward scroll stays in the banner');
  assert.equal(snapDestination(60,240,true),0,'a deliberate upward scroll returns to fullscreen');
  assert.equal(snapDestination(100,240,false),0,'forward snapping keeps its earlier threshold');
});

test('camera follows scroll reversibly with uniform scale and no fading',()=>{
  const rect={left:0,right:1200,top:56,bottom:376,width:1200,height:320};
  assert.equal(cameraAtProgress(0,rect,1200,800).transform,'translate(0px,0px) scale(1)');
  const half=cameraAtProgress(.5,rect,1200,800);
  assert.equal(half.transform,'translate(-150px,-192px) scale(1.25)');
  assert.equal(half.clipPath,'inset(0px 0px 0px 0px)','pool ends remain in the wide frame during the camera move');
  assert.equal(half.opacity,undefined);
  assert.deepEqual(cameraAtProgress(.5,rect,1200,800),half);
  assert.equal(cameraAtProgress(1,rect,1200,800).transform,poolTransition(rect,1200,800).transform);
  assert.equal(cameraAtProgress(1,rect,1200,800).clipPath,'inset(56px 0px 424px 0px)');
  assert.equal(cameraAtProgress(-2,rect,1200,800).zoom,1);
  assert.equal(cameraAtProgress(2,rect,1200,800).zoom,1.5);
});

test('native scroll drives entry but fullscreen can only reopen with its button',()=>{
  let now=0,nextFrame=0,draws=0,painted=0,fluidCreated=0,spacer,splats=0;
  const frames=new Map(),events={},layers=[],ctx=new Proxy({},{get:(_,key)=>key==='clearRect'?()=>{draws++;painted=0;}:key==='save'?()=>painted++:()=>{}});
  const scene={style:{},prepend(){},getBoundingClientRect(){return {left:0,top:0};}},copy={style:{}},button={style:{},events:{},addEventListener(type,fn){this.events[type]=fn;}};
  const reopenButton={events:{},addEventListener(type,fn){this.events[type]=fn;}};
  const layer={style:{},events:{},setAttribute(){},querySelector(selector){return selector==='canvas'?{getContext:()=>ctx}:selector==='button'?button:selector==='.pool-reopen'?reopenButton:selector==='.pool-intro-copy'?copy:scene;},addEventListener(type,fn){this.events[type]=fn;}};
  const hero={children:[],dataset:{},before(element){spacer=element;},append(element){this.layer=element;},querySelector(selector){return selector==='.hero-logo'?{outerHTML:'<div class="hero-logo">LaneLine</div>'}:selector==='h1'?{innerHTML:'LaneLine'}:{textContent:'Swim'};},getBoundingClientRect(){const top=56+parseFloat(spacer?.style.height||0)-env.scrollY;return {top,bottom:top+294,left:0,right:1000,width:1000,height:294};}};
  const doc={hidden:false,body:{style:{overflow:''},append(element){layers.push(element);}},querySelector:()=>hero,addEventListener(){},createElement(tag){return tag==='section'?layer:{style:{},setAttribute(){},remove(){}};}};
  const env={document:doc,innerWidth:1000,innerHeight:800,scrollY:0,performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);},addEventListener(type,fn){events[type]=fn;},scrollTo(options){this.scrollY=options.top;events.scroll();},LaneLineFluid:{createDeferred(surface,ready){fluidCreated++;ready({resize(){},splat(){splats++;},advance(){}});}}};
  env.LaneLineMotion=require('../motion')(env);
  function step(){const pending=[...frames];frames.clear();now+=20;for(const [,fn] of pending)fn(now);}
  const intro=require('../pool-intro')(env);intro.init();
  assert.equal(layers.length,1);assert.equal(fluidCreated,1);assert.equal(doc.body.style.overflow,'');
  assert.equal(events.wheel,undefined,'native scrolling is not intercepted');
  assert.equal(painted,36,'fullscreen has two swimmers per lane');
  const mouse={button:0,pointerType:'mouse',clientX:500,clientY:300,target:{closest:()=>null}};
  layer.events.pointerdown(mouse);layer.events.pointermove({...mouse,clientX:530,clientY:320});step();
  assert.equal(splats,1,'dragging still feeds the fluid simulation');
  layer.events.pointerup();layer.events.pointermove({...mouse,clientX:550});step();
  assert.equal(splats,1,'hovering does not trigger fluid splats');
  const distance=parseFloat(spacer.style.height);
  assert.equal(distance,240,'the faster transition uses a short scroll distance');
  env.scrollY=distance/2;events.scroll();step();
  const midway=scene.style.transform,before=draws;
  for(let i=0;i<5;i++)step();
  assert.equal(scene.style.transform,midway,'camera stops exactly where scrolling stops');
  assert.ok(draws>before,'water and swimmers remain live while camera is paused');
  env.scrollY=distance;events.scroll();step();assert.equal(hero.layer,layer);
  assert.equal(spacer.style.height,'0px','entry scroll runway is removed after entering the app');
  const bannerCamera=scene.style.transform;
  for(let i=0;i<600;i++)step();
  assert.ok(painted<=3,'small banner returns to the sparse swimmer setting');
  env.scrollY=distance/2;events.scroll();step();assert.equal(scene.style.transform,bannerCamera);
  env.scrollY=0;events.scroll();events.scrollend();step();assert.equal(scene.style.transform,bannerCamera,'scrolling to the top cannot reopen fullscreen');
  assert.equal(reopenButton.hidden,false);
  reopenButton.events.click();step();assert.equal(scene.style.transform,'translate(0px,0px) scale(1)');
  assert.equal(layers[1],layer,'explicit reopening keeps the same scene');
  for(let i=0;i<3;i++)step();
  assert.equal(painted,36,'returning to fullscreen restores two swimmers per lane');
  assert.equal(fluidCreated,1);
  env.scrollY=distance*.3;events.scrollend();step();assert.equal(env.scrollY,0,'scroll release snaps back to the opening');
  env.scrollY=distance*.7;events.scrollend();step();assert.equal(hero.layer,layer,'scroll release snaps into the banner');
});

test('swimmers turn at both walls and remain inside the pool',()=>{
  for(let time=0;time<120;time+=.013){const pose=lapPose(time,14,.23);assert.ok(pose.position>=0&&pose.position<=1);assert.ok(Number.isFinite(pose.angle));}
  assert.equal(lapPose(.2,1).side,1);assert.equal(lapPose(.7,1).side,-1);
  assert.equal(lapPose(.46,1).position,1);assert.equal(lapPose(.96,1).position,0);
});

test('turns touch, tuck, push off, and carry a streamline into the next length',()=>{
  const touch=lapPose(.43,1,0,'breast'),tuck=lapPose(.46,1,0,'free'),push=lapPose(.485,1,0,'free');
  assert.equal(touch.turnStage,'touch');assert.equal(touch.turnStyle,'open');
  assert.equal(tuck.turnStage,'tuck');assert.equal(tuck.turnStyle,'flip');assert.ok(tuck.tuck>.8);
  assert.equal(lapPose(.46,1,0,'fly').turnStyle,'open');
  assert.equal(lapPose(.46,1,0,'back').turnStyle,'flip');
  assert.equal(push.turnStage,'push');assert.ok(push.position<1);assert.equal(push.streamline,true);
  assert.equal(lapPose(.51,1).streamline,true);
  assert.ok(Math.abs(lapPose(.5-1e-7,1).position-lapPose(.5+1e-7,1).position)<.00001);
});

test('scroll camera is packaged without timed camera animations or scroll locks',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../pool-intro.js'),'utf8');
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/deploy-laneline.yml'),'utf8');
  assert.match(workflow,/pool-intro.js/);
  assert.doesNotMatch(source,/\.animate\(|preventDefault\(|overflow='hidden'/);
  assert.match(source,/drawBannerSwimmer/);
});
