(function(root){
  function create({storage,isFavorite,getSwimmer,refresh,onChange=()=>{},delayMs=30000,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
    const key='laneline-favorite-refresh';let state=Object.create(null);try{const value=JSON.parse(storage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))for(const [id,item] of Object.entries(value))if(item&&typeof item==='object'&&['queued','checking','waiting','updated','checked','failed'].includes(item.status))state[id]=item;}catch{}
    let running=false,lastRequest=0;const jobs=[],controllers=new Map();
    const save=()=>{for(const id of Object.keys(state))if(!isFavorite(id))delete state[id];try{storage.setItem(key,JSON.stringify(state));}catch{}onChange();};
    async function drain(){
      if(running)return;running=true;
      try{while(jobs.length){const id=jobs.shift();if(!isFavorite(id)||!getSwimmer(id))continue;
        const wait=Math.max(0,delayMs-(Date.now()-lastRequest));if(wait)await pause(wait);
        if(!isFavorite(id))continue;const controller=new AbortController();controllers.set(id,controller);state[id]={...state[id],status:'checking'};save();lastRequest=Date.now();
        try{const result=await refresh(getSwimmer(id),controller.signal);if(controller.signal.aborted||!isFavorite(id))continue;
          state[id]={...state[id],status:result==='blocked'?'waiting':result==='updated'?'updated':result==='checked'?'checked':'failed',...(result==='updated'||result==='checked'?{checkedAt:new Date().toISOString()}: {})};
        }catch{if(isFavorite(id)&&!controller.signal.aborted)state[id]={...state[id],status:'failed'};}
        finally{controllers.delete(id);save();}
      }}finally{running=false;}
    }
    function request(id){if(!isFavorite(id)||!getSwimmer(id)||(controllers.has(id)&&!controllers.get(id).signal.aborted)||jobs.includes(id))return;
      state[id]={status:'queued',requestedAt:new Date().toISOString()};jobs.push(id);save();void drain();}
    function remove(id){controllers.get(id)?.abort();for(let i=jobs.length-1;i>=0;i--)if(jobs[i]===id)jobs.splice(i,1);delete state[id];save();}
    function resume(){for(const [id,item] of Object.entries(state))if(isFavorite(id)&&['queued','checking'].includes(item.status))request(id);save();}
    function reconcile(id,checkedAt){const item=state[id];if(!item||!isFavorite(id)||!['waiting','failed','queued'].includes(item.status)||!(Date.parse(checkedAt)>=Date.parse(item.requestedAt)))return;
      state[id]={...item,status:'updated',checkedAt};save();}
    return {request,remove,resume,reconcile,status:id=>state[id]||null};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LaneLineFavoriteRefresh=api;
})(typeof window==='undefined'?globalThis:window);
