const test=require('node:test');
const assert=require('node:assert/strict');
const createTraining=require('../training-games');
function fixture(){
  let now=0;const saved=new Map();
  const env={performance:{now:()=>now},Math:{random:()=>.4},localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}};
  return {env,api:createTraining(env),saved,time:value=>{now=value;}};
}
test('quiz uses five unique questions, locks answers, and keeps the completed best',()=>{
  const {api,saved}=fixture(),quiz=api.createQuiz();
  assert.equal(quiz.getState().total,5);quiz.next();assert.equal(quiz.getState().index,0);
  const seen=new Set();
  for(let i=0;i<5;i++){
    const state=quiz.getState();seen.add(state.question.prompt);
    quiz.answer(99);assert.equal(quiz.getState().chosen,null);
    quiz.answer(state.question.answer);quiz.answer((state.question.answer+1)%4);
    assert.equal(quiz.getState().score,i+1);quiz.next();
  }
  assert.equal(seen.size,5);assert.equal(quiz.getState().complete,true);assert.equal(quiz.getState().best,5);
  assert.equal(api.createQuiz().getState().best,5);assert.ok(saved.has('laneline-training-quiz'));
});
test('quiz options match supported facts and each question has exactly one valid answer',()=>{
  const {api}=fixture();
  for(const q of api.questions){assert.equal(q.options.length,4);assert.ok(q.answer>=0&&q.answer<4);assert.ok(q.explanation);}
  assert.equal(api.questions.find(q=>q.prompt.includes('opens an individual')).options[1],'Butterfly');
  assert.equal(api.questions.find(q=>q.prompt.includes('opens a medley')).options[2],'Backstroke');
});

test('Split Sprint generates exact, distinct answers and stores its score separately',()=>{
  const {api,saved}=fixture(),game=api.createSplits();
  const prompts=new Set();
  for(let i=0;i<5;i++){
    const q=game.getState().question;prompts.add(q.prompt);
    assert.equal(new Set(q.options).size,4);assert.equal(q.options[q.answer],api.timeText(q.answerCs));
    assert.ok(Number.isInteger(q.answerCs)&&q.answerCs>0);game.answer(q.answer);game.next();
  }
  assert.equal(prompts.size,5);assert.equal(game.getState().score,5);
  assert.ok(saved.has('laneline-training-splits'));assert.equal(saved.has('laneline-training-quiz'),false);
  assert.equal(api.timeText(13000),'2:10.00');assert.equal(api.timeText(3250),'32.50');
});

test('Medley Builder always starts scrambled and records both correct stroke orders',()=>{
  const {api,saved}=fixture(),game=api.createMedley();
  for(const [mode,target] of [['im',['Butterfly','Backstroke','Breaststroke','Freestyle']],['relay',['Backstroke','Breaststroke','Butterfly','Freestyle']]]){
    game.setMode(mode);assert.equal(game.getState().solved,false);assert.notDeepEqual(game.getState().order,target);
    const before=game.getState();game.move(-1,1);game.move(0,-1);game.move(0,2);game.setMode('__proto__');assert.deepEqual(game.getState(),before);
    for(let i=0;i<4;i++){
      let current=game.getState().order.indexOf(target[i]);
      while(current>i){game.move(current,-1);current--;}
    }
    assert.deepEqual(game.getState().order,target);assert.equal(game.getState().solved,true);assert.ok(game.getState().best>0);
    const moves=game.getState().moves;game.move(0,1);assert.equal(game.getState().moves,moves,'completed puzzles cannot be scored twice');
  }
  const records=JSON.parse(saved.get('laneline-training-medley'));assert.ok(records.im>0&&records.relay>0);
});
test('pace clock reports early/late error and keeps separate bests by target',()=>{
  const f=fixture(),pace=f.api.createPace();pace.press();f.time(5200);pace.press();
  assert.equal(pace.getState().last.error,200);assert.equal(pace.getState().best,200);
  pace.press();f.time(10100);pace.press();assert.equal(pace.getState().last.error,-100);assert.equal(pace.getState().best,100);
  pace.setTarget(3);assert.equal(pace.getState().best,null);pace.press();f.time(13100);pace.press();assert.equal(pace.getState().best,0);
  pace.setTarget(5);assert.equal(pace.getState().best,100);pace.setTarget(0);assert.equal(pace.getState().target,5);
  const restored=f.api.createPace();
  assert.equal(restored.getState().best,100);
  assert.deepEqual(restored.getState().recent,[-100,200]);
  restored.setTarget(3);assert.deepEqual(restored.getState().recent,[0]);
});

test('pace clock accepts custom decimal intervals, remembers them, and rejects invalid changes',()=>{
  const f=fixture(),pace=f.api.createPace();
  assert.equal(pace.setTarget('7.5'),true);pace.press();assert.equal(pace.setTarget(5),false,'running targets stay locked');
  f.time(7520);pace.press();assert.equal(pace.getState().best,20);
  for(const value of [0,.4,120.1,1.23,Infinity,'bad',''])assert.equal(pace.setTarget(value),false);
  assert.equal(f.api.createPace().getState().target,7.5);assert.equal(f.api.createPace().getState().best,20);
  pace.setTarget(120);pace.press();f.time(127520);pace.press();assert.equal(pace.getState().best,0);
  pace.setTarget(7.5);assert.equal(pace.getState().best,20);
});

