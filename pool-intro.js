(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else factory(root).init();
})(typeof globalThis==='object'?globalThis:this,function(env){
  let active=false,reopenInstalled=false,lastClosed=-Infinity,reopenScene=null;
  const cameraZoom=1.5,laneCount=18;
  function poolTransition(target,width,height){
    const x=target.left+target.width/2-width*cameraZoom/2;
    const y=target.top+target.height/2-height*cameraZoom/2;
    return {transform:'translate('+x+'px,'+y+'px) scale('+cameraZoom+')'};
  }
  function lapPose(seconds,duration,offset=0){
    const p=((seconds/duration+offset)%1+1)%1;
    if(p<.42)return {position:p/.42,angle:Math.PI,side:1,turn:0};
    if(p<.5){const turn=(p-.42)/.08;return {position:1,angle:Math.PI+Math.PI*turn,side:Math.cos(Math.PI*turn),turn:Math.sin(Math.PI*turn)};}
    if(p<.92)return {position:1-(p-.5)/.42,angle:0,side:-1,turn:0};
    const turn=(p-.92)/.08;
    return {position:0,angle:Math.PI*turn,side:-Math.cos(Math.PI*turn),turn:Math.sin(Math.PI*turn)};
  }
  function init(){
    const doc=env.document;
    if(active||!doc||!doc.querySelector('.hero')||!env.requestAnimationFrame)return;
    if(reopenScene){reopenScene();return;}
    if(!reopenInstalled){
      reopenInstalled=true;
      const canReopen=()=>!active&&env.scrollY<=2&&env.performance.now()-lastClosed>1000;
      env.addEventListener('wheel',event=>{if(event.deltaY< -12&&canReopen()){event.preventDefault();init();}},{passive:false});
      let startY=null;
      doc.addEventListener('touchstart',event=>{startY=canReopen()?event.touches[0]?.clientY:null;},{passive:true});
      doc.addEventListener('touchend',event=>{if(startY!==null&&(event.changedTouches[0]?.clientY??startY)-startY>60&&canReopen())init();startY=null;},{passive:true});
      doc.addEventListener('keydown',event=>{if(event.key==='PageUp'&&canReopen()&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();init();}});
    }
    const layer=doc.createElement('section');
    layer.className='pool-intro';
    layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
    layer.setAttribute('aria-labelledby','pool-intro-title');
    const hero=doc.querySelector('.hero');
    hero.dataset.poolCamera='shared';
    layer.innerHTML='<div class="pool-intro-scene"><canvas aria-hidden="true"></canvas><div class="pool-intro-copy">'+hero.querySelector('.hero-logo').outerHTML+'<h1 id="pool-intro-title">'+hero.querySelector('h1').innerHTML+'</h1><p>'+hero.querySelector('p').textContent+'</p></div></div><button class="pool-intro-enter" type="button">Enter LaneLine <span aria-hidden="true">&darr;</span></button>';
    const scene=layer.querySelector('.pool-intro-scene');
    layer.querySelector('.pool-intro-copy').style.transform='translateY(-50%) scale('+(1/cameraZoom)+')';
    if(env.getComputedStyle)layer.querySelector('h1').style.fontSize=env.getComputedStyle(hero.querySelector('h1')).fontSize;
    const canvas=layer.querySelector('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)return;
    active=true;
    for(const child of hero.children)child.style.visibility='hidden';
    const reduced=env.matchMedia('(prefers-reduced-motion: reduce)');
    const priorFocus=doc.activeElement,priorOverflow=doc.body.style.overflow;
    const siblings=[...doc.body.children].filter(el=>!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>[el,el.inert]);
    siblings.forEach(([el])=>{el.inert=true;});
    doc.body.append(layer);doc.body.style.overflow='hidden';
    env.scrollTo(0,0);
    const button=layer.querySelector('button');button.focus({preventScroll:true});
    let width=1,height=1,frame=0,last=-Infinity,closing=false,touchY=null,onscreen=true;
    let fluid=null,fluidUntil=0,pendingFluid=null,pressed=false,pointer=null,flow=null,lastFlow=-Infinity,disposed=false;
    const ropes=Array.from({length:laneCount+1},()=>Array.from({length:33},()=>({x:0,v:0})));
    if(env.LaneLineFluid?.createDeferred){
      const surface=doc.createElement('canvas');surface.className='pool-intro-fluid';surface.setAttribute('aria-hidden','true');scene.prepend(surface);
      env.LaneLineFluid.createDeferred(surface,engine=>{
        if(disposed){engine.dispose?.();return;}
        fluid=engine;fluid.resize(width,height);
      },()=>surface.remove());
    }
    const started=env.performance.now();
    function resize(){
      width=env.innerWidth;height=env.innerHeight;
      scene.style.width=width+'px';scene.style.height=height+'px';
      const dpr=Math.min(env.devicePixelRatio||1,1.25);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      fluid?.resize(width,height);
      ctx.setTransform(dpr,0,0,dpr,0,0);draw((env.performance.now()-started)/1000);
      if(!active)fitBanner();
    }
    function swimmer(x,y,pose,stroke,seconds,index,scale){
      ctx.save();ctx.globalAlpha=.7;ctx.translate(x,y);ctx.rotate(pose.angle);ctx.scale(scale,scale);
      const phase=seconds*({free:8,back:7,breast:4,fly:6}[stroke])+index;
      const skin=['#f5cba7','#bd8965','#915e48'][index%3];
      const block=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
      if(pose.turn>.25){
        block(-3,-4,6,8,'#99dfff');block(-2,-7,4,3,skin);
        block(-5,2,3,5,skin);block(2,2,3,5,skin);
      }else{
        block(-2,-9,4,3,'#a5e7ff');block(-2,-6,4,3,skin);
        block(-3,-3,6,8,skin);block(-3,3,6,5,'#8cdcff');
        if(index%2)block(-3,-2,6,6,'#8cdcff');
        if(stroke==='breast'||stroke==='fly'){
          const sweep=(Math.sin(phase)+1)/2,reach=stroke==='breast'?sweep*5:3+sweep*7;
          for(const side of [-1,1]){
            block(side<0?-4-reach:3,-7+sweep*5,2+reach,2,skin);
            block(side<0?-3-sweep*3:1+sweep*3,8,2,6,skin);
          }
        }else{
          const swing=Math.sin(phase)*6;
          block(-5,-5+swing,2,8,skin);block(3,-5-swing,2,8,skin);
          block(-3,8,2,7+(Math.sin(phase)>0?1:0),skin);block(1,8,2,7+(Math.sin(phase)<0?1:0),skin);
        }
      }
      ctx.restore();
    }
    function draw(seconds){
      ctx.clearRect(0,0,width,height);
      const edge=width*.04,wall=42,lane=width*.92/laneCount;
      const top=wall+30,bottom=height-wall-30;
      ctx.lineWidth=1;
      for(let row=0;row<10;row++){
        const y=wall+row*(height-wall*2)/9;ctx.beginPath();
        for(let x=0;x<=width+32;x+=32){
          const offset=Math.sin(x*.022+row*.9+seconds*.35)*1.5+Math.sin(x*.009-seconds*.25);
          if(x===0)ctx.moveTo(x,y+offset);else ctx.lineTo(x,y+offset);
        }
        ctx.strokeStyle=row%3===0?'rgba(81,195,223,.16)':'rgba(107,211,235,.065)';ctx.stroke();
      }
      for(let i=0;i<laneCount;i++){
        const x=edge+(i+.5)*lane;
        ctx.strokeStyle='rgba(81,195,223,.08)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(x,wall+20);ctx.lineTo(x,height-wall-20);ctx.stroke();
        for(const y of [wall+20,height-wall-20]){ctx.beginPath();ctx.moveTo(x-lane*.2,y);ctx.lineTo(x+lane*.2,y);ctx.stroke();}
      }
      for(let i=0;i<=laneCount;i++){
        ctx.beginPath();
        for(let y=wall;y<=height-wall;y+=6){
          const fraction=(y-wall)/Math.max(1,height-wall*2),node=ropes[i][Math.min(32,Math.round(fraction*32))];
          const x=edge+i*lane+Math.sin(y*.025+seconds*1.3+i)*1.2+node.x;
          if(y===wall)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.setLineDash([]);ctx.strokeStyle='rgba(0,12,30,.35)';ctx.lineWidth=8;ctx.stroke();
        ctx.strokeStyle='#167eaa';ctx.lineWidth=6;ctx.stroke();
        ctx.setLineDash([10,7]);ctx.lineDashOffset=Math.sin(seconds*1.2+i*.8)*9;
        ctx.strokeStyle=i%2?'#70d8e9':'#d0f2f7';ctx.lineWidth=5;ctx.stroke();
        ctx.setLineDash([1,16]);ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=6;ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;
      }
      for(let i=0;i<laneCount*2;i++){
        const laneIndex=Math.floor(i/2),stroke=['free','breast','back','fly'][laneIndex%4];
        const pace=stroke==='breast'?.07:stroke==='fly'?.035:0;
        const secondsPaced=seconds+Math.sin(seconds*4+i)*pace;
        const pose=lapPose(secondsPaced,14+(laneIndex%4)*1.7,laneIndex*.061+(i%2)*.5);
        swimmer(edge+(laneIndex+.5)*lane+pose.side*lane*.16,top+pose.position*(bottom-top),pose,stroke,seconds,i,Math.max(.65,Math.min(1.65,lane/38)));
      }
      // Gutters and solid end walls make each turn visibly meet the pool edge.
      ctx.fillStyle='#173c57';ctx.fillRect(0,0,width,wall-8);ctx.fillRect(0,height-wall+8,width,wall-8);
      ctx.fillStyle='#163e56';ctx.fillRect(0,wall-8,width,8);ctx.fillRect(0,height-wall,width,8);
      for(let i=0;i<laneCount;i++){
        const x=edge+(i+.5)*lane;
        ctx.fillStyle='#619bb2';ctx.fillRect(x-lane*.19,8,lane*.38,14);ctx.fillRect(x-lane*.19,height-22,lane*.38,14);
      }
    }
    function tick(now){
      frame=0;
      if(closing||doc.hidden||reduced.matches||(!active&&!onscreen))return;
      if(now-last>=40){
        const elapsed=Math.min(.06,(now-last)/1000||.04);
        if(pendingFluid&&fluid){fluid.splat(pendingFluid.x,pendingFluid.y,pendingFluid.dx,pendingFluid.dy);pendingFluid=null;fluidUntil=now+6000;}
        if(fluid&&now<fluidUntil){
          fluid.advance(elapsed);
          if(now-lastFlow>250){flow=fluid.sampleRopes?.();lastFlow=now;}
        }else flow=null;
        ropes.forEach((nodes,index)=>{
          const forces=nodes.map((node,i)=>{
            const sample=flow?.[Math.round(index*12/laneCount)*17+Math.round(i/2)]||0;
            const dx=width*(.04+index*.92/laneCount)- (pointer?.x??-1000),dy=42+i*(height-84)/32-(pointer?.y??-1000);
            const distance=Math.hypot(dx,dy),push=pressed&&distance<90?(pointer.dx*.04+(dx>0?.2:-.2))*Math.pow(1-distance/90,2):0;
            return Math.max(-.6,Math.min(.6,sample*.002+push));
          });
          env.LaneLineMotion?.stepWaterRope(nodes,forces);
        });
        draw((now-started)/1000);last=now;
      }
      frame=env.requestAnimationFrame(tick);
    }
    function visibility(){env.cancelAnimationFrame(frame);frame=0;if(!closing&&!doc.hidden&&!reduced.matches&&(active||onscreen))frame=env.requestAnimationFrame(tick);}
    function fitBanner(){
      const rect=hero.getBoundingClientRect();
      scene.style.transform=poolTransition({left:0,top:0,width:rect.width,height:rect.height},width,height).transform;
    }
    function cleanup(){
      active=false;closing=false;lastClosed=env.performance.now();
      // Keep the exact same canvas, simulation and text mounted as the small banner.
      hero.append(layer);
      Object.assign(layer.style,{position:'absolute',inset:'0',zIndex:'10',clipPath:'none'});
      layer.removeAttribute('aria-modal');layer.removeAttribute('role');button.hidden=true;
      fitBanner();doc.body.style.overflow=priorOverflow;
      siblings.forEach(([el,inert])=>{el.inert=inert;});
      (priorFocus?.tagName==='BODY'?doc.getElementById('ptab-best'):priorFocus)?.focus?.({preventScroll:true});
      visibility();
    }
    reopenScene=async()=>{
      if(active||closing)return;
      const target=hero.getBoundingClientRect();active=true;closing=true;
      siblings.forEach(([el])=>{el.inert=true;});
      doc.body.append(layer);doc.body.style.overflow='hidden';
      Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'1000'});
      layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
      button.hidden=false;button.style.opacity='1';
      const from=poolTransition(target,width,height),inset=[target.top,width-target.right,height-target.bottom,target.left].map(n=>Math.max(0,n)+'px').join(' ');
      if(!reduced.matches&&layer.animate){
        const options={duration:950,easing:'cubic-bezier(.22,1,.36,1)'};
        const camera=scene.animate([from,{transform:'translate(0px,0px) scale(1)'}],options);
        const crop=layer.animate([{clipPath:'inset('+inset+')'},{clipPath:'inset(0px)'}],options);
        try{await Promise.all([camera.finished,crop.finished]);}catch{}
      }
      scene.style.transform='none';layer.style.clipPath='none';closing=false;button.focus({preventScroll:true});visibility();
    };
    async function enter(){
      if(closing)return;closing=true;env.cancelAnimationFrame(frame);
      const target=doc.querySelector('.hero').getBoundingClientRect();
      if(reduced.matches||!layer.animate){cleanup();return;}
      const inset=[Math.max(0,target.top),Math.max(0,width-target.right),Math.max(0,height-target.bottom),Math.max(0,target.left)];
      const options={duration:950,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'};
      // One camera transform keeps the water, ropes, swimmers and lettering together.
      button.style.opacity='0';
      const camera=scene.animate([{transform:'translate(0px,0px) scale(1)'},poolTransition(target,width,height)],options);
      const animation=layer.animate([{clipPath:'inset(0px 0px 0px 0px)'},{clipPath:'inset('+inset.map(n=>n+'px').join(' ')+')'}],options);
      try{await animation.finished;}catch{}finally{camera.cancel();animation.cancel();cleanup();}
    }
    button.addEventListener('click',enter);
    layer.addEventListener('pointerdown',event=>{
      if(event.button!==0||reduced.matches||event.target.closest('button'))return;
      pressed=true;pointer={...pointerPosition(event),dx:0};
      layer.setPointerCapture?.(event.pointerId);
    });
    layer.addEventListener('pointermove',event=>{
      if(!pressed||reduced.matches)return;
      const point=pointerPosition(event),dx=point.x-pointer.x,dy=point.y-pointer.y;
      pointer={...point,dx};
      pendingFluid={x:pointer.x/width,y:pointer.y/height,dx:(pendingFluid?.dx||0)+dx/width,dy:(pendingFluid?.dy||0)+dy/height};
    });
    const release=()=>{pressed=false;pointer=null;};
    function pointerPosition(event){const bounds=scene.getBoundingClientRect(),zoom=active?1:cameraZoom;return {x:(event.clientX-bounds.left)/zoom,y:(event.clientY-bounds.top)/zoom};}
    layer.addEventListener('pointerup',release);layer.addEventListener('pointercancel',release);layer.addEventListener('lostpointercapture',release);
    layer.addEventListener('wheel',event=>{if(active){event.preventDefault();if(event.deltaY>8)enter();}},{passive:false});
    layer.addEventListener('keydown',event=>{if(!active)return;if(['Escape','Enter',' ','ArrowDown','PageDown'].includes(event.key)){event.preventDefault();enter();}else if(event.key==='Tab'){event.preventDefault();button.focus();}});
    layer.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY;},{passive:true});
    layer.addEventListener('touchend',event=>{if(active&&touchY!==null&&touchY-(event.changedTouches[0]?.clientY??touchY)>35)enter();touchY=null;},{passive:true});
    env.addEventListener('resize',resize);doc.addEventListener('visibilitychange',visibility);
    if(env.IntersectionObserver)new env.IntersectionObserver(entries=>{onscreen=entries[0].isIntersecting;visibility();}).observe(hero);
    reduced.addEventListener?.('change',visibility);
    resize();visibility();
  }
  return {init,lapPose,poolTransition};
});
