const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {lapPose}=require('../pool-intro')({});

test('pool handoff moves and resizes the same surface without fading',()=>{
  const {poolTransition}=require('../pool-intro')({});
  const frame=poolTransition({left:0,top:56,width:1200,height:320},1200,800);
  assert.equal(frame.transform,'translate(-300px,-384px) scale(1.5)');
  assert.equal(frame.opacity,undefined);
  const source=fs.readFileSync(path.join(__dirname,'../pool-intro.js'),'utf8');
  assert.doesNotMatch(source,/pool-intro-copy'\)\.animate\(\[\{opacity/);
});

test('zoom stays live and scroll-up reuses one scene and one fluid context',async()=>{
  let now=0,layers=[],disposed=0,draws=0,nextFrame=0,paintedSwimmers=0;
  const frames=new Map(),animations=[],preference={matches:false};
  function animate(){let resolve;const finished=new Promise(done=>{resolve=done;});const result={finished,resolve,cancel(){}};animations.push(result);return result;}
  const windowEvents={},documentEvents={},ctx=new Proxy({},{get:(_,key)=>key==='clearRect'?()=>{draws++;paintedSwimmers=0;}:key==='save'?()=>paintedSwimmers++:()=>{}});
  const hero={inert:false,tagName:'DIV',dataset:{},children:[],append(layer){this.layer=layer;},querySelector(selector){return selector==='.hero-logo'?{outerHTML:'<div class="hero-logo">LaneLine</div>'}:selector==='h1'?{innerHTML:'LaneLine'}:{textContent:'Swim'};},getBoundingClientRect(){return {top:56,right:1000,bottom:350,left:0,width:1000,height:294};}};
  const doc={hidden:false,activeElement:{tagName:'BODY'},body:{children:[hero],style:{overflow:''},append(layer){layers.push(layer);}},querySelector(){return hero;},getElementById(){return {focus(){}};},addEventListener(type,fn){documentEvents[type]=fn;},removeEventListener(){},createElement(tag){
    if(tag==='canvas')return {setAttribute(){},remove(){}};
    const button={events:{},style:{},focus(){},addEventListener(type,fn){this.events[type]=fn;}};
    const canvas={getContext(){return ctx;}};
    return {events:{},style:{},button,animate,setAttribute(){},removeAttribute(){},prepend(){},remove(){this.removed=true;},querySelector(selector){return selector==='canvas'?canvas:selector==='button'?button:{style:{},prepend(){},animate};},addEventListener(type,fn){this.events[type]=fn;}};
  }};
  const env={document:doc,innerWidth:1000,innerHeight:800,scrollY:0,performance:{now:()=>now},matchMedia:()=>preference,requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);},scrollTo(){},addEventListener(type,fn){windowEvents[type]=fn;},removeEventListener(){},LaneLineFluid:{createDeferred(surface,ready){ready({resize(){},dispose(){disposed++;}});}}};
  const intro=require('../pool-intro')(env);
  intro.init();assert.equal(layers.length,1);assert.equal(hero.inert,true);
  const first=layers[0];
  const exiting=layers[0].button.events.click(),before=draws;
  assert.equal(frames.size,1,'camera movement must not cancel the live pool frame');
  const [id,tick]=frames.entries().next().value;frames.delete(id);now=20;tick(now);
  assert.ok(draws>before,'the pool continues drawing during the zoom');
  assert.equal(frames.size,1,'the next pool frame remains scheduled');
  animations.forEach(animation=>animation.resolve());await exiting;
  assert.equal(disposed,0);assert.equal(hero.layer,first);assert.equal(hero.inert,false);assert.equal(doc.body.style.overflow,'');
  assert.ok(paintedSwimmers>3,'existing swimmers are not deleted at the camera handoff');
  for(let step=0;step<200;step++){
    const [id,tick]=frames.entries().next().value;frames.delete(id);now+=100;tick(now);
  }
  assert.ok(paintedSwimmers>=1&&paintedSwimmers<=3,'after existing swimmers leave, the banner returns to 2-3 swimmers');
  preference.matches=true;
  now+=2000;env.scrollY=100;windowEvents.wheel({deltaY:-30,preventDefault(){}});assert.equal(layers.length,1);
  env.scrollY=0;windowEvents.wheel({deltaY:-30,preventDefault(){}});assert.equal(layers.length,2);assert.equal(layers[1],first);
  layers[1].button.events.click();assert.equal(disposed,0);assert.equal(hero.layer,first);
});

test('opening pool keeps swimmers within the walls through full laps',()=>{
  for(let time=0;time<120;time+=.013){
    const pose=lapPose(time,14,.23);
    assert.ok(pose.position>=0&&pose.position<=1);
    assert.ok(pose.side>=-1&&pose.side<=1);
    assert.ok(Number.isFinite(pose.angle));
  }
});
test('swimmers turn at both walls and change sides for the return length',()=>{
  const down=lapPose(.2,1),bottom=lapPose(.46,1),up=lapPose(.7,1),top=lapPose(.96,1);
  assert.equal(down.side,1);assert.equal(up.side,-1);
  assert.equal(bottom.position,1);assert.equal(top.position,0);
  assert.ok(bottom.turn>.99);assert.ok(top.turn>.99);
  assert.ok(Math.abs(bottom.angle-Math.PI*1.5)<.0001);
});
test('opening pool is separate and its script is available in deployments',()=>{
  const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../performance.css'),'utf8');
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/deploy-laneline.yml'),'utf8');
  assert.match(index,/src="pool-intro.js"/);
  assert.match(workflow,/pool-intro.js/);
  assert.doesNotMatch(css,/\.hero\{min-height:calc\(100/);
  assert.doesNotMatch(index,/class="hero-enter"/);
});
