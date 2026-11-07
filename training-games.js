(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else{root.LaneLineTraining=factory(root);root.LaneLineTraining.init();}
})(typeof globalThis==='object'?globalThis:this,function(env){
  const rules='https://www.usaswimming.org/about-usas/governance/rules-policies';
  const pool='https://www.pacswim.org/resources/faq';
  const questions=[
    {prompt:'Which stroke opens an individual medley?',options:['Backstroke','Butterfly','Breaststroke','Freestyle'],answer:1,explanation:'The IM order is butterfly, backstroke, breaststroke, then freestyle.',source:rules},
    {prompt:'Which stroke opens a medley relay?',options:['Butterfly','Freestyle','Backstroke','Breaststroke'],answer:2,explanation:'The medley relay starts with backstroke, followed by breaststroke, butterfly, and freestyle.',source:rules},
    {prompt:'Which stroke is last in an individual medley?',options:['Freestyle','Backstroke','Butterfly','Breaststroke'],answer:0,explanation:'Freestyle is the final quarter of an individual medley.',source:rules},
    {prompt:'Which stroke is second in a medley relay?',options:['Freestyle','Butterfly','Backstroke','Breaststroke'],answer:3,explanation:'Breaststroke follows the opening backstroke leg.',source:rules},
    {prompt:'How many lengths is 200 yards in a 25-yard pool?',options:['4','6','8','10'],answer:2,explanation:'200 divided by 25 is 8 lengths.',source:pool},
    {prompt:'How many lengths is 100 meters in a 50-meter pool?',options:['1','2','4','8'],answer:1,explanation:'100 divided by 50 is 2 lengths.',source:pool},
    {prompt:'An evenly paced 200 takes 2:40.00. What is each 50 split?',options:['35.00','38.00','40.00','45.00'],answer:2,explanation:'2:40.00 is 160 seconds. Divide by four 50s to get 40.00.'},
    {prompt:'Four 50 splits of 32.50 add up to which 200 time?',options:['2:00.00','2:05.00','2:10.00','2:15.00'],answer:2,explanation:'32.50 times four is 130 seconds, or 2:10.00.'},
    {prompt:'How far is each stroke in a 400-meter IM?',options:['50 meters','75 meters','100 meters','200 meters'],answer:2,explanation:'Each of the four strokes covers one quarter: 400 divided by four is 100 meters.',source:rules},
    {prompt:'What is the length of a long-course meters pool?',options:['25 yards','25 meters','50 yards','50 meters'],answer:3,explanation:'Long-course meters uses a 50-meter pool.',source:pool}
  ];
  const views=['reaction','quiz','pace','splits','medley','turn'];
  let quiz=null,pace=null,splits=null,medley=null,turn=null,selected='reaction';
  function shuffle(values){const items=[...values];for(let i=items.length-1;i>0;i--){const j=Math.floor((env.Math||Math).random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
  function timeText(cs){const minutes=Math.floor(cs/6000),seconds=(cs%6000/100).toFixed(2);return minutes?minutes+':'+seconds.padStart(5,'0'):seconds;}
  function splitQuestions(){
    const random=()=> (env.Math||Math).random();
    return Array.from({length:5},(_,index)=>{
      const distance=[100,200,400][Math.floor(random()*3)],parts=distance/50,split=2500+Math.floor(random()*61)*25+index*25,total=split*parts,answerCs=index%2?total:split;
      const options=shuffle([answerCs,answerCs-100,answerCs+100,answerCs+200]).map(timeText);
      return {prompt:index%2?parts+' equal 50s at '+timeText(split)+' each. What is the '+distance+' time?':'Even splits: '+distance+' in '+timeText(total)+'. What is each 50?',options,answer:options.indexOf(timeText(answerCs)),answerCs,
        explanation:index%2?parts+' times '+timeText(split)+' is '+timeText(total)+'.':timeText(total)+' divided into '+parts+' equal 50s is '+timeText(split)+' per 50.'};
    });
  }
  function storage(){try{return env.localStorage;}catch{return null;}}
  function read(key){try{const value=JSON.parse(storage()?.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
  function save(key,value){try{storage()?.setItem(key,JSON.stringify(value));}catch{}}
  function createQuiz(onChange,{makeQuestions,scoreKey='laneline-training-quiz'}={}){
    let deck=[],index=0,score=0,chosen=null,complete=false;
    const stored=read(scoreKey);let best=Number.isInteger(stored.best)&&stored.best>=0&&stored.best<=5?stored.best:0;
    function state(){const q=deck[index];return {index,total:deck.length,score,best,chosen,complete,question:q?{...q,options:[...q.options]}:null};}
    function emit(){onChange?.(state());}
    function restart(){
      deck=shuffle(makeQuestions?makeQuestions():questions);
      deck=deck.slice(0,5);index=score=0;chosen=null;complete=false;emit();
    }
    function answer(value){if(complete||chosen!==null||!Number.isInteger(value)||value<0||value>=deck[index].options.length)return;chosen=value;if(value===deck[index].answer)score++;emit();}
    function next(){if(complete){restart();return;}if(chosen===null)return;if(index===deck.length-1){complete=true;best=Math.max(best,score);save(scoreKey,{best});}else{index++;chosen=null;}emit();}
    restart();return {answer,next,restart,getState:state};
  }
  function createSplits(onChange){return createQuiz(onChange,{makeQuestions:splitQuestions,scoreKey:'laneline-training-splits'});}
  function createMedley(onChange){
    const orders={im:['Butterfly','Backstroke','Breaststroke','Freestyle'],relay:['Backstroke','Breaststroke','Butterfly','Freestyle']};
    const stored=read('laneline-training-medley'),bests={};for(const mode of ['im','relay'])if(Number.isInteger(stored[mode])&&stored[mode]>0&&stored[mode]<10000)bests[mode]=stored[mode];
    let mode='im',order=[],moves=0,solved=false;
    function state(){return {mode,order:[...order],correct:order.map((stroke,index)=>stroke===orders[mode][index]),moves,solved,best:bests[mode]??null};}
    function emit(){onChange?.(state());}
    function restart(){order=shuffle(orders[mode]);if(order.every((stroke,i)=>stroke===orders[mode][i]))order.push(order.shift());moves=0;solved=false;emit();}
    function setMode(value){if(!['im','relay'].includes(value))return;mode=value;restart();}
    function move(index,direction){
      const to=index+direction;if(solved||!Number.isInteger(index)||![-1,1].includes(direction)||index<0||index>=4||to<0||to>=4)return;
      [order[index],order[to]]=[order[to],order[index]];moves++;solved=order.every((stroke,i)=>stroke===orders[mode][i]);
      if(solved){bests[mode]=Math.min(bests[mode]??Infinity,moves);save('laneline-training-medley',bests);}emit();
    }
    restart();return {move,restart,setMode,getState:state};
  }
  function createPace(onChange){
    const stored=read('laneline-training-pace'),bests={},histories={};
    const validTarget=value=>Number.isFinite(value)&&value>=.5&&value<=120&&Math.abs(value*10-Math.round(value*10))<.000001;
    const records=stored.bests&&typeof stored.bests==='object'&&!Array.isArray(stored.bests)?stored.bests:stored;
    for(const [interval,error] of Object.entries(records))if(validTarget(Number(interval))&&Number.isFinite(error)&&error>=0&&error<=180000)bests[Number(interval)]=error;
    for(const [interval,errors] of Object.entries(stored.histories||{})){
      if(!validTarget(Number(interval))||!Array.isArray(errors))continue;
      histories[Number(interval)]=errors.filter(error=>Number.isInteger(error)&&error>=-120000&&error<=180000).slice(0,5);
    }
    let phase='idle',target=validTarget(stored.target)?stored.target:5,start=null,last=null;
    const persist=()=>save('laneline-training-pace',{target,bests,histories});
    function state(){return {phase,target,last,best:bests[target]??null,recent:[...(histories[target]||[])]};}
    function emit(){onChange?.(state());}
    function reset(){phase='idle';start=null;emit();}
    function setTarget(value){const next=Number(value);if(phase==='running'||!validTarget(next))return false;target=next;last=null;reset();persist();return true;}
    function press(){
      if(phase!=='running'){start=env.performance.now();phase='running';emit();return;}
      const elapsed=Math.round(env.performance.now()-start);start=null;
      if(!Number.isFinite(elapsed)||elapsed<0||elapsed>180000){reset();return;}
      last={elapsed,error:elapsed-Math.round(target*1000)};phase='result';
      bests[target]=Math.min(bests[target]??Infinity,Math.abs(last.error));
      histories[target]=[last.error,...(histories[target]||[])].slice(0,5);persist();emit();
    }
    emit();return {press,setTarget,reset,getState:state};
  }
  function bindQuiz(prefix,create){
    const doc=env.document,get=name=>doc.getElementById(prefix+'-'+name);let game;
    game=create(state=>{
      get('progress').textContent=state.complete?'Round complete':'Question '+(state.index+1)+' of '+state.total;
      get('score').textContent=state.score+' / '+state.total;get('best').textContent=state.best+' / 5';
      get('question').textContent=state.complete?'Nice work. Ready for another round?':state.question.prompt;
      const options=get('options');options.replaceChildren();
      if(!state.complete)state.question.options.forEach((label,index)=>{
        const button=doc.createElement('button');button.type='button';button.textContent=label;button.disabled=state.chosen!==null;
        if(state.chosen!==null)button.dataset.result=index===state.question.answer?'correct':index===state.chosen?'incorrect':'';
        button.addEventListener('click',()=>{env.LaneLineArcade?.unlockAudio();game.answer(index);});options.append(button);
      });
      const feedback=get('feedback');feedback.textContent=state.complete?state.score+' correct answers.':state.chosen===null?'':(state.chosen===state.question.answer?'Correct. ':'Not quite. ')+state.question.explanation;
      const source=get('source');source.hidden=state.complete||state.chosen===null||!state.question.source;if(!source.hidden)source.href=state.question.source;
      get('next').disabled=!state.complete&&state.chosen===null;get('next').textContent=state.complete?'Try again':state.index===state.total-1?'Finish round':'Next question';
      env.LaneLineArcade?.update(prefix==='splits'?'splits':'quiz',state);
    });
    get('next').addEventListener('click',()=>{game.next();get('question').focus();});return game;
  }
  function createTurn(onChange){
    const key='laneline-training-turn',saved=read(key).best;
    const timing={approach:{target:1500,window:220},flip:{target:850,window:150}};
    const pushDuration=900;
    let best=Number.isInteger(saved)&&saved>=0&&saved<=100?saved:null;
    const missDuration=620;
    let phase='idle',started=0,frame=null,tuck=null,push=null,score=null,miss=null,entry=1,missAt=0;
    function getState(now=env.performance.now()){
      const elapsed=Math.max(0,now-started),stage=timing[phase];
      return {phase,best,tuck,push,score,miss,entry,missAt,approachTarget:timing.approach.target/(timing.approach.target+timing.approach.window),
        progress:stage?Math.min(1,elapsed/(stage.target+stage.window)):phase==='pushOff'?Math.min(1,elapsed/pushDuration):
          phase==='miss'?Math.min(1,elapsed/missDuration):0,
        windowStart:stage?(stage.target-stage.window)/(stage.target+stage.window):0,
        windowTarget:stage?stage.target/(stage.target+stage.window):0,
        cue:Boolean(stage&&Math.abs(elapsed-stage.target)<=stage.window)};
    }
    function stop(){if(frame!==null)env.cancelAnimationFrame?.(frame);frame=null;}
    function emit(now){onChange?.(getState(now));}
    function fail(stage,reason){
      missAt=getState().progress;miss={stage,reason};enter('miss');
    }
    function tick(now){
      frame=null;
      const stage=timing[phase],elapsed=now-started;
      if(stage&&elapsed>stage.target+stage.window){fail(phase,'late');return;}
      if(phase==='pushOff'&&elapsed>=pushDuration){phase='result';emit(now);return;}
      emit(now);
      if(timing[phase]||phase==='pushOff'||phase==='miss'&&elapsed<missDuration)frame=env.requestAnimationFrame?.(tick)??null;
    }
    function enter(next){stop();phase=next;started=env.performance.now();tick(started);}
    function reset(){stop();phase='idle';tuck=push=score=miss=null;emit();}
    function press(){
      if(phase==='pushOff')return;
      const stage=timing[phase];
      if(!stage){tuck=push=score=miss=null;enter('approach');return;}
      const offset=env.performance.now()-started-stage.target,error=Math.round(offset);
      if(Math.abs(offset)>stage.window){fail(phase,offset<0?'early':'late');return;}
      if(phase==='approach'){tuck=error;entry=(offset+stage.target)/(stage.target+stage.window);enter('flip');return;}
      push=error;score=Math.round(100-50*(Math.abs(tuck)/timing.approach.window+Math.abs(push)/stage.window));
      best=Math.max(best??0,score);save(key,{best});enter('pushOff');
    }
    emit();return {press,reset,getState};
  }
  function init(){
    const doc=env.document;if(!doc?.getElementById('training-page')||quiz)return;
    const get=id=>doc.getElementById(id);
    quiz=bindQuiz('quiz',createQuiz);splits=bindQuiz('splits',createSplits);
    medley=createMedley(state=>{
      get('medley-mode').value=state.mode;get('medley-moves').textContent=String(state.moves);get('medley-best').textContent=state.best===null?'—':String(state.best);
      get('medley-status').textContent=state.solved?'Order complete!':state.moves+' moves';
      const list=get('medley-order');list.replaceChildren();
      state.order.forEach((stroke,index)=>{
        const item=doc.createElement('li');item.dataset.correct=String(state.correct[index]);
        const label=doc.createElement('span');label.textContent=(index+1)+'. '+stroke;item.append(label);
        const controls=doc.createElement('div');
        for(const direction of [-1,1]){
          const button=doc.createElement('button');button.type='button';button.textContent=direction<0?'\u2191':'\u2193';button.disabled=state.solved||index+direction<0||index+direction>3;
          button.setAttribute('aria-label','Move '+stroke+' '+(direction<0?'earlier':'later'));button.title=direction<0?'Move earlier':'Move later';
          button.addEventListener('click',()=>{env.LaneLineArcade?.unlockAudio();medley.move(index,direction);list.children[index+direction]?.querySelector?.('button:not(:disabled)')?.focus();});controls.append(button);
        }
        item.append(controls);list.append(item);
      });
      if(state.solved)env.LaneLineMotion?.celebrate(get('medley-status'));
      env.LaneLineArcade?.update('medley',state);
    });
    get('medley-mode').addEventListener('change',event=>medley.setMode(event.target.value));get('medley-new').addEventListener('click',()=>medley.restart());
    const presets=[3,5,10].map(target=>{
      const button=doc.createElement('button');button.type='button';button.textContent=target+'s';
      button.addEventListener('click',()=>pace.setTarget(target));get('pace-presets').append(button);return {target,button};
    });
    pace=createPace(state=>{
      get('pace-target').disabled=state.phase==='running';get('pace-target').value=String(state.target);
      get('pace-pad').textContent=state.phase==='running'?'Stop':state.phase==='result'?'Again':'Start';get('pace-pad').dataset.phase=state.phase;
      get('pace-status').textContent=state.phase==='running'?'Clock running':state.last?(Math.abs(state.last.error)/1000).toFixed(2)+'s '+(state.last.error<0?'early':state.last.error>0?'late':'on target'):'Ready';
      get('pace-elapsed').textContent=state.phase==='result'&&state.last?(state.last.elapsed/1000).toFixed(2)+'s':'—';get('pace-best').textContent=state.best===null?'—':state.best+' ms';
      for(const {target,button} of presets){
        button.disabled=state.phase==='running';button.setAttribute('aria-pressed',String(state.target===target));
      }
      get('pace-recent').replaceChildren(...state.recent.map(error=>{
        const item=doc.createElement('li');item.dataset.error=error<0?'early':error>0?'late':'exact';
        item.textContent=error===0?'On target':Math.abs(error)+' ms '+item.dataset.error;return item;
      }));
      get('pace-empty').hidden=Boolean(state.recent.length);
      env.LaneLineArcade?.update('pace',state);
    });
    const paceTarget=get('pace-target');
    get('pace-pad').addEventListener('click',()=>{
      env.LaneLineArcade?.unlockAudio();
      if(pace.getState().phase!=='running'){
        if(!paceTarget.checkValidity()){paceTarget.reportValidity();return;}
        if(Number(paceTarget.value)!==pace.getState().target&&!pace.setTarget(paceTarget.value))return;
      }
      pace.press();
    });
    get('pace-pad').addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});
    paceTarget.addEventListener('change',event=>{if(!paceTarget.checkValidity()){paceTarget.reportValidity();return;}pace.setTarget(event.target.value);});
    const turnButton=get('turn-pad');
    let turnCue='';
    const timingText=error=>error===null?'\u2014':error===0?'On target':Math.abs(error)+' ms '+(error<0?'early':'late');
    turn=createTurn(state=>{
      const {phase,cue,miss}=state,key=phase+':'+cue;
      if(key!==turnCue){
        const status={idle:'Ready',approach:cue?'Tuck now!':'Approaching the wall',flip:cue?'Push now!':'Feet coming around',pushOff:'Push-off',result:'Turn complete',
          miss:miss?((miss.stage==='approach'?'Tuck':'Push')+' too '+miss.reason):''};
        get('turn-status').textContent=status[phase];
        turnButton.textContent={idle:'Begin',approach:'Tuck',flip:'Push',pushOff:'Push-off',result:'Again',miss:'Again'}[phase];
        turnButton.dataset.phase=cue?'cue':phase;
        turnButton.setAttribute('aria-disabled',String(phase==='pushOff'));
        if(cue)env.LaneLineArcade?.cue('go');
        else if(phase==='pushOff')env.LaneLineArcade?.cue('success');
        else if(phase==='miss')env.LaneLineArcade?.cue('wrong');
        turnCue=key;
      }
      for(const [name,value] of [['tuck',timingText(state.tuck)],['push',timingText(state.push)],['score',state.score??'\u2014'],['best',state.best??'\u2014']]){
        const field=get('turn-'+name);if(field.textContent!==String(value))field.textContent=value;
      }
      env.LaneLineArcade?.draw('turn',state,0);
    });
    turnButton.addEventListener('click',()=>{env.LaneLineArcade?.unlockAudio();turn.press();});
    turnButton.addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});
    const tabs=[...doc.querySelectorAll('[data-training-view]')];
    tabs.forEach((button,index)=>{
      button.addEventListener('click',()=>select(button.dataset.trainingView));
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        select(tabs[next].dataset.trainingView);tabs[next].focus();
      });
    });
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)reset();});env.addEventListener('blur',reset);
    select('reaction');
  }
  function select(name){
    if(!views.includes(name))return;
    reset();selected=name;
    env.document.querySelectorAll('[data-training-view]').forEach(button=>{const active=button.dataset.trainingView===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
    for(const view of views)env.document.getElementById('training-'+view).hidden=view!==selected;
    env.LaneLineArcade?.select(name);
  }
  function reset(){env.LaneLineReaction?.reset();pace?.reset();turn?.reset();}
  return {init,createQuiz,createPace,createSplits,createMedley,createTurn,splitQuestions,timeText,select,reset,questions:questions.map(q=>({...q,options:[...q.options]}))};
});
