(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else{root.LaneLineArcade=factory(root);root.LaneLineArcade.init();}
})(typeof globalThis==='object'?globalThis:this,function(env){
  const games=['reaction','quiz','pace','splits','medley','turn'],stages=new Map(),states=new Map(),scoreOrigins=new Map();
  const lanes=[
    {y:61,skin:'#c58963',cap:'#ffbd69',stroke:'free',pace:820},
    {y:91,skin:'#edbb93',cap:'#9ee7ff',stroke:'free',pace:720},
    {y:121,skin:'#905c48',cap:'#f8948b',stroke:'back',pace:880},
    {y:151,skin:'#d59a74',cap:'#b8ebae',stroke:'breast',pace:960}
  ];
  const player=1,finish=465,burstDuration=1040;
  const pixelRate=name=>name==='reaction'||name==='turn'?3:2;
  const clamp=value=>Math.max(0,Math.min(1,value));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>t*t*(3-2*t);
  // Shoulder, hip, head, knee, ankle, elbow and hand in swimmer-local coordinates.
  const turnPoses={
    open:[[11,0],[-8,1],[20,-2],[-21,2],[-34,2],[5,5],[-6,5]],
    tuck:[[7,1],[-8,0],[13,6],[7,14],[-5,15],[10,10],[5,16]],
    plant:[[10,0],[-5,1],[19,-2],[-14,-7],[-25,1],[22,-3],[34,-3]],
    stream:[[12,0],[-9,1],[21,-2],[-25,1],[-41,1],[26,-3],[42,-3]]
  };
  const approachArms=[
    [[22,-5],[42,-2]],[[19,1],[32,10]],[[9,9],[13,17]],
    [[-2,7],[-17,3]],[[-5,-9],[-17,-6]],[[12,-16],[24,-13]]
  ];
  const blendPose=(a,b,t)=>a.map(([x,y],i)=>[mix(x,b[i][0],t),mix(y,b[i][1],t)]);
  const poolView=[-1,-.035,.16,.93,495.2,9.18];
  // Punch in on the starting end, leaving room on the left for the dives.
  const reactionZoom=1.33;
  const reactionView=[-.84*reactionZoom,0,.85*reactionZoom,.65*reactionZoom,383*reactionZoom-175,56*reactionZoom-43];
  const reactionScale=[1,1.24,1.6,2].map(scale=>scale*reactionZoom);
  const skinTones=[
    ['#925d48','#ebae87'],['#bc8266','#ffe0bc'],
    ['#693e35','#bc846c'],['#9d624d','#f4be98']
  ];
  const diveDuration=lane=>lanes[lane].pace*1.04;
  const diveDistance=lane=>111-3*lane;
  const splashDuration=320;
  const reactionRun=diveDuration(lanes.length-1)+splashDuration;
  let selected='reaction',frame=0,start=0,last=0,audio=null,muted=false;
  try{muted=env.localStorage?.getItem('laneline-arcade-muted')==='true';}catch{}
  const reduced=()=>Boolean(env.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function visible(){return !env.document.hidden&&env.document.getElementById('training-page')?.style.display!=='none';}
  function unlockAudio(){
    if(muted)return;
    try{const Context=env.AudioContext||env.webkitAudioContext;if(!audio&&Context)audio=new Context();audio?.resume?.()?.catch?.(()=>{});}catch{}
  }
  function cue(kind){
    if(muted||!audio||audio.state!=='running')return;
    try{
      const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(kind==='go'?880:kind==='success'?660:220,now);
      if(kind==='success')oscillator.frequency.linearRampToValueAtTime(990,now+.12);
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.07,now+.008);gain.gain.exponentialRampToValueAtTime(.001,now+.17);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+.18);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }catch{}
  }
  function setMuted(value){muted=Boolean(value);try{env.localStorage?.setItem('laneline-arcade-muted',String(muted));}catch{}if(!muted)unlockAudio();}
  function pixelSwimmer(ctx,x,y,time,lane,stroke,pose,scale=1,pitch=0){
    const {skin,cap}=lanes[lane];
    // Draw side-profile sprites in screen space so the tilted pool does not skew them.
    const box=(dx,dy,w,h,color)=>{
      const left=Math.round(x-(dx+w)*scale),top=Math.round(y+dy*scale);
      ctx.fillStyle=color;ctx.fillRect(left,top,Math.round(x-dx*scale)-left,Math.round(y+(dy+h)*scale)-top);
    };
    if(pose==='launch'){
      // All limbs follow the same pitched axis from pointed toes to stacked hands.
      const strip=(from,to,top,height,color)=>{
        ctx.fillStyle=color;
        for(let col=Math.round(x-to*scale);col<Math.round(x-from*scale);col++){
          const axis=y+(x-col)*pitch;
          ctx.fillRect(col,Math.round(axis+top*scale),1,Math.round(axis+(top+height)*scale)-Math.round(axis+top*scale));
        }
      };
      strip(-30,-25,-1,3,skin);strip(-27,-9,-3,6,skin);
      strip(-25,-11,1,1,'#875340');
      strip(-13,-2,-4,8,'#244d6d');strip(-12,-3,-3,2,'#52738e');
      strip(-3,8,-4,8,skin);strip(5,12,-4,7,skin);strip(-2,8,-3,2,'#efbc99');
      strip(10,16,-3,7,skin);strip(9,16,-4,4,cap);
      strip(13,16,0,1.5,'#173752');
      strip(7,24,-5,4,skin);strip(10,25,-2,3,skin);
      strip(11,24,-2,1,'#875340');strip(23,28,-4,4,skin);
      strip(9,23,-5,1,'#efbc99');
      strip(-10,-5,2,1,'#52738e');strip(11,14,-4,1,'#e4f6fa');
      return;
    }
    if(pose==='swim'||pose==='dive'){
      const phase=Math.floor(time/115+lane)%4,glide=pose==='dive'||(stroke==='breast'&&phase<2);
      const bob=!glide&&(stroke==='fly'||stroke==='breast')&&phase===2?-2:0;
      box(-15,2,21,3,'#126b96');box(-13,!glide&&phase%2?1:-2,9,3,skin);
      box(-6,-3,13,6,cap);box(-6,1,13,2,'#235979');
      box(-5,1,9,.5,'#7ba9bb');
      box(5,-5+bob,8,7,skin);box(5,-7+bob,7,4,cap);box(10,-3+bob,3,2,'#142f55');
      box(7,-7+bob,3,.5,'#e4f6fa');box(11,-3+bob,1,.5,'#92cedd');
      if(glide){box(12,-2,8,2,skin);box(13,1,6,2,skin);}
      else if(stroke==='back'){box(2,-7,3,6,skin);box(-3,-8,7,2,skin);}
      else if(phase<2){box(7,-5,8,2,skin);box(13,-3,3,3,skin);}
      else{box(-2,-7+bob,8,2,skin);box(-3,-5+bob,3,3,skin);}
      return;
    }
    drawBlockSwimmer(ctx,x,y,lane,scale,pose==='set');
  }
  function drawBlockSwimmer(ctx,x,y,lane,scale,set){
    const {skin,cap}=lanes[lane], [shade,light]=skinTones[lane];
    const suit='#244d6d',goggles='#173752';
    // Rasterize rounded silhouettes on the canvas pixel grid, including tapered limbs.
    const shape=(left,top,right,bottom,color,inside)=>{
      ctx.fillStyle=color;
      for(let py=Math.floor((y+top*scale)*3);py<Math.ceil((y+bottom*scale)*3);py++){
        let first=null,last=null;
        for(let px=Math.floor((x-right*scale)*3);px<Math.ceil((x-left*scale)*3);px++){
          if(!inside((x-(px+.5)/3)/scale,((py+.5)/3-y)/scale))continue;
          if(first===null)first=px;
          last=px;
        }
        if(first!==null)ctx.fillRect(first/3,py/3,(last-first+1)/3,1/3);
      }
    };
    const oval=([cx,cy],rx,ry,color)=>shape(cx-rx,cy-ry,cx+rx,cy+ry,color,
      (u,v)=>((u-cx)/rx)**2+((v-cy)/ry)**2<=1);
    const segment=([ax,ay],[bx,by],a,b,color)=>{
      const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,r=Math.max(a,b);
      shape(Math.min(ax,bx)-r,Math.min(ay,by)-r,Math.max(ax,bx)+r,Math.max(ay,by)+r,color,(u,v)=>{
        const t=clamp(((u-ax)*dx+(v-ay)*dy)/length);
        return (u-ax-t*dx)**2+(v-ay-t*dy)**2<=mix(a,b,t)**2;
      });
    };
    const hip=set?[-5,-19]:[-1,-16],shoulder=set?[4,-16]:[0,-24];
    const head=set?[8,-16.5]:[1,-29],knee=set?[3,-10]:[.5,-9],ankle=set?[2,-2]:[1.5,-2];
    const farKnee=set?[-7,-10]:[-4,-9],farAnkle=set?[-9,-5]:[-4,-2];
    const elbow=set?[5.5,-8]:[.5,-17],hand=set?[8.5,-1.5]:[2,-12];
    segment(hip,farKnee,2.5,1.6,shade);segment(farKnee,farAnkle,1.6,1,shade);
    oval([farAnkle[0]+1,farAnkle[1]+.7],2.4,1.15,shade);
    segment(hip,knee,2.6,1.7,skin);segment(knee,ankle,1.7,1,skin);
    oval([ankle[0]+1.5,-1.05],2.7,1.05,skin);
    segment(hip,knee,2.8,2.05,suit);
    segment(hip,shoulder,3.1,3.5,skin);
    segment([hip[0]-.6,hip[1]-1],[shoulder[0]-1,shoulder[1]-1.9],.7,.75,light);
    segment(shoulder,[head[0]-.8,head[1]+1.6],1.8,1.5,skin);
    segment([shoulder[0]-1,shoulder[1]], [elbow[0]-1.3,elbow[1]+.2],1.3,1,shade);
    segment(shoulder,elbow,1.55,1.15,skin);segment(elbow,hand,1.15,.75,skin);
    oval(hand,1.15,1.1,skin);
    oval(head,3.25,3.75,skin);
    oval([head[0]+2.7,head[1]+.5],.8,.85,skin);
    oval([head[0]-.55,head[1]-1.5],3.05,2.65,cap);
    oval([head[0]-.8,head[1]-3.1],1.65,.48,'#e4f6fa');
    segment([head[0]-2.15,head[1]-.25],[head[0]+1.65,head[1]-.1],.32,.38,goggles);
    oval([head[0]+1.95,head[1]-.05],1.05,.75,goggles);
    oval([head[0]+2.25,head[1]-.27],.38,.25,'#b9e5ef');
  }
  function drawStartingBlock(rect,text,x,y,scale,lane){
    const block=(dx,dy,w,h,color)=>rect(x+dx*scale,y+dy*scale,w*scale,h*scale,color);
    block(-7,9,16,2,'#294d69');
    block(-3,2,8,8,'#426d89');block(2,2,3,7,'#8eb2c8');
    block(-10,0,20,4,'#b6d4de');block(-10,0,20,1,'#edf6f7');
    block(-8,1,14,1,'#507891');block(5,-2,5,2,'#91adbf');
    for(let dx=-8;dx<5;dx+=3)block(dx,1,1,.5,'#a6bdc9');
    block(-2,4,1,4,'#91adbf');block(6,-2,3,.5,'#e0edf0');
    block(-9,3,18,1/3,'#6d99b2');
    for(const dx of [-8,7])block(dx,2,.6,.6,'#426d89');
    block(-9,9,20,1.1,'#203e59');block(6,4,3,1,'#779cb1');
    block(7,5,1,3,'#779cb1');block(-6,3,4,.6,'#dcebf0');
    text(lane+1,x-2*scale,y+9*scale,'#e8f5ff',Math.round(5*scale));
  }
  function drawStarter(rect,x,y,signal){
    const part=(dx,dy,w,h,color)=>rect(x+dx,y+dy,w,h,color);
    part(-9,0,21,2,'#365975');
    part(-5,-10,4,10,'#20384d');part(2,-10,4,10,'#29465c');
    part(-7,-1,6,2,'#182c3d');part(0,-1,6,2,'#182c3d');
    part(-6,-23,13,14,'#edf6f7');part(4,-21,3,12,'#b6d4de');
    part(-4,-31,8,8,'#bc8365');part(-6,-34,11,4,'#213a54');
    part(-8,-31,9,2,'#213a54');
    part(-2,-22,2,7,'#507891');part(-3,-17,4,3,'#f2c666');
    part(-9,-22,3,8,'#edf6f7');
    part(1,-21,3,1,'#779caf');part(1,-20,3,2,'#c6dde8');
    part(-4,-27,1,1,'#f2ba96');part(1,-28,2,1,'#29465c');
    part(-6,-32,11,1,'#476987');
    part(-12,signal?-29:-17,3,signal?14:5,'#bc8365');
    part(-14,signal?-32:-19,6,4,signal?'#a6eddd':'#20384d');
  }
  function drawStartLight(rect,x,y,phase){
    rect(x-7,y-2,14,3,'#365975');
    rect(x-2,y-12,4,11,'#789bac');
    rect(x-7,y-37,14,26,'#112d44');
    rect(x-6,y-36,12,1,'#789bac');
    const lamps=[
      ['falseStart','#603a48','#ff7c75'],
      ['waiting','#605333','#ffd36a'],
      ['go','#27534e','#8ef4c2']
    ];
    lamps.forEach(([active,off,on],i)=>{
      const top=y-34+i*7,lit=phase===active;
      rect(x-4,top,8,5,lit?on:off);
      if(lit)rect(x-2,top,3,1,'#f5fffa');
    });
  }
  function drawReactionDeck(rect,foreground,pan){
    if(!foreground){
      rect(0,34,512,48,'#65889b');
      rect(0,38,512,2,'#779caf');
      for(let x=(14+pan)%64-64;x<512;x+=64){
        rect(x,47,51,35,'#4e7187');rect(x+3,50,45,28,'#a4c9d5');
        rect(x+3,69,45,9,'#87b3c4');rect(x+24,50,2,28,'#638da2');
        rect(x+4,51,42,1,'#b6d4de');rect(x+9,53,2,13,'#99c8d6');
        rect(x+29,53,2,13,'#99c8d6');rect(x+3,63,45,1,'#567d94');
        rect(x+2,79,47,2,'#294d69');
        rect(x+6,52,41,2,'#c8e2e4');rect(x+15,56,1.3,12,'#c8e2e4');rect(x+34,56,1.3,12,'#c8e2e4');
        rect(x+6,73,40,.6,'#95b9c8');rect(x+1,83,49,.6,'#426880');
      }
      rect(0,82,512,3,'#294d69');
      rect(0,85,512,8,'#87aab9');
      rect(0,87,512,1,'#bed7dd');
      for(let x=(6+pan)%32-32;x<512;x+=32){
        rect(x,85,1,8,'#628a9d');rect(x+2,89,22,.6,'#a6c4cf');
      }
      return;
    }
    rect(0,167,512,2,'#365975');rect(0,169,512,3,'#e0edf0');
    rect(0,172,512,2,'#a6bdc9');
    for(let x=(12+pan)%36;x<512;x+=36)rect(x,172,1,2,'#7e9aab');
  }
  function drawPracticeLane(rect,top,height,drift=0){
    rect(0,top,512,height,'#137fac');
    rect(0,top+height*.5,512,2,'#17698f');
    for(let x=drift%38-38;x<512;x+=38){
      rect(x+4,top+13,13,1,'#5ab6cf');rect(x+22,top+height-15,8,1,'#389cc0');
    }
    for(const y of [top,top+height-4]){
      rect(0,y,512,4,'#236286');
      for(let x=0;x<512;x+=12)rect(x,y+1,8,2,x<48||x>464?'#f3ae9f':'#c7e9ee');
    }
  }
  function drawPracticeSplash(rect,x,y,progress){
    const p=clamp(progress),fade=Math.sin(Math.PI*p);
    for(let i=0;i<9;i++){
      const offset=10+i*3+20*p,rise=(5+i%3*3)*fade;
      rect(x+offset,y-rise+(i%2)*7,2+i%3,1+i%2,i%2?'#ddf8fa':'#91d6e8');
    }
  }
  function drawQuizBoard(ctx,rect,text,state,elapsed){
    rect(0,0,512,192,'#153845');
    const total=state.total||5,score=state.score||0,index=state.index||0,answered=state.chosen!=null;
    const missed=answered&&state.chosen!==state.question?.answer;
    const sprint=answered&&!missed&&!state.complete&&score>0;
    const progress=ease(clamp(elapsed/680)),stride=sprint?score-1+progress:score;
    const step=350/total,x=438-step*stride;
    drawPracticeLane(rect,58,83);
    for(let i=1;i<=total;i++){
      const marker=438-i*step,cleared=i<=stride+.001;
      const next=i===score+1&&!state.complete;
      rect(marker-1,62,2,75,cleared?'#91d9c0':next&&missed?'#f3ae9f':'#5aafc7');
      rect(marker-8,64,16,14,cleared?'#266d63':'#245670');
      text(i,marker-3,75,cleared?'#c8ffdf':'#e9f6fc',10);
    }
    if(sprint&&progress<1)drawPracticeSplash(rect,x,105,clamp(elapsed/680));
    const stumble=missed&&!state.complete?Math.sin(elapsed*.025)*3*(1-clamp(elapsed/400)):0;
    pixelSwimmer(ctx,x+stumble,108,sprint&&progress<1?elapsed*1.65:0,player,'free',sprint&&progress<1?'swim':'dive',1.65);
    text('SWIM QUIZ',28,37,'#e8f5ff',20);
    text(score+' / '+total+' CHECKPOINTS',322,36,'#b7e8da',12);
    const verdict=state.complete?'ROUND COMPLETE':answered?(missed?'MISSED':'CORRECT'):'QUESTION '+(index+1)+' / '+total;
    text(verdict,28,173,missed&&!state.complete?'#ffc5b7':'#e8f5ff',13);
    text('BEST '+(state.best||0)+' / '+total,388,173,'#b7e8da',12);
  }
  function drawPaceBoard(ctx,rect,text,state,elapsed){
    rect(0,0,512,192,'#25394d');
    const running=state.phase==='running',result=state.phase==='result'?state.last:null;
    const glide=result?ease(clamp(elapsed/420)):0;
    drawPracticeLane(rect,48,74,running?elapsed*.06:0);
    const swimmerX=running?256+Math.sin(elapsed*.0019)*6:result?256-34*glide:305;
    if(running)drawPracticeSplash(rect,swimmerX,91,(elapsed%550)/550);
    if(result&&glide<1)drawPracticeSplash(rect,swimmerX,91,clamp(elapsed/420));
    pixelSwimmer(ctx,swimmerX,87,running?elapsed:0,player,'free',running?'swim':'dive',1.7);
    text('PACE CLOCK',28,31,'#e8f5ff',16);
    text('TARGET '+(state.target??5)+'s',380,30,'#d9eefb',12);
    text(result?'STOPPED':running?'CLOCK HIDDEN':'READY',28,166,'#d9eefb',12);
    text(result?(result.elapsed/1000).toFixed(2)+'s':running?'--.--':'0.00s',357,174,result?'#c5f1dc':'#ffe29f',24);
    if(result){
      const marker=clamp(.5+result.error/Math.max(1000,state.target*1000)*ease(clamp(elapsed/450)));
      rect(90,133,332,4,'#526680');rect(255,128,2,14,'#eef6ff');
      for(let x=90;x<=422;x+=16.6)rect(x,137,1,3,'#8498ad');
      rect(90+330*marker,129,4,12,result.error?'#ffaf84':'#a6eddd');
      text('EARLY',90,151,'#bfafdb',10);text('LATE',398,151,'#bfafdb',10);
    }else text('BEST '+(state.best==null?'--':state.best+' ms'),28,145,'#b7d1e6',12);
  }
  function drawTurnSwimmer(rect,x,y,angle,pose,{facingLeft=false,scale=1,farArm,profile=1}={}){
    const [shoulder,hip,head,knee,ankle,elbow,hand]=pose;
    const skin='#edbb93',shade='#b17962',light='#ffe0bc';
    const cos=Math.cos(angle),sin=angle===Math.PI?0:Math.sin(angle),facing=facingLeft?-1:1;
    const spot=([a,b],w,h,color)=>{
      const left=x+(cos*a*facing-sin*b*profile-w/2)*scale,clipped=Math.max(59,left);
      const width=left+w*scale-clipped;
      if(width>0)rect(clipped,y+(sin*a*facing+cos*b*profile-h/2)*scale,width,h*scale,color);
    };
    const segment=(a,b,w,color,endWidth=w)=>{
      const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*1.5));
      for(let i=0;i<=steps;i++){
        const t=i/steps,width=mix(w,endWidth,t);
        spot([mix(a[0],b[0],t),mix(a[1],b[1],t)],width,width,color);
      }
    };
    const offset=([a,b],dy)=>[a,b+dy];
    segment(hip,offset(knee,-4),6,shade);segment(offset(knee,-4),offset(ankle,-5),4.5,shade);
    const [farElbow,farHand]=farArm||[offset(elbow,-3),offset(hand,-3)];
    segment(shoulder,farElbow,5,shade,3.5);segment(farElbow,farHand,3.5,shade,2.5);
    spot([ankle[0]-1,ankle[1]-5],4,4.5,shade);spot([ankle[0]-2,ankle[1]-5],2,3,'#d7a489');
    segment(hip,knee,7,skin);segment(knee,ankle,5,skin);
    spot([ankle[0]-1,ankle[1]+1],4,4.5,skin);spot([ankle[0]-2,ankle[1]+1],2,3,light);
    segment(hip,shoulder,9,skin,12);segment(hip,offset(hip,-2),10,'#173e63');
    segment(offset(hip,4),offset(shoulder,4),1.7,'#d29878');
    spot(offset(hip,-3),6,2,'#6383a3');segment(offset(hip,1),offset(shoulder,1),2,light);
    spot(offset(shoulder,-3),6,2.6,'#f6cca5');
    spot(head,9,9,skin);spot(offset(head,-2),10,5,'#9ee7ff');spot(offset(head,-4),7,2,'#9ee7ff');
    spot([head[0]-2,head[1]-2],5,2,'#5ca5c8');spot([head[0]+4,head[1]+2],3,2,'#d29878');
    spot([head[0]+1,head[1]-4],6,1.5,'#e6fbff');spot([head[0]+3,head[1]],4,2,'#15334c');
    spot([head[0]-1,head[1]],4.5,.7,'#345a71');
    spot([head[0]+4,head[1]-.5],1,1,'#b7eff7');
    segment(shoulder,elbow,6,skin,4.5);segment(elbow,hand,4.5,skin,3);spot(hand,4,2.5,light);
    spot([hand[0]+1.4,hand[1]+.4],2.3,.65,'#d29878');
    segment(offset(shoulder,-2),offset(elbow,-1),.75,light);
  }
  function turnApproach(progress,target){
    const reach=clamp(progress/target),cycle=progress*13.5,index=Math.floor(cycle),blend=ease(cycle-index);
    const stroke=offset=>blendPose(approachArms[(index+offset)%6],approachArms[(index+offset+1)%6],blend);
    const pullIn=ease(clamp((reach-.72)/.28)),arms=turnPoses.open.slice(5);
    const pose=[...turnPoses.open.slice(0,5),...blendPose(stroke(0),arms,pullIn)];
    pose[4]=[pose[4][0],pose[4][1]+Math.sin(cycle*Math.PI)*2*(1-pullIn)];
    return {x:410-314*reach,pose,farArm:blendPose(stroke(3),arms,pullIn)};
  }
  function drawApproachWake(rect,x,progress){
    const flow=progress*48;
    for(let i=0;i<14;i++){
      const tail=progress?(i*13+flow)%166:i*13;
      const dx=x+28+tail,dy=54+Math.sin(tail*.13)*3+i%3*4;
      const color=tail<64?'#bdeef1':tail<115?'#79c9df':'#4ca1be';
      rect(dx,dy,Math.max(2,11-tail*.05),.7,color);
      if(tail<92){
        rect(dx+3,dy+3,1,1.3,color);
        rect(dx+6,dy-3,1,.7,'#8ed5e3');
      }
    }
  }
  function drawTurn(rect,text,state){
    const {phase='idle',progress=0,cue=false}=state,approach=phase==='approach',flip=phase==='flip';
    const pushing=phase==='pushOff'||phase==='result',motion=reduced()?(cue?1:0):progress;
    rect(0,0,512,192,'#12354a');rect(0,36,512,122,'#167fae');
    for(let y=57;y<156;y+=16){rect(59,y,453,1,'#237fa3');for(let x=67+y%28;x<512;x+=28)rect(x,y,1,16,'#237fa3');}
    for(let y=53;y<152;y+=13)for(let x=69+(y%17);x<512;x+=27){
      rect(x,y,5,.5,'#479fbb');rect(x+4,y+1,6,.5,'#479fbb');rect(x+10,y+2,3,.5,'#479fbb');
    }
    rect(59,36,453,5,'#85d6e5');rect(59,44,453,4,'#2ca9cb');
    rect(59,48,453,4,'#298fb4');
    for(let x=61;x<512;x+=12){
      rect(x,37,8,1/3,'#e2f9fa');rect(x+4,41,5,.7,'#58bad4');
      rect(x,148,9,3,'#103f60');rect(x+1,148,6,.7,'#d4ede9');rect(x+8,149,4,1.3,'#5da4b5');
    }
    rect(72,129,440,5,'#155b82');rect(72,116,5,32,'#155b82');
    for(let x=74;x<512;x+=19){rect(x,49+x%3,10,1,'#76c9de');rect(x+5,140,8,1,'#3e9db9');}
    rect(0,35,59,123,'#386883');rect(47,35,12,123,'#d4c083');
    for(let y=41;y<156;y+=12)rect(48,y,10,1,'#988658');
    for(let y=44;y<156;y+=12){rect(3,y,43,.5,'#7599aa');rect(y%24?24:14,y,1,11,'#315b77');}
    rect(0,35,59,4,'#eef3de');rect(55,67,4,56,cue?'#ffe291':'#cca951');
    rect(55,67,1/3,56,'#ffe8a7');
    for(let y=71;y<123;y+=5)rect(56,y,2,1/3,'#a0834d');
    rect(9,47,26,20,'#213f57');rect(10,48,24,17,'#d2e4e4');
    text('2',18,61,'#234a65',12);
    for(const y of [79,115,140]){
      rect(30,y,15,7,'#2b536b');rect(31,y,13,1,'#83a5b4');
      for(let x=33;x<44;x+=3)rect(x,y+2,1,4,'#173f5a');
    }
    for(const y of [71,119]){rect(51,y,2,2,'#a58d55');rect(51,y,1,.7,'#e6d6a0');}
    text('FLIP TURN',16,23,'#e8f5ff',14);
    const message={idle:'READY',approach:cue?'TUCK NOW':'APPROACH',flip:cue?'PUSH NOW':'TUCK',pushOff:'STREAMLINE',result:'TURN COMPLETE',miss:'MISSED TURN'};
    text(message[phase],327,23,cue?'#ffe291':'#a6d8e6',13);
    if(approach||phase==='idle'){
      const {x,pose,farArm}=turnApproach(approach?motion:0,state.windowTarget||1);
      drawApproachWake(rect,x,motion);
      drawTurnSwimmer(rect,x,54,0,pose,{facingLeft:true,scale:1.23,farArm});
    }else if(flip||pushing){
      const rotation=flip?clamp(motion/state.windowStart):1,angle=Math.PI*(1-ease(rotation));
      const entry=turnApproach(state.entry??1,state.approachTarget??1);
      const curl=ease(clamp(rotation/.55));
      const launch=flip?0:phase==='result'?1:motion,travel=237*ease(launch);
      // The first 16 pixels extend the legs while both feet stay on the wall.
      const extension=clamp(travel/16),glide=clamp((travel-16)/221);
      const x=flip?mix(entry.x,87,ease(rotation)):87+travel;
      const y=54+37*rotation+12*Math.sin(angle)-5*ease(glide);
      const pose=flip?(rotation<.55?blendPose(entry.pose,turnPoses.tuck,curl):
        blendPose(turnPoses.tuck,turnPoses.plant,ease((rotation-.55)/.45))):blendPose(turnPoses.plant,turnPoses.stream,extension);
      if(pushing&&glide>0)for(let i=0;i<11;i++){
        const bx=x-43-i*7-glide*8,by=y-7+(i%4)*4;
        if(bx>60){rect(bx,by,2.5,1.5,'#a5e6f3');rect(bx+.5,by+1,2,1,'#499fb9');}
      }
      const farArm=flip&&curl<1?blendPose(entry.farArm,pose.slice(5).map(([a,b])=>[a,b-3]),curl):undefined;
      if(flip&&rotation<.3)drawApproachWake(rect,x,state.entry??1);
      drawTurnSwimmer(rect,x,y,angle,pose,{scale:flip?mix(1.23,1,ease(rotation)):1,profile:flip?mix(-1,1,curl):1,farArm});
    }else if(phase==='miss'){
      const p=reduced()?1:progress,late=state.miss?.reason==='late';
      if(state.miss?.stage==='approach'){
        const start=turnApproach(state.missAt??1,state.approachTarget??1);
        const x=late?96-19*Math.sin(p*Math.PI):start.x-18*ease(p);
        const y=54+18*ease(p);
        const pose=blendPose(start.pose,turnPoses.tuck,ease(p));
        drawTurnSwimmer(rect,x,y,-.35*ease(p),pose,{facingLeft:true,scale:1.23});
        if(late&&p<.8)for(let i=0;i<7;i++)rect(61+i*3,54-i%3*4-9*p,2,2,'#ffe0a3');
      }else{
        const pose=blendPose(turnPoses.plant,turnPoses.tuck,ease(p));
        drawTurnSwimmer(rect,87+10*ease(p),91+22*ease(p),.26*ease(p),pose);
        for(let i=0;i<4;i++)rect(73+i*5,87-18*p+i%2*4,2,2,'#a5e6f3');
      }
    }
    rect(0,158,512,34,'#102c42');
    if(approach||flip){
      rect(19,172,474,7,'#315a70');
      rect(19+474*state.windowStart,172,474*(1-state.windowStart),7,'#9b8049');
      for(let tick=0;tick<=20;tick++)rect(19+tick*23.7,179,1,tick%5===0?5:2,'#63889a');
      rect(19+474*state.windowTarget,169,2,13,'#ffe291');
      rect(19+472*progress,169,3,13,cue?'#fff0b0':'#d9f2f6');
    }else text('TUCK  /  PLANT  /  PUSH',19,180,'#a6d8e6',11);
  }
  function draw(name,state,elapsed){
    const stage=stages.get(name);if(!stage)return;
    const {ctx,canvas}=stage,rate=pixelRate(name);ctx.imageSmoothingEnabled=false;
    ctx.setTransform(rate,0,0,rate,0,0);
    const reaction=name==='reaction',phase=state.phase||'idle';
    const go=phase==='go',result=phase==='result',early=phase==='falseStart';
    const cueClock=go?elapsed:result?elapsed+(state.last||0):0;
    const playerProgress=reaction&&(result||early)?clamp(elapsed/diveDuration(player)):0;
    const travel=Math.abs(reactionView[0])*diveDistance(player)*playerProgress;
    // Let lane 2 move left from the blocks before settling into the tracking shot.
    const pan=Math.round(travel-105*(-Math.expm1(-travel/105)));
    const view=reaction?reactionView:poolView;
    const [a,b,c,d,e,f]=view;
    const project=(x,y)=>({x:a*x+c*y+e+pan,y:b*x+d*y+f});
    const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x*rate)/rate,Math.round(y*rate)/rate,w,h);};
    const text=(value,x,y,color='#e8f5ff',size=10)=>{ctx.fillStyle=color;ctx.font='bold '+size+'px monospace';ctx.fillText(String(value),x,y);};
    if(name==='turn'){
      drawTurn(rect,text,state);canvas.setAttribute('aria-label','Side view of the flip turn at the pool wall');return;
    }
    if(name==='quiz'||name==='pace'){
      const pace=name==='pace';
      (pace?drawPaceBoard:drawQuizBoard)(ctx,rect,text,state,elapsed);
      canvas.setAttribute('aria-label',pace?'Pace clock pool lane':'Swim quiz checkpoint sprint');
      return;
    }
    rect(0,0,512,192,'#15334c');rect(0,0,512,34,'#365975');
    for(let row=0;row<2;row++)for(let i=0;i<36;i++){
      const x=i*14+5,y=5+row*13;rect(x,y+4,8,6,['#84c8df','#efb773','#ed9388','#b2dca6'][i%4]);rect(x+2,y,4,4,'#e7bc98');
      rect(x+1,y+8,6,1,'#526e8c');rect(x+3,y+1,2,.5,'#f9d6b5');
    }
    rect(0,34,512,140,'#638397');
    if(reaction)drawReactionDeck(rect,false,pan);
    ctx.save();ctx.transform(a,b,c,d,e+pan,f);
    rect(22,38,469,8,'#b6d4de');
    for(let x=26;x<490;x+=24)rect(x,38,1,8,'#789bac');
    lanes.forEach(({y,cap},lane)=>{
      const laneColor=name==='medley'?['#29719c','#266b80','#30638e','#286d8d'][lane]:lane===player?'#1a90be':'#167fae';
      rect(36,y-15,449,30,laneColor);
      rect(50,y+1,421,2,'#136892');rect(462,y-5,2,14,'#136892');
      for(let x=54;x<473;x+=37){const shift=Math.round(Math.sin(elapsed*.002+x*.03+lane));rect(x+shift,y-9,7,1,'#57b8d5');rect(x+14,y+8+shift,5,1,'#319fc8');}
      for(let x=36;x<483;x+=10){
        rect(x,y+13,7,2,x<76||x>446?'#e98d84':lane%2?'#a3e8ed':'#f0c979');
        rect(x+1,y+13,5,.5,'#f4ecd4');
        rect(x+7,y+14,3,.5,'#527e96');
      }
      for(let x=65;x<468;x+=23){
        rect(x,y+5,9,.5,'#529eb8');rect(x+7,y+6,4,.5,'#529eb8');rect(x+4,y-4,6,.5,'#4ca1be');
      }
      if(reaction){
        for(let x=43;x<476;x+=15){
          const shimmer=Math.round(Math.sin(x*.13+lane+elapsed*.004)*2);
          rect(x,y-5+shimmer,5,1,'#41a9cb');rect(x+3,y+5-shimmer,9,1,'#2796c0');
          rect(x+6,y+9+shimmer,2,1,'#63c3dc');
        }
      }
      if(name!=='reaction'){
        rect(11,y+3,23,8,'#365975');rect(9,y,24,7,'#e3eff2');rect(11,y+1,19,2,'#89b4c8');
        for(let x=12;x<29;x+=3)rect(x,y+1,1,1.5,'#b6d4de');
      }
      rect(492,y-3,7,7,cap);
    });
    for(let y=46;y<166;y+=4){
      rect(480,y,4,4,y%8===2?'#edf6f7':'#213a54');
      rect(484,y,4,4,y%8===2?'#213a54':'#edf6f7');
    }
    if(name==='reaction'){
      rect(34,46,4,120,'#d0e7ec');
      rect(29,46,5,120,'#3a6683');
    }
    rect(36,166,452,3,'#d0e7ec');rect(36,169,452,6,'#365975');
    ctx.restore();
    if(name!=='reaction')lanes.forEach(({y},lane)=>{const block=project(19,y+14);text(lane+1,block.x,block.y,'#e8f5ff',8);});
    rect(0,174,512,18,'#15334c');
    const title={reaction:'START LINE',splits:'SPLIT SPRINT',medley:'MEDLEY BUILDER'}[name];
    rect(176,2,165,25,'#102c4a');text(name==='reaction'&&state.phase==='go'?'GO!':title,187,19,'#f7dd83',12);
    const time=env.performance?.now?.()||0,progress=clamp(elapsed/750);
    function swimmer(lane,x,pose='swim',stroke=lanes[lane].stroke,moving=false,lift=0,pitch=0){
      const y=lanes[lane].y;
      if(moving)for(let dot=0;dot<4;dot++){
        const trail=x-18-dot*5-(Math.floor(elapsed/34)%4);
        if(trail>38){const point=project(trail,y+(dot%2?5:-4));rect(point.x,point.y,dot%2?2:4,1,dot%2?'#9de1ed':'#d9f2f6');}
      }
      const point=project(x,y);
      pixelSwimmer(ctx,point.x,point.y-lift,time,lane,stroke,x>=finish?'dive':pose,name==='reaction'?reactionScale[lane]:1,pitch);
    }
    const status=(label,value)=>{text(label,12,187,'#fff4c9',11);if(value)text(value,358,187,'#c4e9f7',10);};
    if(name==='reaction'){
      const starter=project(72,43);
      const signal=go||result&&cueClock<450?'go':phase;
      drawStartLight(rect,starter.x-32,starter.y+2,signal);
      drawStarter(rect,starter.x,starter.y+2,phase==='waiting'||signal==='go'&&cueClock<200);
      for(let light=0;light<3;light++)rect(374+light*19,9,12,12,go?'#a6eddd':phase==='waiting'?'#f2c666':early?'#f29689':'#6c8ba4');
      lanes.forEach(({y},lane)=>{
        const scale=reactionScale[lane],block=project(22,y),platform=block.y-6*scale;
        drawStartingBlock(rect,text,block.x,platform,scale,lane);
        const clock=lane===player?(result||early?elapsed:0):cueClock;
        const flight=clamp(clock/diveDuration(lane)),x=22+diveDistance(lane)*flight;
        if(!clock){
          const set=phase==='waiting'||go||result||early;
          swimmer(lane,22,set?'set':'ready','free',false,6*scale);
        }else if(flight<1){
          const lift=(18*(1-flight)+14*Math.sin(flight*Math.PI))*scale;
          swimmer(lane,x,'launch','free',false,lift,.14+.43*flight);
        }else{
          const splash=clamp((clock-diveDuration(lane))/splashDuration);
          if(splash<1){
            const point=project(x,y),entry=point.x-25*scale,spread=10+18*splash;
            rect(entry-spread,point.y+2,2*spread,2,splash<.65?'#a5e6f3':'#57b8d5');
            for(let i=0;i<7;i++){
              const rise=(4+i%3*4)*Math.sin(Math.PI*splash);
              rect(entry+(i-3)*spread/3,point.y-rise,2+i%2,2,'#e3f6fa');
            }
          }
        }
      });
      status(go?'GO!':phase==='waiting'?'SET':early?'FALSE START':result?(playerProgress===1?'WATER ENTRY':'DIVING'):'READY',result?state.last+' ms':'YOU: LANE 2');
    }else if(name==='medley'){
      const strokes={Butterfly:'fly',Backstroke:'back',Breaststroke:'breast',Freestyle:'free'};
      (state.order||['Butterfly','Backstroke','Breaststroke','Freestyle']).forEach((stroke,index)=>{
        const y=lanes[index].y,x=138+(state.solved?progress*(finish-138):0);
        const label=project(48,y+3);
        const correct=state.correct?.[index];
        swimmer(index,x,'swim',strokes[stroke],state.solved&&progress<1);
        rect(label.x-92,label.y-11,91,16,correct?'#193f46':'#193953');
        const missed=state.moves>0&&!correct,flash=missed&&elapsed<360&&Math.floor(elapsed/90)%2===0;
        rect(label.x-92,label.y-11,3,16,correct?'#a6eddd':flash?'#ec9b87':lanes[index].cap);
        text((index+1)+' '+stroke.toUpperCase(),label.x-85,label.y,correct?'#a6eddd':'#e8f5ff',9);
      });
      status(state.solved?'MEDLEY COMPLETE':state.mode==='relay'?'MEDLEY RELAY':'INDIVIDUAL MEDLEY',(state.moves||0)+' MOVES');
    }else{
      const score=state.score||0,index=state.index||0,from=scoreOrigins.get(name)??score;
      const missed=state.chosen!=null&&state.chosen!==state.question?.answer;
      for(let mark=1;mark<=5;mark++){
        const point=project(54+mark*(finish-54)/5,lanes[player].y);
        const stalled=missed&&mark===score+1,shake=stalled?Math.sin(elapsed*.05)*3*(1-clamp(elapsed/420)):0;
        rect(point.x-6+shake,point.y-10,12,19,mark<=score?'#d59b43':stalled?'#b85e55':'#2b6e9a');
        rect(point.x-5,point.y-9,10,.5,mark<=score?'#f1c670':'#7eb2cc');
        text(mark,point.x-3,point.y+3,'#fff5d8',9);
      }
      lanes.forEach((_,lane)=>{
        const distance=lane===player?from+(score-from)*progress:Math.min(5,index*(.72+lane*.12));
        swimmer(lane,54+distance*(finish-54)/5,'swim','free',lane===player&&score>from&&progress<1);
      });
      status(state.complete?'ROUND COMPLETE':missed?'MISSED CHECKPOINT':'QUESTION '+(index+1)+' / 5',score+' / 5 CHECKPOINTS');
    }
    if(reaction)drawReactionDeck(rect,true,pan);
    canvas.setAttribute('aria-label',name==='reaction'?'Start line from the pool deck':title.toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase())+' pixel game scene');
  }
  function stop(){env.cancelAnimationFrame?.(frame);frame=0;}
  function animationDuration(){
    const phase=states.get(selected)?.phase;
    if(selected==='pace'&&phase==='running')return Infinity;
    return selected==='reaction'&&(phase==='go'||phase==='result'||phase==='falseStart')?reactionRun:burstDuration;
  }
  function animate(now){
    frame=0;if(!visible())return;
    const elapsed=now-start;
    const duration=animationDuration();
    if(now-last>=34||elapsed>=duration){draw(selected,states.get(selected)||{},elapsed);last=now;}
    if(elapsed<duration&&!reduced())frame=env.requestAnimationFrame(animate);
  }
  function refresh(){stop();if(selected==='turn')return;start=env.performance?.now?.()||0;last=-Infinity;const duration=animationDuration();draw(selected,states.get(selected)||{},reduced()&&Number.isFinite(duration)?duration:0);if(visible()&&!reduced())frame=env.requestAnimationFrame(animate);}
  function update(name,state){
    const previous=states.get(name);states.set(name,state);
    if(name==='splits')scoreOrigins.set(name,state.score>(previous?.score||0)?previous?.score||0:state.score||0);
    if(name!==selected||!visible())return;
    if(name==='reaction'&&state.phase==='go'&&previous?.phase!=='go')cue('go');
    else if(name==='reaction'&&state.phase==='falseStart')cue('wrong');
    else if((state.solved&&!previous?.solved)||(state.chosen!==null&&state.chosen!==undefined&&previous?.chosen===null))cue(state.solved||state.chosen===state.question?.answer?'success':'wrong');
    refresh();
  }
  function select(name){if(!games.includes(name))return;selected=name;refresh();}
  function init(){
    const doc=env.document;if(!doc?.getElementById('training-page')||stages.size)return;
    for(const name of games){
      const panel=doc.getElementById('training-'+name);if(!panel)continue;
      const canvas=doc.createElement('canvas'),rate=pixelRate(name);canvas.width=512*rate;canvas.height=192*rate;canvas.className='arcade-stage';canvas.setAttribute('role','img');
      const ctx=canvas.getContext('2d');if(!ctx)continue;panel.prepend(canvas);stages.set(name,{canvas,ctx});draw(name,{},0);
      if(name==='reaction'){canvas.className+=' arcade-interactive';canvas.title='Start or react';canvas.addEventListener('click',()=>doc.getElementById('reaction-pad').click());}
      if(name==='turn'){canvas.className+=' arcade-interactive';canvas.title='Tuck or push';canvas.addEventListener('click',()=>doc.getElementById('turn-pad').click());}
    }
    const sound=doc.getElementById('training-sound');
    if(sound){sound.checked=!muted;sound.disabled=!(env.AudioContext||env.webkitAudioContext);if(sound.disabled)sound.title='Sound is unavailable in this browser';sound.addEventListener('change',()=>setMuted(!sound.checked));}
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden){stop();audio?.suspend?.()?.catch?.(()=>{});}});
  }
  return {init,update,select,refresh,stop,unlockAudio,setMuted,cue,draw};
});
