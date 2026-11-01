(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else {root.LaneLineMotion=factory(root);root.LaneLineMotion.init();}
})(typeof globalThis==='object'?globalThis:this,function(env){
  const preference=env.matchMedia?.('(prefers-reduced-motion: reduce)');
  const running=new Map(),seen=new WeakSet(),watched=new Set();
  const ease='cubic-bezier(0.22,1,0.36,1)';
  let observer,indicator,nav;
  function reduced(){return Boolean(preference?.matches);}
  function stop(element){
    const previous=running.get(element);
    if(previous){previous.cancel();running.delete(element);}
  }
  function play(element,frames,options={}){
    if(!element?.animate)return;
    stop(element);
    if(reduced())return;
    const animation=element.animate(frames,{duration:300,easing:ease,...options});
    running.set(element,animation);
    animation.finished.then(()=>{
      if(running.get(element)===animation)running.delete(element);
    }).catch(()=>{});
    return animation;
  }
  function reveal(root){
    if(!root||reduced())return;
    for(const element of watched)if(!element.isConnected){observer?.unobserve(element);watched.delete(element);}
    const elements=root.querySelectorAll('.best-summary-card,.profile-card,.signature-event,.strength-grid .insight-row,.goal-card,.meet-option');
    elements.forEach((element,index)=>{
      if(seen.has(element)||(element.getClientRects&&!element.getClientRects().length))return;
      seen.add(element);
      element.dataset.motionDelay=String(Math.min(index%6*18,90));
      if(observer){observer.observe(element);watched.add(element);}
      else if(index<12)arrive(element);
    });
  }
  function arrive(element){
    play(element,[{opacity:0,transform:'translateY(12px) scale(.992)'},{opacity:1,transform:'translateY(0) scale(1)'}],
      {duration:380,delay:Number(element.dataset.motionDelay||0)});
  }
  function enter(root,direction=1){
    play(root,[{opacity:.45,transform:`translateX(${direction*14}px)`},{opacity:1,transform:'translateX(0)'}],{duration:260});
    reveal(root);
  }
  function updateTab(){
    if(!nav)return;
    const active=nav.querySelector('.page-tab.active');
    if(!active)return;
    const prior=indicator?.getBoundingClientRect();
    if(!indicator){
      indicator=env.document.createElement('span');
      indicator.className='tab-motion-indicator';indicator.setAttribute('aria-hidden','true');
      nav.prepend(indicator);nav.classList.add('has-motion-indicator');
    }
    stop(indicator);
    const bounds=nav.getBoundingClientRect(),target=active.getBoundingClientRect();
    Object.assign(indicator.style,{left:`${target.left-bounds.left}px`,top:`${target.top-bounds.top}px`,width:`${target.width}px`,height:`${target.height}px`});
    if(prior&&prior.width&&prior.height){
      play(indicator,[{transform:`translate(${prior.left-target.left}px,${prior.top-target.top}px) scale(${prior.width/target.width},${prior.height/target.height})`},{transform:'none'}],{duration:340});
    }
  }
  function dialog(element){
    play(element,[{opacity:0,transform:'translateY(10px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:220});
  }
  function init(){
    const doc=env.document;if(!doc)return;
    const setup=()=>{
      nav=doc.querySelector('.page-tabs');updateTab();
      if(env.IntersectionObserver){
        observer=new env.IntersectionObserver(entries=>{
          for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);watched.delete(entry.target);arrive(entry.target);}
        },{threshold:.08,rootMargin:'0px 0px 30px 0px'});
      }
      doc.addEventListener('pointerdown',event=>{
        const button=event.target.closest('button');
        if(button&&!button.disabled)play(button,[{scale:1},{scale:.965},{scale:1}],{duration:190});
      });
      preference?.addEventListener('change',()=>{
        if(reduced())for(const element of [...running.keys()])stop(element);
        updateTab();
      });
      env.addEventListener?.('resize',updateTab);
      reveal(doc.querySelector('.main'));
    };
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
  }
  return {init,enter,reveal,updateTab,dialog,reduced};
});
