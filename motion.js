(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else {root.LaneLineMotion=factory(root);root.LaneLineMotion.init();}
})(typeof globalThis==='object'?globalThis:this,function(env){
  const preference=env.matchMedia?.('(prefers-reduced-motion: reduce)');
  const running=new Map(),seen=new WeakSet(),watched=new Set();
  const ease='cubic-bezier(0.22,1,0.36,1)';
  const waterLanePositions=Array.from({length:13},(_,index)=>.04+index*.92/12);
  function bannerSwimmerScale(width){return Math.max(1,Math.min(3,Math.floor(width*.92/12/28)));}
  function bannerStrokePhase(stroke,elapsed){
    const duration={breast:1450,fly:880,free:640,back:800}[stroke]||800;
    const cycle=((elapsed%duration)+duration)%duration/duration;
    if(stroke==='breast')return cycle<.48?0:cycle<.65?1:cycle<.83?2:3;
    return Math.floor(cycle*4);
  }
  function bannerStrokePace(stroke,elapsed){
    const phase=bannerStrokePhase(stroke,elapsed);
    if(stroke==='breast')return [.04,2.1,2.7,.81][phase];
    if(stroke==='fly')return [1.92,.08,1.92,.08][phase];
    return 1;
  }
  function bannerSwimmer(laneIndex,lap,now,initial=false){
    const strokes=['free','breast','fly','back'];
    const stroke=strokes[(laneIndex+lap)%strokes.length];
    return {lane:(waterLanePositions[laneIndex]+waterLanePositions[laneIndex+1])/2,laneIndex,stroke,
      female:(laneIndex+lap)%2===1,skin:['#f6cfa3','#c48d66','#8d5d46'][(laneIndex+lap)%3],
      color:'#8cdcff',
      up:(laneIndex+lap)%2===0,start:now,duration:{free:4200,breast:5000,fly:4600,back:4400}[stroke],
      progress:initial?laneIndex*.065:0,offset:0,v:0,boost:0};
  }
  function drawBannerSwimmer(ctx,swimmer,x,y,now,scale,angle=swimmer.up?0:Math.PI){
    ctx.save();ctx.globalAlpha=swimmer.opacity??.7;ctx.translate(Math.round(x),Math.round(y));ctx.rotate(angle);
    const pixel=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x*scale,y*scale,w*scale,h*scale);};
    const skin=swimmer.skin,cap=swimmer.color,suit=swimmer.color,phase=bannerStrokePhase(swimmer.stroke,now-swimmer.start);
    if(swimmer.turnStage||swimmer.streamline){
      if(swimmer.turnStage==='tuck'){
        ctx.scale(1,1-(swimmer.tuck||0)*.4);
        pixel(-2,-6,5,3,cap);pixel(-2,-3,5,3,skin);pixel(-3,0,6,5,suit);
        pixel(-5,3,3,4,skin);pixel(3,3,3,4,skin);pixel(-4,6,4,2,skin);pixel(1,6,4,2,skin);
        if(swimmer.turnStyle==='open'){pixel(-7,-5,5,2,skin);pixel(3,-2,5,2,skin);}
        else{pixel(-4,-1,2,5,skin);pixel(3,-1,2,5,skin);}
      }else{
        pixel(-1,-7,3,3,cap);pixel(-1,-4,3,2,skin);pixel(-2,-2,5,7,skin);
        pixel(-2,3,5,5,suit);pixel(-2,8,2,8,skin);pixel(1,8,2,8,skin);
        if(swimmer.turnStage==='touch'&&swimmer.turnStyle==='flip'){
          pixel(-4,-4,2,7,skin);pixel(3,-3,2,7,skin);
        }else{pixel(-2,-15,2,13,skin);pixel(1,-15,2,13,skin);pixel(-1,-16,3,2,skin);}
      }
      ctx.restore();return;
    }
    pixel(-1,-7,3,2,cap);pixel(-2,-6,5,1,cap);pixel(-1,-5,3,2,skin);
    pixel(-2,-2,5,6,skin);pixel(-1,4,3,4,suit);pixel(-2,5,5,2,suit);
    if(swimmer.female){pixel(-2,0,5,6,suit);pixel(-2,-2,1,3,suit);pixel(2,-2,1,3,suit);}
    if(swimmer.stroke==='back'){pixel(-1,-5,3,2,skin);pixel(-1,-5,1,1,'#174668');pixel(1,-5,1,1,'#174668');}
    if(swimmer.stroke==='breast'||swimmer.stroke==='fly'){
      for(const side of [-1,1]){
        if(swimmer.stroke==='breast'){
          if(phase===0||phase===3)pixel(side<0?-2:1,-14,2,11,skin);
          else if(phase===1){pixel(side<0?-5:3,-7,3,2,skin);pixel(side<0?-6:5,-5,2,5,skin);}
          else{pixel(side<0?-4:3,-1,2,4,skin);pixel(side<0?-3:1,-2,3,2,skin);}
        }else{
          const spread=[3,9,3,8][phase],reach=[-12,-3,5,-9][phase];
          if(phase===0)pixel(side<0?-3:2,-12,2,10,skin);
          else if(phase===2)pixel(side<0?-4:3,0,2,8,skin);
          else{pixel(side<0?-spread:2,reach,spread-1,2,skin);pixel(side<0?-spread:spread,reach-2,2,3,skin);}
        }
      }
    }else{
      const arm=swimmer.stroke==='back'?[[-3,-8,-4,-10],[3,2,4,5],[-3,2,-4,5],[3,-8,4,-10]]:[[-3,-5,-5,-7],[3,1,5,3],[-3,1,-5,3],[3,-5,5,-7]];
      for(const index of phase<2?[0,1]:[2,3]){const [ax,ay,bx,by]=arm[index];pixel(ax,ay,2,4,skin);pixel(bx,by,2,3,skin);}
    }
    if(swimmer.stroke==='breast'){
      if(phase===1||phase===2){pixel(-4,8,2,4,skin);pixel(3,8,2,4,skin);pixel(-6,11,3,2,skin);pixel(4,11,3,2,skin);if(phase===2){pixel(-7,12,4,2,skin);pixel(4,12,4,2,skin);}}
      else{pixel(-1,8,2,8,skin);pixel(1,8,2,8,skin);}
    }else if(swimmer.stroke==='fly'){
      const kick=phase%2?1:0;pixel(-1-kick,8,4,4,skin);pixel(-1,12,4,phase%2?3:5,skin);pixel(-2,phase%2?14:16,5,1,skin);
    }else{pixel(-2,8,2,phase%2?7:6,skin);pixel(1,8,2,phase%2?6:7,skin);pixel(-3,phase%2?14:13,2,2,skin);pixel(2,phase%2?13:14,2,2,skin);}
    ctx.restore();
  }
  let observer,indicator,nav,activeTab,activePage;
  const chartKeys=new WeakMap();
  let celebrationActive=false;
  function celebrate(anchor){
    if(celebrationActive||reduced()||!env.document?.createElement||!anchor?.getBoundingClientRect)return false;
    celebrationActive=true;
    const bounds=anchor.getBoundingClientRect(),colors=['#268bdf','#ed7067','#ffd363','#6cc9bd'];
    const animations=[];
    for(let index=0;index<14;index++){
      const piece=env.document.createElement('span');piece.className='swim-celebration';piece.setAttribute('aria-hidden','true');
      Object.assign(piece.style,{left:bounds.left+bounds.width/2+'px',top:bounds.top+bounds.height/2+'px',background:colors[index%colors.length]});
      env.document.body.append(piece);
      const angle=index*Math.PI*2/14,distance=45+(index%4)*14;
      const animation=piece.animate?.([{transform:'translate(0,0) rotate(0deg)',opacity:1},{transform:'translate('+Math.cos(angle)*distance+'px,'+(Math.sin(angle)*distance-30)+'px) rotate('+(index*41)+'deg)',opacity:0}],{duration:550+(index%3)*65,easing:'cubic-bezier(.15,.6,.4,1)',fill:'forwards'});
      animations.push((animation?.finished||Promise.resolve()).catch(()=>{}).then(()=>piece.remove()));
    }
    Promise.all(animations).finally(()=>{celebrationActive=false;});return true;
  }
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
    const elements=root.querySelectorAll('.best-summary-card,.profile-card,.signature-event,.strength-grid .insight-row,.goal-card,.meet-option,.best-table tbody tr,.growth-chart,.growth-event-button,.peer-lane,.archetype-section,.year-layout,.standards-table tbody tr');
    elements.forEach((element,index)=>{
      if(index>=36)return;
      if(seen.has(element)||(element.getClientRects&&!element.getClientRects().length))return;
      seen.add(element);
      element.dataset.motionDelay=String(Math.min(index%6*18,90));
      if(observer){observer.observe(element);watched.add(element);}
      else if(index<12)arrive(element);
    });
  }
  function arrive(element){
    play(element,[{opacity:0,transform:'translateY(12px) scale(.992)'},{opacity:1,transform:'translateY(0) scale(1)'}],
      {duration:460,delay:Number(element.dataset.motionDelay||0),fill:'backwards'});
  }
  function enter(root,direction=1){
    if(activePage!==root)stop(activePage);
    activePage=root;
    play(root,[
      {opacity:.55,transform:`translateX(${direction*14}px)`},
      {opacity:1,transform:`translateX(${direction*2}px)`,offset:.62},
      {opacity:1,transform:'translateX(0)'}
    ],{duration:260});
    reveal(root);
  }
  function chart(container,key){
    if(!container)return;
    const changed=chartKeys.get(container)!==key;
    chartKeys.set(container,key);
    if(!changed||!key||reduced())return;
    const marks=container.querySelector('.growth-chart > g[clip-path]');
    play(marks,[{opacity:.28},{opacity:1}],{duration:340});
    play(container.querySelector('.growth-scoreboard'),[
      {opacity:.65,transform:'translateY(6px)'},{opacity:1,transform:'none'}
    ],{duration:280});
  }
  function updateTab(){
    if(!nav)return;
    const active=nav.querySelector('.page-tab.active');
    if(!active)return;
    const changed=activeTab!==active;
    const prior=changed&&indicator?.getBoundingClientRect();
    activeTab=active;
    if(!indicator){
      indicator=env.document.createElement('span');
      indicator.className='tab-motion-indicator';indicator.setAttribute('aria-hidden','true');
      nav.prepend(indicator);nav.classList.add('has-motion-indicator');
    }
    stop(indicator);
    const bounds=nav.getBoundingClientRect();
    const {offsetLeft:left,offsetTop:top,offsetWidth:width,offsetHeight:height}=active;
    Object.assign(indicator.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
    if(prior&&prior.width&&prior.height&&width&&height){
      const dx=prior.left-bounds.left-nav.clientLeft+nav.scrollLeft-left;
      const dy=prior.top-bounds.top-nav.clientTop+nav.scrollTop-top;
      play(indicator,[
        {transform:`translate(${dx}px,${dy}px) scale(${prior.width/width},${prior.height/height})`,easing:'cubic-bezier(.16,1,.3,1)'},
        {transform:`translate(${-dx*.035}px,${-dy*.035}px)`,offset:.72,easing:'ease-out'},
        {transform:'none'}
      ],{duration:360,easing:'linear'});
    }
  }
  function dialog(element){
    play(element,[{opacity:0,transform:'translateY(10px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:220});
  }
  function stepWaterRope(nodes,forces=[]){
    // Tension passes a disturbance between neighboring floats; the ends stay anchored.
    const acceleration=nodes.map((node,i)=>i===0||i===nodes.length-1?0:
      (nodes[i-1].x+nodes[i+1].x-2*node.x)*.22-node.x*.004+(forces[i]||0));
    nodes.forEach((node,i)=>{
      if(i===0||i===nodes.length-1){node.x=node.v=0;return;}
      node.v=(node.v+acceleration[i])*.95;
      node.x=Math.max(-20,Math.min(20,node.x+node.v));
    });
  }
  function waterLetterTarget(x,y,wave,pointer){
    const dx=pointer?x-pointer.x:0,dy=pointer?y-pointer.y:0;
    const distance=pointer?Math.hypot(dx,dy):Infinity;
    const push=Math.max(0,1-distance/110)*3;
    return {x:Math.max(-3,Math.min(3,wave*.25+(distance?dx/distance:0)*push)),
      y:Math.max(-4,Math.min(4,wave*.55+(distance?dy/distance:0)*push))};
  }
  function laneTransmission(from,to){
    const low=Math.min(from,to),high=Math.max(from,to);
    let crossed=0;
    for(const edge of waterLanePositions)if(edge>low&&edge<=high)crossed++;
    return Math.pow(.62,crossed);
  }
  function prepareWaterLetters(hero,selector='h1,p'){
    const doc=env.document;if(!doc.createDocumentFragment)return [];
    for(const root of hero.querySelectorAll(selector)){
      if(root.dataset.waterText)continue;root.dataset.waterText='true';
      const nodes=[];
      const collect=parent=>{for(const child of [...parent.childNodes]){if(child.nodeType===3)nodes.push(child);else if(child.nodeType===1)collect(child);}};
      collect(root);
      for(const node of nodes){
        const fragment=doc.createDocumentFragment();
        for(const word of node.textContent.split(/(\s+)/)){
          if(!word)continue;
          if(/^\s+$/.test(word)){fragment.append(doc.createTextNode(word));continue;}
          const wrapper=doc.createElement('span');wrapper.className='water-word';
          for(const character of Array.from(word)){
            const letter=doc.createElement('span');letter.className='water-letter';letter.textContent=character;wrapper.append(letter);
          }
          fragment.append(wrapper);
        }
        node.replaceWith(fragment);
      }
    }
    return [...hero.querySelectorAll('.water-letter')].map(element=>({element,x:0,y:0,baseX:0,baseY:0}));
  }
  function waterLanes(hero){
    if(!hero||!env.requestAnimationFrame)return;
    if(hero.dataset?.poolCamera==='shared')return;
    const canvas=env.document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)return;
    canvas.className='banner-water';canvas.setAttribute('aria-hidden','true');hero.prepend(canvas);
    hero.classList.add('has-water');
    let fluid=null,fluidUntil=0,pendingFluid=null,waterPressed=false,fluidPending=false,ropeFlow=null,lastFlowSample=0;
    if(env.LaneLineFluid?.create){
      const surface=env.document.createElement('canvas');surface.className='banner-fluid';surface.setAttribute('aria-hidden','true');hero.prepend(surface);
      fluidPending=true;
      const ready=engine=>{
        if(hero.isConnected===false){surface.remove();return;}
        fluid=engine;fluidPending=false;fluid.resize(width,height);hero.classList.add('has-fluid');
        if(reduced())fluid.clear();
      };
      const failed=()=>{fluidPending=false;surface.remove();};
      if(env.LaneLineFluid.createDeferred)env.LaneLineFluid.createDeferred(surface,ready,failed);
      else{try{const engine=env.LaneLineFluid.create(surface);env.requestAnimationFrame(()=>ready(engine));}catch{failed();}}
    }
    const positions=waterLanePositions;
    const letters=prepareWaterLetters(hero);
    let width=1,height=1,ropes=[],frame=0,last=0,previous=null,waves=[],visible=true;
    let swimmers=[],nextSwimmer=2500,swimmerNumber=0,lastMouseRipple=-Infinity;
    function resize(){
      const rect=hero.getBoundingClientRect();width=rect.width;height=rect.height;
      const dpr=Math.min(env.devicePixelRatio||1,1.25);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
      fluid?.resize(width,height);
      ropes=positions.map(()=>Array.from({length:33},()=>({x:0,v:0})));
      waves=[];swimmers=[];previous=null;paint(0);
      measureLetters();
    }
    function measureLetters(){
      const bounds=hero.getBoundingClientRect();
      letters.forEach(letter=>{
        const rect=letter.element.getBoundingClientRect();
        letter.baseX=rect.left+rect.width/2-bounds.left-letter.x;
        letter.baseY=rect.top+rect.height/2-bounds.top-letter.y;
      });
    }
    function moveLetters(now,reset=false){
      for(const letter of letters){
        const target=reset?{x:0,y:0}:waterLetterTarget(letter.baseX,letter.baseY,waveAt(letter.baseX,letter.baseY,now),waterPressed?previous:null);
        let x=reset?0:letter.x+(target.x-letter.x)*.2;
        let y=reset?0:letter.y+(target.y-letter.y)*.2;
        if(Math.abs(target.x)<.01&&Math.abs(x)<.08)x=0;
        if(Math.abs(target.y)<.01&&Math.abs(y)<.08)y=0;
        if(!reset&&Math.abs(x-letter.x)<.015&&Math.abs(y-letter.y)<.015)continue;
        letter.x=x;letter.y=y;
        letter.element.style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${(x*.6).toFixed(2)}deg)`;
      }
    }
    function waveAt(x,y,now){
      let displacement=0;
      for(const wave of waves){
        const distance=Math.hypot(x-wave.x,(y-wave.y)*1.15),age=now-wave.time;
        const front=distance-age*.24;
        displacement+=Math.sin(front*.075)*Math.exp(-front*front/9000)*Math.exp(-age/1800)*wave.power*laneTransmission(wave.x/width,x/width);
      }
      return displacement;
    }
    function paint(now){
      ctx.clearRect(0,0,width,height);
      // A lightweight surface remains available if WebGL is unsupported.
      if(!fluid&&!fluidPending){
      ctx.lineWidth=1;
      for(let row=0;row<10;row++){
        const y=row*height/9;ctx.beginPath();
        for(let x=0;x<=width+32;x+=32){
          const offset=Math.sin(x*.022+row*.9+now*.00035)*1.5+Math.sin(x*.009-now*.00025)+waveAt(x,y,now)*.45;
          if(x===0)ctx.moveTo(x,y+offset);else ctx.lineTo(x,y+offset);
        }
        ctx.strokeStyle=row%3===0?'rgba(81,195,223,.16)':'rgba(107,211,235,.065)';ctx.stroke();
      }
      for(let column=0;column<14;column++){
        const x=column*width/13;ctx.beginPath();
        for(let y=0;y<=height+26;y+=26){
          const offset=Math.sin(y*.029+column+now*.0003)*1.5+waveAt(x,y,now)*.5;
          if(y===0)ctx.moveTo(x+offset,y);else ctx.lineTo(x+offset,y);
        }
        ctx.strokeStyle='rgba(96,201,226,.075)';ctx.stroke();
      }
      for(const wave of waves){
        const age=now-wave.time,alpha=Math.max(0,1-age/2300)*.28;
        for(let ring=0;ring<2;ring++){
          const radius=age*.24-ring*18;if(radius<=0)continue;
          ctx.beginPath();ctx.ellipse(wave.x,wave.y,radius,radius*.72,0,0,Math.PI*2);
          ctx.strokeStyle=`rgba(160,237,255,${alpha*(1-ring*.18)})`;ctx.lineWidth=ring===0?2:1;ctx.stroke();
        }
      }
      }
      ropes.forEach((nodes,index)=>{
        const base=positions[index]*width;
        const trace=(shadow=0)=>{
          ctx.beginPath();nodes.forEach((node,i)=>{
            const fraction=i/(nodes.length-1);
            const y=fraction*height+Math.sin(now*.0012+index*.8)*5*Math.sin(fraction*Math.PI),x=base+node.x+shadow;
            if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          });
        };
        ctx.setLineDash([]);trace(4);ctx.strokeStyle='rgba(0,12,30,.35)';ctx.lineWidth=8;ctx.stroke();
        trace();ctx.lineWidth=6;ctx.strokeStyle='#167eaa';ctx.stroke();
        ctx.setLineDash([10,7]);ctx.lineDashOffset=Math.sin(now*.0012+index*.8)*9;ctx.strokeStyle=index%2?'#70d8e9':'#d0f2f7';ctx.lineWidth=5;ctx.stroke();
        ctx.setLineDash([1,16]);ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=6;ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;
      });
      for(const swimmer of swimmers){
        const progress=swimmer.progress;
        const x=swimmer.lane*width+swimmer.offset,y=swimmer.up?height+35-progress*(height+70):-35+progress*(height+70);
        drawBannerSwimmer(ctx,swimmer,x,y,now,bannerSwimmerScale(width));
      }
    }
    function tick(now){
      frame=0;
      if(reduced()||env.document.hidden||!visible)return;
      const frameInterval=waterPressed||now<fluidUntil?33:50;
      if(now-last>=frameInterval){
        const elapsed=Math.min(80,now-last||33);
        last=now;waves=waves.filter(w=>now-w.time<1900);
        if(pendingFluid){
          fluid?.splat(pendingFluid.x,pendingFluid.y,pendingFluid.dx,pendingFluid.dy);
          pendingFluid=null;fluidUntil=now+6000;
        }
        if(fluid&&now<fluidUntil)fluid.advance(elapsed/1000);
        if(fluid&&now<fluidUntil&&now-lastFlowSample>=250){
          ropeFlow=fluid.sampleRopes?.()||null;lastFlowSample=now;
        }else if(now>=fluidUntil)ropeFlow=null;
        swimmers=swimmers.filter(swimmer=>swimmer.progress<1);
        if(now>nextSwimmer||swimmers.length<2){
          const laneOrder=[0,6,3,9,1,7,4,10,2,8,5,11];
          const targetSwimmers=2+(Math.floor(now/6000)%2);
          for(let attempt=0;attempt<laneOrder.length&&swimmers.length<targetSwimmers;attempt++){
            const lane=laneOrder[swimmerNumber%laneOrder.length],lap=Math.floor(swimmerNumber/laneOrder.length);
            const initial=swimmerNumber<2;swimmerNumber++;
            if(swimmers.some(swimmer=>swimmer.laneIndex===lane))continue;
            swimmers.push(bannerSwimmer(lane,lap,now,initial));
          }
          nextSwimmer=now+800;
        }
        swimmers.forEach(swimmer=>{
          swimmer.progress+=elapsed/swimmer.duration*(1+swimmer.boost)*bannerStrokePace(swimmer.stroke,now-swimmer.start);
          swimmer.boost*=.94;
          swimmer.v=(swimmer.v-swimmer.offset*.035)*.86;
          const clearance=Math.max(1,width*.92/24-bannerSwimmerScale(width)*8-5);
          swimmer.offset=Math.max(-clearance,Math.min(clearance,swimmer.offset+swimmer.v));
        });
        ropes.forEach((nodes,index)=>{
          const forces=nodes.map((node,i)=>{
            const sampleRow=16-i/2,lower=Math.floor(sampleRow),upper=Math.ceil(sampleRow),fraction=sampleRow-lower;
            const flow=ropeFlow?(ropeFlow[lower*positions.length+index]*(1-fraction)+ropeFlow[upper*positions.length+index]*fraction):0;
            return Math.max(-.16,Math.min(.16,flow*.0015))+waveAt(positions[index]*width,i*height/32,now)*.003+
              Math.sin(now*.00045+i*.36+index)*Math.sin(i/32*Math.PI)*.001;
          });
          stepWaterRope(nodes,forces);stepWaterRope(nodes,forces);
        });
        paint(now);
        moveLetters(now);
      }
      frame=env.requestAnimationFrame(tick);
    }
    function sync(){
      if(frame)env.cancelAnimationFrame?.(frame);frame=0;last=0;
      if(env.document.hidden){waterPressed=false;previous=null;pendingFluid=null;}
      if(reduced()){waves=[];swimmers=[];pendingFluid=null;fluidUntil=0;waterPressed=false;ropeFlow=null;fluid?.clear();ropes.forEach(nodes=>nodes.forEach(node=>{node.x=node.v=0;}));paint(0);moveLetters(0,true);}
      else if(visible&&!env.document.hidden)frame=env.requestAnimationFrame(tick);
    }
    hero.addEventListener('pointermove',event=>{
      if(reduced()||env.document.hidden||event.pointerType==='touch')return;
      const rect=hero.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,now=env.performance.now();
      const dx=previous?x-previous.x:0,dy=previous?y-previous.y:0;
      const speed=Math.min(18,Math.hypot(dx,dy));
      if(!previous||now-previous.time>35){
        swimmers.forEach(swimmer=>{
          const sx=swimmer.lane*width+swimmer.offset,sy=swimmer.up?height+35-swimmer.progress*(height+70):-35+swimmer.progress*(height+70);
          const distance=Math.hypot(sx-x,sy-y);
          if(distance<100){
            const influence=1-distance/100;
            swimmer.v+=(sx>=x?1:-1)*influence*2.8;
            swimmer.boost=Math.min(1,swimmer.boost+influence*.65);
          }
        });
        if(waterPressed){
          pendingFluid={x:x/width,y:y/height,dx:(pendingFluid?.dx||0)+dx/width,dy:(pendingFluid?.dy||0)+dy/height};
        }
        if(waterPressed&&now-lastMouseRipple>=180&&(!previous||Math.hypot(dx,dy)>=6)){
          waves.push({x,y,time:now,power:1+speed*.25});if(waves.length>4)waves.shift();
          lastMouseRipple=now;
        }
        if(waterPressed)ropes.forEach((nodes,index)=>nodes.forEach((node,i)=>{
          const distance=Math.hypot(positions[index]*width+node.x-x,i*height/32-y);
          if(distance<90)node.v+=Math.max(-1.1,Math.min(1.1,dx*.06+(positions[index]*width>x?.25:-.25)))*Math.pow(1-distance/90,2);
        }));
        previous={x,y,time:now};
      }
    },{passive:true});
    hero.addEventListener('pointerdown',event=>{if(event.button===0&&!reduced()){waterPressed=true;previous=null;}},{passive:true});
    const releaseWater=()=>{waterPressed=false;previous=null;};
    hero.addEventListener('pointerleave',releaseWater);
    env.document.addEventListener('pointerup',releaseWater);
    env.document.addEventListener('pointercancel',releaseWater);
    env.document.addEventListener('visibilitychange',sync);preference?.addEventListener?.('change',sync);
    env.addEventListener?.('resize',resize);
    if(env.IntersectionObserver)new env.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:0}).observe(hero);
    resize();sync();
    env.document.fonts?.ready.then(measureLetters);
  }
  function init(){
    const doc=env.document;if(!doc)return;
    const setup=()=>{
      nav=doc.querySelector('.page-tabs');updateTab();
      const visibility=()=>doc.documentElement.classList.toggle('motion-paused',Boolean(doc.hidden));
      doc.addEventListener('visibilitychange',visibility);visibility();
      const hero=doc.querySelector('.hero');
      if(hero)play(hero.querySelector('.hero-logo'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:650});
      waterLanes(hero);
      if(env.IntersectionObserver){
        observer=new env.IntersectionObserver(entries=>{
          for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);watched.delete(entry.target);arrive(entry.target);}
        },{threshold:.08,rootMargin:'0px 0px 30px 0px'});
      }
      doc.addEventListener('change',event=>{
        if(event.target.matches?.('select,input[type="checkbox"],input[type="number"]'))
          play(event.target,[{boxShadow:'0 0 0 4px rgba(43,143,224,.22)'},{boxShadow:'0 0 0 0px rgba(43,143,224,0)'}],{duration:420});
      });
      preference?.addEventListener?.('change',()=>{
        if(reduced())for(const element of [...running.keys()])stop(element);
        updateTab();
      });
      env.addEventListener?.('resize',updateTab);
      reveal(doc.querySelector('.main'));
    };
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
  }
  return {init,enter,reveal,updateTab,chart,dialog,reduced,waterLanes,stepWaterRope,waterLetterTarget,laneTransmission,bannerSwimmer,bannerSwimmerScale,bannerStrokePhase,bannerStrokePace,drawBannerSwimmer,prepareWaterLetters,celebrate};
});
