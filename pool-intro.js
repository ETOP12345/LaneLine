(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else factory(root).init();
})(typeof globalThis==='object'?globalThis:this,function(env){
  let initialized=false;
  const cameraZoom=1.5,laneCount=18;
  function canvasScale(width,height,ratio=1){return Math.min(ratio,1.1,1600/Math.max(1,width),1000/Math.max(1,height));}
  function waterDrift(x,y,width,height,flow,impulse,now){
    const column=Math.max(0,Math.min(12,Math.round((x/width-.04)*12/.92))),row=Math.max(0,Math.min(16,Math.round(y/height*16)));
    let dx=(flow?.[column*17+row]||0)*.025,dy=0;
    if(impulse){
      const age=Math.max(0,now-impulse.time),distance=Math.hypot(x-impulse.x,y-impulse.y);
      const attenuation=Math.pow(.62,Math.floor(Math.abs(x-impulse.x)/(width*.92/laneCount)));
      const decay=Math.exp(-age/750)*attenuation,near=Math.max(0,1-distance/180);
      dx+=impulse.dx*.12*near*decay;
      dy+=impulse.dy*.08*near*decay+Math.sin((distance-age*.18)*.05)*3*Math.exp(-Math.abs(distance-age*.18)/110)*decay;
    }
    return {x:Math.max(-6,Math.min(6,dx)),y:Math.max(-5,Math.min(5,dy))};
  }
  function fullLaneSwimmers(){return Array.from({length:laneCount*2},(_,index)=>({index,laneIndex:Math.floor(index/2)}));}
  function snapDestination(scroll,distance,fromBanner=false){
    if(distance<=0||scroll<=1||scroll>=distance-1)return null;
    return scroll<distance*(fromBanner ? .3 : .5)?0:distance;
  }
  function poolTransition(target,width,height){
    const x=target.left+target.width/2-width*cameraZoom/2;
    const y=target.top+target.height/2-height*cameraZoom/2;
    return {transform:'translate('+x+'px,'+y+'px) scale('+cameraZoom+')'};
  }
  function cameraAtProgress(progress,target,width,height){
    const p=Math.max(0,Math.min(1,progress)),eased=p*p*(3-2*p),zoom=1+(cameraZoom-1)*eased;
    const x=(target.left+target.width/2-width*cameraZoom/2)*eased;
    const y=(target.top+target.height/2-height*cameraZoom/2)*eased;
    // Keep the wide camera aperture open while the pool ends move past it.
    const cropStart=Math.max(0,(p-.7)/.3),crop=cropStart*cropStart*(3-2*cropStart);
    return {transform:'translate('+x+'px,'+y+'px) scale('+zoom+')',
      clipPath:'inset('+[target.top,width-target.right,height-target.bottom,target.left].map(n=>Math.max(0,n)*crop+'px').join(' ')+')',zoom};
  }
  function lapPose(seconds,duration,offset=0,stroke='free'){
    const p=((seconds/duration+offset)%1+1)%1;
    if(p<.42)return {position:.06+.94*p/.42,angle:Math.PI,side:1,turn:0,streamline:p<.045};
    if(p>=.5&&p<.92)return {position:.94*(1-(p-.5)/.42),angle:0,side:-1,turn:0,streamline:p<.545};
    const bottom=p<.5,t=bottom?(p-.42)/.08:(p-.92)/.08;
    const smooth=value=>{const n=Math.max(0,Math.min(1,value));return n*n*(3-2*n);};
    const pivot=smooth((t-.18)/.54),push=smooth((t-.72)/.28);
    return {position:bottom?1-.06*push:.06*push,angle:(bottom?Math.PI:0)+Math.PI*pivot,
      side:(bottom?1:-1)*Math.cos(Math.PI*smooth(t)),turn:Math.sin(Math.PI*t),
      turnStyle:stroke==='breast'||stroke==='fly'?'open':'flip',
      turnStage:t<.18?'touch':t<.72?'tuck':'push',tuck:Math.sin(pivot*Math.PI),streamline:t>=.72};
  }
  function init(){
    const doc=env.document;
    if(initialized||!doc||!doc.querySelector('.hero')||!env.requestAnimationFrame||
      new URLSearchParams(env.location?.search||'').get('skipIntro')==='1')return;
    const layer=doc.createElement('section');
    layer.className='pool-intro';
    layer.setAttribute('role','region');
    layer.setAttribute('aria-labelledby','pool-intro-title');
    const hero=doc.querySelector('.hero');
    hero.dataset.poolCamera='shared';
    layer.innerHTML='<div class="pool-intro-scene"><canvas aria-hidden="true"></canvas><div class="pool-intro-copy">'+hero.querySelector('.hero-logo').outerHTML+'<h1 id="pool-intro-title">'+hero.querySelector('h1').innerHTML+'</h1><p>'+hero.querySelector('p').textContent+'</p></div></div><button class="pool-intro-enter" type="button">Enter LaneLine <span aria-hidden="true">&darr;</span></button><button class="pool-reopen" type="button" title="Open fullscreen pool" hidden>Fullscreen</button>';
    const scene=layer.querySelector('.pool-intro-scene');
    layer.querySelector('.pool-intro-copy').style.transform='translateY(-50%) scale('+(1/cameraZoom)+')';
    const canvas=layer.querySelector('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)return;
    initialized=true;
    const history=env.history,scrollRestoration=history?.scrollRestoration;
    if(scrollRestoration)history.scrollRestoration='manual';
    for(const child of hero.children)child.style.visibility='hidden';
    const reduced=env.matchMedia('(prefers-reduced-motion: reduce)');
    const spacer=doc.createElement('div');spacer.className='pool-scroll-space';spacer.setAttribute('aria-hidden','true');hero.before(spacer);
    doc.body.append(layer);
    const letters=env.LaneLineMotion?.prepareWaterLetters(layer.querySelector('.pool-intro-copy'),'h1,p,.hero-wordmark')||[];
    const button=layer.querySelector('.pool-intro-enter');
    const reopenButton=layer.querySelector('.pool-reopen');
    let width=1,height=1,frame=0,last=-Infinity,closing=false,onscreen=true,active=true;
    let scrollDistance=1,progress=0,cameraFrame=0,mountedInBanner=false,currentZoom=1,snapTimer=null,fromBanner=false;
    let fullscreenLocked=false,reopening=false;
    let fluid=null,fluidUntil=0,pendingFluid=null,pressed=false,pointer=null,flow=null,lastFlow=-Infinity,lastFluidAdvance=-Infinity,disposed=false;
    let impulse=null;
    let swimmers=fullLaneSwimmers();
    let lowDensity=false,swimmerNumber=laneCount*2,bannerHeight=1,drainBounds=null;
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
      scrollDistance=Math.round(Math.max(160,Math.min(280,height*.3)));
      spacer.style.height=(fullscreenLocked?0:scrollDistance)+'px';
      scene.style.width=width+'px';scene.style.height=height+'px';
      const dpr=canvasScale(width,height,env.devicePixelRatio||1);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      fluid?.resize(width,height);
      ctx.setTransform(dpr,0,0,dpr,0,0);draw((env.performance.now()-started)/1000);
      syncCamera();
      measureLetters();
    }
    function measureLetters(){
      if(!letters.length)return;
      const bounds=scene.getBoundingClientRect();
      for(const letter of letters){letter.element.style.transform='none';letter.lastTransform='none';letter.x=letter.y=0;}
      for(const letter of letters){
        const rect=letter.element.getBoundingClientRect();
        letter.baseX=(rect.left+rect.width/2-bounds.left)/currentZoom;letter.baseY=(rect.top+rect.height/2-bounds.top)/currentZoom;
      }
    }
    function moveLetters(now){
      for(const letter of letters){
        const drift=waterDrift(letter.baseX,letter.baseY,width,height,flow,impulse,now);
        letter.x+=(drift.x*1.9-letter.x)*.22;letter.y+=(drift.y*2.1-letter.y)*.22;
        if(Math.abs(letter.x)<.02)letter.x=0;if(Math.abs(letter.y)<.02)letter.y=0;
        const transform=letter.x||letter.y?'translate('+letter.x.toFixed(1)+'px,'+letter.y.toFixed(1)+'px) rotate('+(letter.x*.5).toFixed(1)+'deg)':'none';
        if(transform!==letter.lastTransform){letter.element.style.transform=transform;letter.lastTransform=transform;}
      }
    }
    function swimmer(x,y,pose,stroke,seconds,index,scale){
      env.LaneLineMotion?.drawBannerSwimmer(ctx,{...pose,stroke,start:index*170,female:index%2===1,skin:['#f6cfa3','#c48d66','#8d5d46'][index%3],color:'#8cdcff'},x,y,seconds*1000,scale,pose.angle);
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
        for(let point=0;point<33;point++){
          const y=wall+point*(height-wall*2)/32,node=ropes[i][point];
          const x=edge+i*lane+Math.sin(y*.025+seconds*1.3+i)*1.2+node.x;
          if(point===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.setLineDash([]);ctx.strokeStyle='rgba(0,12,30,.35)';ctx.lineWidth=8;ctx.stroke();
        ctx.strokeStyle='#167eaa';ctx.lineWidth=6;ctx.stroke();
        ctx.setLineDash([10,7]);ctx.lineDashOffset=Math.sin(seconds*1.2+i*.8)*9;
        ctx.strokeStyle=i%2?'#70d8e9':'#d0f2f7';ctx.lineWidth=5;ctx.stroke();
        ctx.setLineDash([1,16]);ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=6;ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;
      }
      const halfView=active?height/2:bannerHeight/(2*cameraZoom),view={top:height/2-halfView,bottom:height/2+halfView};
      if(lowDensity&&swimmers.length<2+(Math.floor(seconds/7)%2)){
        const index=swimmerNumber++,laneIndex=3+(index*5)%12;
        swimmers.push({index,laneIndex,start:seconds,last:seconds,progress:0,cruising:true,up:index%2===0,from:view.top-35,to:view.bottom+35});
      }
      const remaining=[];
      for(const entry of swimmers){
        const i=entry.index,laneIndex=entry.laneIndex,stroke=['free','breast','back','fly'][laneIndex%4];
        const pace=stroke==='breast'?.07:stroke==='fly'?.035:0;
        const secondsPaced=seconds+Math.sin(seconds*4+i)*pace;
        let pose,y;
        if(entry.cruising){
          const duration={free:4.2,back:4.4,breast:5,fly:4.6}[stroke];
          const pace=env.LaneLineMotion?.bannerStrokePace(stroke,(seconds-entry.start)*1000)||1;
          entry.progress+=Math.max(0,Math.min(.08,seconds-entry.last))*pace/duration;entry.last=seconds;
          const progress=entry.progress;
          if(progress>1)continue;
          y=entry.up?entry.to-progress*(entry.to-entry.from):entry.from+progress*(entry.to-entry.from);
          pose={angle:entry.up?0:Math.PI,side:entry.up?-1:1,turn:0};
        }else{
          pose=lapPose(secondsPaced,14+(laneIndex%4)*1.7,laneIndex*.061+(i%2)*.5,stroke);
          y=top+pose.position*(bottom-top);
          if(lowDensity&&(y<drainBounds.top-35||y>drainBounds.bottom+35))continue;
        }
        remaining.push(entry);
        const x=edge+(laneIndex+.5)*lane+pose.side*lane*.16;
        const drift=waterDrift(x,y,width,height,flow,impulse,env.performance.now());
        entry.driftX=((entry.driftX||0)*.86+drift.x*.14);entry.driftY=((entry.driftY||0)*.86+drift.y*.14);
        swimmer(x+entry.driftX,y+entry.driftY,{...pose,angle:pose.angle+entry.driftX*.012},stroke,seconds,i,Math.max(.65,Math.min(1.65,lane/38)));
      }
      swimmers=remaining;
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
      if(doc.hidden||reduced.matches||(!active&&!onscreen))return;
      if(now-last>=(closing?16:pressed||now<fluidUntil?32:50)){
        if(pendingFluid&&fluid){fluid.splat(pendingFluid.x,pendingFluid.y,pendingFluid.dx,pendingFluid.dy);pendingFluid=null;fluidUntil=now+6000;}
        if(fluid&&now<fluidUntil){
          if(now-lastFluidAdvance>=32){fluid.advance(Math.min(.033,(now-lastFluidAdvance)/1000));lastFluidAdvance=now;}
          if(now-lastFlow>400){flow=fluid.sampleRopes?.();lastFlow=now;}
        }else flow=null;
        ropes.forEach((nodes,index)=>{
          const forces=nodes.map((node,i)=>{
            const sample=flow?.[Math.round(index*12/laneCount)*17+Math.round(i/2)]||0;
            const dx=width*(.04+index*.92/laneCount)- (pointer?.x??-1000),dy=42+i*(height-84)/32-(pointer?.y??-1000);
            const distance=Math.hypot(dx,dy),push=pressed&&distance<105?(pointer.dx*.055+(dx>0?.26:-.26))*Math.pow(1-distance/105,2):0;
            return Math.max(-.85,Math.min(.85,sample*.0028+push));
          });
          env.LaneLineMotion?.stepWaterRope(nodes,forces);
        });
        draw((now-started)/1000);moveLetters(now);last=now;
      }
      frame=env.requestAnimationFrame(tick);
    }
    function visibility(){env.cancelAnimationFrame(frame);frame=0;if(!doc.hidden&&!reduced.matches&&(active||onscreen))frame=env.requestAnimationFrame(tick);}
    function lockBanner(){
      fullscreenLocked=true;
      reopening=false;
      env.clearTimeout?.(snapTimer);snapTimer=null;
      if(scrollRestoration)history.scrollRestoration=scrollRestoration;
    }
    function syncCamera(){
      const previouslyActive=active;
      progress=fullscreenLocked?1:scrollDistance?Math.max(0,Math.min(1,env.scrollY/scrollDistance)):1;
      let entryScroll=null;
      if(!fullscreenLocked&&!reopening&&env.scrollY>=scrollDistance-1){
        progress=1;
        entryScroll=Math.max(0,env.scrollY-scrollDistance);
        lockBanner();
      }
      if(reduced.matches&&!fullscreenLocked)progress=0;
      if(progress<=.001)reopening=false;
      const rect=hero.getBoundingClientRect();
      if(progress>=1)fromBanner=true;else if(progress<=.001)fromBanner=false;
      active=progress<1;closing=progress>0&&progress<1;bannerHeight=rect.height;
      layer.style.setProperty?.('--pool-graphics-opacity',String(1-.45*progress*progress*(3-2*progress)));
      if(progress<=.05&&lowDensity){swimmers=fullLaneSwimmers();lowDensity=false;drainBounds=null;}
      if(active){
        if(mountedInBanner){doc.body.append(layer);mountedInBanner=false;}
        Object.assign(layer.style,{position:'fixed',inset:'0',zIndex:'1000'});
        const target={left:rect.left,right:rect.right,width:rect.width,height:rect.height,top:rect.top+env.scrollY-scrollDistance,bottom:rect.bottom+env.scrollY-scrollDistance};
        const camera=cameraAtProgress(progress,target,width,height);
        scene.style.transform=camera.transform;layer.style.clipPath=camera.clipPath;currentZoom=camera.zoom;
      }else{
        Object.assign(layer.style,{position:'absolute',inset:'0',zIndex:'10',clipPath:'none'});
        if(!mountedInBanner){hero.append(layer);mountedInBanner=true;}
        if(fullscreenLocked)spacer.style.height='0px';
        scene.style.transform=poolTransition({left:0,top:0,width:rect.width,height:rect.height},width,height).transform;
        currentZoom=cameraZoom;
        if(!lowDensity){lowDensity=true;drainBounds={top:height/2-bannerHeight/(2*cameraZoom),bottom:height/2+bannerHeight/(2*cameraZoom)};}
      }
      button.hidden=!active;button.style.opacity=String(1-progress*.4);
      reopenButton.hidden=!fullscreenLocked;
      if(entryScroll!==null)env.scrollTo({top:entryScroll,behavior:'instant'});
      if(active!==previouslyActive)visibility();
    }
    function scheduleCamera(){
      if(env.setTimeout){
        env.clearTimeout(snapTimer);
        snapTimer=env.setTimeout(settleCamera,80);
      }
      if(cameraFrame)return;
      cameraFrame=env.requestAnimationFrame(()=>{cameraFrame=0;syncCamera();});
    }
    function settleCamera(){
      env.clearTimeout?.(snapTimer);snapTimer=null;
      if(fullscreenLocked||reopening)return;
      const top=snapDestination(env.scrollY,scrollDistance,fromBanner);
      if(top!==null)env.scrollTo({top,behavior:reduced.matches?'instant':'smooth'});
    }
    function enter(){
      if(fullscreenLocked)return;
      // Explicit entry docks the overlay before asking the browser to scroll.
      lockBanner();
      syncCamera();
      env.scrollTo({top:0,behavior:'instant'});
      doc.querySelector('.page-tab.active')?.focus?.({preventScroll:true});
    }
    button.addEventListener('click',enter);
    layer.addEventListener('keydown',event=>{if(event.key==='Escape')enter();});
    reopenButton.addEventListener('click',()=>{
      if(!fullscreenLocked)return;
      fullscreenLocked=false;reopening=true;
      spacer.style.height=scrollDistance+'px';
      env.scrollTo({top:env.scrollY+scrollDistance,behavior:'instant'});
      env.scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'});
    });
    layer.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.pointerType==='touch'||reduced.matches||event.target.closest('button'))return;
      pressed=true;pointer={...pointerPosition(event),dx:0};
      layer.setPointerCapture?.(event.pointerId);
    });
    layer.addEventListener('pointermove',event=>{
      if(!pressed||reduced.matches)return;
      const point=pointerPosition(event),dx=point.x-pointer.x,dy=point.y-pointer.y;
      pointer={...point,dx};
      impulse={...point,dx,dy,time:env.performance.now()};
      pendingFluid={x:pointer.x/width,y:pointer.y/height,dx:(pendingFluid?.dx||0)+dx/width,dy:(pendingFluid?.dy||0)+dy/height};
    });
    const release=()=>{pressed=false;pointer=null;};
    function pointerPosition(event){const bounds=scene.getBoundingClientRect();return {x:(event.clientX-bounds.left)/currentZoom,y:(event.clientY-bounds.top)/currentZoom};}
    layer.addEventListener('pointerup',release);layer.addEventListener('pointercancel',release);layer.addEventListener('lostpointercapture',release);
    env.addEventListener('scroll',scheduleCamera,{passive:true});
    env.addEventListener('scrollend',settleCamera,{passive:true});
    env.addEventListener('resize',resize);doc.addEventListener('visibilitychange',visibility);
    if(env.IntersectionObserver)new env.IntersectionObserver(entries=>{onscreen=entries[0].isIntersecting;visibility();}).observe(hero);
    reduced.addEventListener?.('change',()=>{resize();visibility();});
    doc.fonts?.ready.then(measureLetters);
    // A restored dashboard scroll position must not skip the opening pool.
    if(env.scrollY!==0)env.scrollTo({top:0,behavior:'instant'});
    resize();visibility();
  }
  return {init,lapPose,poolTransition,cameraAtProgress,snapDestination,fullLaneSwimmers,waterDrift,canvasScale};
});
