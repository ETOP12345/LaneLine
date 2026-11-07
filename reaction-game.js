(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else{root.LaneLineReaction=factory(root);root.LaneLineReaction.init();}
})(typeof globalThis==='object'?globalThis:this,function(env){
  const key='laneline-reaction-results';
  let controller=null;
  function create(onChange,storage){
    if(!storage){try{storage=env.localStorage;}catch{}}
    let phase='idle',best=null,attempts=[],last=null,timer=null,frame=null,goAt=null,generation=0;
    const valid=value=>Number.isFinite(value)&&value>=0&&value<=60000;
    try{const saved=JSON.parse(storage?.getItem(key)||'{}');best=valid(saved.best)?Math.round(saved.best):null;attempts=Array.isArray(saved.attempts)?saved.attempts.filter(valid).slice(0,5).map(Math.round):[];}catch{}
    function snapshot(){return {phase,best,attempts:[...attempts],last,average:attempts.length?Math.round(attempts.reduce((sum,n)=>sum+n,0)/attempts.length):null};}
    function emit(){onChange?.(snapshot());}
    function cancel(){generation++;env.clearTimeout(timer);env.cancelAnimationFrame?.(frame);timer=frame=null;goAt=null;}
    function reset(){cancel();phase='idle';emit();}
    function press(){
      if(phase==='waiting'){cancel();phase='falseStart';emit();return;}
      if(phase==='go'){
        const score=Math.round(env.performance.now()-goAt);cancel();
        if(!valid(score)){phase='idle';emit();return;}
        last=score;best=best===null?score:Math.min(best,score);attempts=[score,...attempts].slice(0,5);phase='result';
        try{storage?.setItem(key,JSON.stringify({best,attempts}));}catch{}
        emit();return;
      }
      cancel();phase='waiting';const current=generation;emit();
      timer=env.setTimeout(()=>{
        if(current!==generation)return;
        frame=env.requestAnimationFrame(()=>{if(current!==generation)return;goAt=env.performance.now();phase='go';emit();});
      },1400+(env.Math||Math).random()*2200);
    }
    function clear(){reset();best=last=null;attempts=[];try{storage?.removeItem(key);}catch{}emit();}
    function replayScore(){return phase==='waiting'||phase==='go'?null:attempts[0]??null;}
    emit();return {press,reset,clear,replayScore,getState:snapshot};
  }
  function init(){
    const doc=env.document,button=doc?.getElementById('reaction-pad');if(!button||controller)return;
    const ms=value=>value===null?'—':value+' ms',replay=doc.getElementById('reaction-replay');
    controller=create(state=>{
      button.dataset.phase=state.phase;
      button.textContent={idle:'Begin',waiting:'Hold…',go:'Go!',result:'Again',falseStart:'Again'}[state.phase];
      doc.getElementById('reaction-status').textContent={idle:'Ready',waiting:'Set',go:'Go!',result:ms(state.last),falseStart:'False start'}[state.phase];
      doc.getElementById('reaction-best').textContent=ms(state.best);
      doc.getElementById('reaction-last').textContent=ms(state.last);
      doc.getElementById('reaction-average').textContent=ms(state.average);
      const history=doc.getElementById('reaction-recent'),slowest=Math.max(1,...state.attempts);
      history.replaceChildren(...state.attempts.map(value=>{
        const item=doc.createElement('li'),bar=doc.createElement('span'),label=doc.createElement('span');
        bar.className='reaction-history-bar';bar.style.setProperty('--bar-width',value/slowest*100+'%');bar.setAttribute('aria-hidden','true');
        label.textContent=ms(value);item.dataset.best=String(value===state.best);item.append(bar,label);return item;
      }));
      doc.getElementById('reaction-empty').hidden=Boolean(state.attempts.length);
      replay.disabled=state.phase==='waiting'||state.phase==='go'||!state.attempts.length;
      doc.getElementById('reaction-clear').disabled=!state.attempts.length&&state.best===null;
      env.LaneLineArcade?.update('reaction',state);
    });
    button.addEventListener('click',()=>{env.LaneLineArcade?.unlockAudio();controller.press();});
    button.addEventListener('keydown',event=>{if(event.repeat)event.preventDefault();});
    replay.addEventListener('click',()=>{
      const last=controller.replayScore();
      if(last!==null)env.LaneLineArcade?.update('reaction',{phase:'result',last});
    });
    doc.getElementById('reaction-clear').addEventListener('click',controller.clear);
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)controller.reset();});
    env.addEventListener('blur',()=>controller.reset());
  }
  return {create,init,reset(){controller?.reset();}};
});
