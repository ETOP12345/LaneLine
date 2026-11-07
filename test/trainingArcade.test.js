const test=require('node:test');
const assert=require('node:assert/strict');
const create=require('../training-arcade');
function fixture(reduced=false){
  let now=0,next=0,audioContexts=0;
  const panels=new Map(),frames=new Map(),events={},tones=[],saved=new Map();
  for(const name of ['reaction','quiz','pace','splits','medley','turn'])panels.set('training-'+name,{prepend(canvas){this.canvas=canvas;}});
  const sound={events:{},addEventListener(type,fn){this.events[type]=fn;}};
  const doc={hidden:false,getElementById(id){if(id==='training-page')return {style:{display:'block'}};if(id==='training-sound')return sound;return panels.get(id);},addEventListener(type,fn){events[type]=fn;},createElement(){
    const pixels=new Uint32Array(512*192),texts=[];
    let transform=[1,0,0,1,0,0];const stack=[];
    const ctx={fillStyle:'#000000',fillText(text){texts.push(text);},setTransform(scale,b,c,vertical){assert.ok(scale===2||scale===3);assert.equal(vertical,scale);transform=[1,0,0,1,0,0];},save(){stack.push(transform);},restore(){transform=stack.pop();},transform(...matrix){transform=matrix;},fillRect(x,y,w,h){
      const color=parseInt(this.fillStyle.slice(1),16),[a,b,c,d,e,f]=transform;
      for(let row=Math.floor(y);row<y+h;row++)for(let col=Math.floor(x);col<x+w;col++){
        const sx=Math.round(a*col+c*row+e),sy=Math.round(b*col+d*row+f);
        if(sx>=0&&sx<512&&sy>=0&&sy<192)pixels[sy*512+sx]=color;
      }
    }};
    return {attributes:{},events:{},pixels,texts,setAttribute(key,value){this.attributes[key]=value;},addEventListener(type,fn){this.events[type]=fn;},getContext:()=>ctx};
  }};
  class AudioContext{
    constructor(){audioContexts++;this.state='suspended';this.currentTime=0;this.destination={};}
    resume(){this.state='running';return Promise.resolve();}
    suspend(){this.state='suspended';return Promise.resolve();}
    createOscillator(){return {frequency:{setValueAtTime(value){tones.push(value);},linearRampToValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const env={document:doc,AudioContext,performance:{now:()=>now},matchMedia:()=>({matches:reduced}),localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);}};
  const arcade=create(env);arcade.init();
  return {arcade,panels,frames,events,doc,tones,saved,contexts:()=>audioContexts,advance(value){now=value;const pending=[...frames];frames.clear();for(const [,fn]of pending)fn(now);}};
}
function swimmerFront(canvas,lane){
  const skin=[0xc58963,0xedbb93,0x905c48,0xd59a74][lane];
  let left=Infinity;
  for(let row=34;row<174;row++)for(let x=0;x<512;x++)if(canvas.pixels[row*512+x]===skin)left=Math.min(left,x);
  return left;
}
test('all activities render labeled pixel art, with occupied lanes in the race scenes',()=>{
  const f=fixture();
  for(const [id,panel] of f.panels){
    const canvas=panel.canvas,rate=['training-reaction','training-turn'].includes(id)?3:2;
    assert.equal(canvas.width,512*rate);assert.equal(canvas.height,192*rate);
    const colors=new Set(canvas.pixels);assert.ok(colors.size>=7);
    if(!['training-quiz','training-pace','training-turn'].includes(id)){
      for(let lane=0;lane<4;lane++)assert.ok(Number.isFinite(swimmerFront(canvas,lane)),'each lane has a swimmer sprite');
    }
    assert.equal(canvas.attributes.role,'img');assert.ok(canvas.attributes['aria-label']);
  }
});
test('flip turn shows planted feet and then moves away from the wall',()=>{
  const f=fixture(),canvas=f.panels.get('training-turn').canvas;
  assert.ok(canvas.texts.includes('2'),'the turn wall has a lane marker');
  assert.equal(canvas.pixels[52*512+358],0xd29878,'the close-up opens with a shaded lead hand extended left');
  assert.equal(canvas.pixels[52*512+380],0x15334c,'the opening swimmer has visible goggles');
  f.arcade.draw('turn',{phase:'flip',cue:true,progress:.85,windowStart:.61,windowTarget:.81},0);
  assert.ok(canvas.texts.includes('PUSH NOW'));
  assert.equal(canvas.pixels[92*512+62],0xedbb93,'the near foot touches the wall');
  assert.equal(canvas.pixels[85*512+62],0xb17962,'the far foot plants alongside it');
  f.arcade.draw('turn',{phase:'pushOff',progress:.06},0);
  assert.ok(swimmerFront(canvas,1)<65,'the feet stay at the wall while the legs begin to extend');
  f.arcade.draw('turn',{phase:'pushOff',progress:.5},0);
  assert.ok(canvas.texts.includes('STREAMLINE'));
  assert.ok(swimmerFront(canvas,1)>150);
});
test('flip turn carries the same swimmer silhouette from the last stroke into the tuck',()=>{
  const f=fixture(),canvas=f.panels.get('training-turn').canvas;
  const sprite=()=>Array.from(canvas.pixels, (pixel,index)=>
    [0xedbb93,0xb17962,0xffe0bc,0x9ee7ff].includes(pixel)?index:-1).filter(index=>index>=0);
  const windowTarget=1500/1720,progress=1340/1720;
  f.arcade.draw('turn',{phase:'approach',progress,windowTarget,windowStart:1280/1720,cue:true},0);
  const before=sprite();
  f.arcade.draw('turn',{phase:'flip',progress:0,entry:progress,approachTarget:windowTarget,windowStart:.7,windowTarget:.85},0);
  assert.deepEqual(sprite(),before);
  f.arcade.draw('turn',{phase:'miss',progress:.5,miss:{stage:'approach',reason:'late'},missAt:1,approachTarget:windowTarget},0);
  assert.ok(canvas.pixels.includes(0xffe0a3),'a late tuck shows a wall impact');
  f.arcade.draw('turn',{phase:'miss',progress:.8,miss:{stage:'flip',reason:'late'}},0);
  assert.ok(swimmerFront(canvas,1)<100,'a missed push stays at the wall');
});
test('reaction frames the starting blocks close up and launches swimmers down and left',()=>{
  const f=fixture(),canvas=f.panels.get('training-reaction').canvas;
  assert.ok(swimmerFront(canvas,3)-swimmerFront(canvas,0)>85,'starting blocks recede across the lanes');
  assert.equal(canvas.pixels[173*512+256],0xa6bdc9,'only a narrow strip of near deck is visible');
  assert.equal(canvas.pixels[41*512+371],0x142f55,'goggles are on the left edge of the side profile');
  assert.equal(canvas.pixels[35*512+376],0xe4f6fa,'the ready pose has a cap highlight');
  assert.equal(canvas.pixels[76*512+466],0x142f55,'the nearest swimmer appears larger and still faces left');
  assert.equal(canvas.pixels[145*512+472],0xd59a74,'the near swimmer stands on the starting block');
  assert.equal(canvas.pixels[146*512+472],0xedf6f7,'the platform starts directly beneath their feet');
  assert.equal(canvas.pixels[55*512+305],0xedf6f7,'the starter stands on the far deck left of lane 1');
  f.arcade.update('reaction',{phase:'waiting'});f.advance(200);
  const playerOnBlock=swimmerFront(canvas,1);
  assert.equal(canvas.pixels[99*512+396],0xedbb93,'the player grips the front of the block in the set pose');
  assert.equal(canvas.pixels[41*512+290],0xa6eddd,'the starter raises the signal');
  assert.equal(canvas.pixels[46*512+270],0xffd36a,'the poolside light is amber on Set');
  f.arcade.update('reaction',{phase:'go'});f.advance(300);
  assert.equal(canvas.pixels[53*512+270],0x8ef4c2,'the poolside light turns green on Go');
  f.advance(600);
  assert.equal(canvas.pixels[63*512+285],0xc58963,'stacked hands extend down and left of the body');
  assert.equal(canvas.pixels[40*512+359],0xc58963,'trailing toes are higher and to the right');
  assert.ok(Math.abs(swimmerFront(canvas,1)-playerOnBlock)<=4,'the camera waits on lane 2 while rivals dive');
  const opponentBeforeReaction=swimmerFront(canvas,0);
  assert.ok(opponentBeforeReaction<350);
  f.arcade.update('reaction',{phase:'result',last:400});
  assert.equal(swimmerFront(canvas,0),opponentBeforeReaction,'the camera does not jump when the player reacts');
  const playerAtReaction=swimmerFront(canvas,1);
  f.advance(800);
  assert.ok(swimmerFront(canvas,1)<playerAtReaction);
  f.advance(1360);
  assert.ok(canvas.pixels.slice(112*512+270,112*512+330).includes(0xa5e6f3),'lane 2 splashes down in frame');
  assert.equal(swimmerFront(canvas,1),Infinity,'lane 2 does not begin a swim after the dive');
  f.advance(2000);
  for(let lane=0;lane<4;lane++)assert.equal(swimmerFront(canvas,lane),Infinity,'no lane swims after entry');
  assert.equal(f.frames.size,0);
});
test('reaction keeps lane 2 framed even after a late start',()=>{
  const f=fixture(),canvas=f.panels.get('training-reaction').canvas;
  f.arcade.update('reaction',{phase:'go'});f.advance(900);
  const onBlock=swimmerFront(canvas,1);
  assert.ok(onBlock>380&&onBlock<440);
  f.arcade.update('reaction',{phase:'result',last:900});
  for(let now=900;now<1648;now+=120){
    f.advance(now);
    const playerX=swimmerFront(canvas,1);
    assert.ok(playerX>230&&playerX<=onBlock,'lane 2 stays in frame throughout the dive');
  }
});
test('pace clock hides elapsed time and shows the error marker after stopping',()=>{
  const f=fixture(),canvas=f.panels.get('training-pace').canvas;f.arcade.select('pace');
  const last={elapsed:5100,error:100};
  f.arcade.update('pace',{phase:'running',target:5,last});const pixels=canvas.pixels.slice();
  f.advance(700);assert.deepEqual(canvas.pixels,pixels);
  assert.ok(canvas.texts.includes('CLOCK HIDDEN'));assert.ok(!canvas.texts.includes('5.10s'));
  f.arcade.update('pace',{phase:'result',target:5,last});
  assert.ok(canvas.texts.includes('5.10s'));
  f.advance(1400);
  assert.equal(canvas.pixels[130*512+262],0xffaf84,'the marker moves to the late side of the target');
});
test('the redesigned scenes reflect quiz answers, split progress, and medley order',()=>{
  const f=fixture(),state={index:0,score:1,chosen:1,question:{answer:1}};
  f.arcade.select('quiz');f.arcade.update('quiz',state);
  assert.ok(f.panels.get('training-quiz').canvas.texts.includes('CORRECT'));
  f.arcade.update('quiz',{...state,chosen:0,score:0});
  assert.ok(f.panels.get('training-quiz').canvas.texts.includes('MISSED'));
  f.arcade.select('splits');f.arcade.update('splits',state);
  const splits=f.panels.get('training-splits').canvas,start=swimmerFront(splits,1);
  f.advance(750);assert.ok(swimmerFront(splits,1)<start);
  assert.ok(splits.texts.includes('1 / 5 CHECKPOINTS'));
  f.arcade.update('splits',{...state,index:1,chosen:0});
  const stalled=swimmerFront(splits,1);
  f.advance(1200);assert.equal(swimmerFront(splits,1),stalled);
  assert.ok(splits.texts.includes('MISSED CHECKPOINT'));
  f.arcade.select('medley');f.arcade.update('medley',{mode:'relay',order:['Backstroke','Breaststroke','Butterfly','Freestyle'],solved:true,moves:3});
  const medley=f.panels.get('training-medley').canvas;
  assert.ok(medley.texts.includes('1 BACKSTROKE'));
  assert.ok(medley.texts.includes('MEDLEY COMPLETE'));
});
test('start sound is user-unlocked, plays once on Go, and obeys mute',()=>{
  const f=fixture();assert.equal(f.contexts(),0);
  f.arcade.update('reaction',{phase:'waiting'});f.arcade.update('reaction',{phase:'go'});assert.equal(f.tones.length,0);
  f.arcade.unlockAudio();assert.equal(f.contexts(),1);
  f.arcade.update('reaction',{phase:'waiting'});f.arcade.update('reaction',{phase:'go'});assert.deepEqual(f.tones,[880]);
  f.arcade.update('reaction',{phase:'go'});assert.equal(f.tones.length,1);
  f.arcade.setMuted(true);f.arcade.cue('go');assert.equal(f.tones.length,1);assert.equal(f.saved.get('laneline-arcade-muted'),'true');
});
test('reaction has distinct cue states and animates through the splash',()=>{
  const f=fixture();f.arcade.update('reaction',{phase:'waiting'});assert.ok(f.panels.get('training-reaction').canvas.texts.includes('SET'));
  const canvas=f.panels.get('training-reaction').canvas,onBlock=swimmerFront(canvas,1);
  f.arcade.update('reaction',{phase:'falseStart'});assert.ok(f.panels.get('training-reaction').canvas.texts.includes('FALSE START'));
  assert.equal(f.panels.get('training-reaction').canvas.pixels[39*512+270],0xff7c75,'the poolside light signals a false start in red');
  f.advance(420);assert.ok(swimmerFront(canvas,1)<onBlock);
  assert.ok(swimmerFront(canvas,0)>350&&swimmerFront(canvas,2)>420,'only the player dives on a false start');
  f.arcade.update('reaction',{phase:'result',last:234});assert.ok(f.frames.size>0);
  f.advance(1520);assert.ok(f.frames.size>0);
  f.advance(1820);assert.equal(f.frames.size,0);
  f.arcade.refresh();f.doc.hidden=true;f.events.visibilitychange();assert.equal(f.frames.size,0);
});
test('reduced motion uses static scenes without losing the visual start cue',()=>{
  const f=fixture(true);f.arcade.update('reaction',{phase:'go'});
  assert.equal(f.frames.size,0);assert.ok(f.panels.get('training-reaction').canvas.texts.includes('GO!'));
});