test('custom pace settings preserve scores from the original preset format',()=>{
  const f=fixture();f.saved.set('laneline-training-pace',JSON.stringify({3:120,5:80,10:160}));
  const pace=f.api.createPace();assert.equal(pace.getState().best,80);
  pace.setTarget(3);assert.equal(pace.getState().best,120);
  assert.equal(f.api.createPace().getState().target,3);
});
test('timed practice can be cancelled without recording a score and blocked storage is harmless',()=>{
  const f=fixture();f.env.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  const api=createTraining(f.env),pace=api.createPace();pace.press();f.time(1000);pace.reset();
  assert.equal(pace.getState().last,null);assert.equal(pace.getState().best,null);
  assert.doesNotThrow(()=>api.createQuiz());pace.press();f.time(6000);assert.doesNotThrow(()=>pace.press());
});
test('flip turn scores both inputs and saves the best without scoring misses',()=>{
  const f=fixture(),turn=f.api.createTurn();
  turn.press();f.time(100);turn.press();
  assert.deepEqual(turn.getState().miss,{stage:'approach',reason:'early'});
  turn.press();f.time(1600);assert.equal(turn.getState().cue,true);turn.press();
  assert.equal(turn.getState().tuck,0);
  f.time(2299);assert.equal(turn.getState().cue,false,'the swimmer has more time to tuck before the push cue');
  f.time(2300);assert.equal(turn.getState().cue,true);
  f.time(2450);turn.press();
  assert.equal(turn.getState().phase,'pushOff');assert.equal(turn.getState().score,100);
  assert.equal(f.api.createTurn().getState().best,100);
  turn.reset();turn.press();f.time(4050);turn.press();f.time(5000);turn.press();
  assert.equal(turn.getState().tuck,100);assert.equal(turn.getState().push,100);
  assert.equal(turn.getState().score,44);assert.equal(turn.getState().best,100);
});
test('flip turn expires a missed cue and cancels pending frames on reset',()=>{
  const f=fixture(),frames=new Map();let id=0;
  f.env.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
  f.env.cancelAnimationFrame=key=>frames.delete(key);
  const turn=f.api.createTurn();
  turn.press();f.time(1500);turn.press();
  const advance=now=>{f.time(now);const tick=[...frames.values()][0];frames.clear();tick(now);};
  advance(2501);
  assert.deepEqual(turn.getState().miss,{stage:'flip',reason:'late'});
  assert.equal(turn.getState().best,null);
  turn.press();assert.equal(frames.size,1);turn.reset();
  assert.equal(turn.getState().phase,'idle');assert.equal(frames.size,0);
  turn.press();f.time(4001);turn.press();f.time(4851);turn.press();
  advance(5551);assert.equal(turn.getState().phase,'pushOff');
  advance(5751);assert.equal(turn.getState().phase,'result');assert.equal(frames.size,0);
});
test('training panels switch accessibly and reset active timers',()=>{
  const f=fixture(),nodes=new Map(),docEvents={};let reactionResets=0;
  function node(id){return {id,style:{},dataset:{},events:{},children:[],attributes:{},textContent:'',checkValidity:()=>true,reportValidity(){},addEventListener(type,fn){this.events[type]=fn;},setAttribute(key,value){this.attributes[key]=value;},replaceChildren(){this.children=[];},append(child){this.children.push(child);},focus(){this.focused=true;}};}
  function get(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);}
  const tabs=['reaction','quiz','pace','splits','medley','turn'].map(name=>{const tab=node(name);tab.dataset.trainingView=name;return tab;});
  f.env.document={getElementById:get,createElement:()=>node('answer'),querySelectorAll:()=>tabs,addEventListener(type,fn){docEvents[type]=fn;},hidden:false};
  f.env.addEventListener=()=>{};f.env.LaneLineReaction={reset(){reactionResets++;}};
  const api=createTraining(f.env);assert.doesNotThrow(()=>api.init());
  assert.equal(get('training-quiz').hidden,true);tabs[1].events.click();assert.equal(get('training-quiz').hidden,false);
  assert.equal(get('quiz-options').children.length,4);get('quiz-options').children[0].events.click();
  assert.ok(get('quiz-options').children.every(button=>button.disabled));assert.equal(get('quiz-next').disabled,false);
  tabs[1].events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(get('training-pace').hidden,false);assert.equal(tabs[2].focused,true);
  const [short]=get('pace-presets').children;short.events.click();assert.equal(get('pace-target').value,'3');assert.equal(short.attributes['aria-pressed'],'true');
  get('pace-pad').events.click();assert.equal(get('pace-pad').textContent,'Stop');tabs[0].events.click();assert.equal(get('pace-pad').textContent,'Start');assert.ok(reactionResets>0);
  tabs[3].events.click();assert.equal(get('training-splits').hidden,false);assert.equal(get('splits-options').children.length,4);
  tabs[4].events.click();assert.equal(get('training-medley').hidden,false);assert.equal(get('medley-order').children.length,4);
  tabs[4].events.keydown({key:'End',preventDefault(){}});assert.equal(get('training-turn').hidden,false);
  get('turn-pad').events.click();assert.equal(get('turn-pad').textContent,'Tuck');
  tabs[0].events.click();assert.equal(get('turn-pad').textContent,'Begin');
});
