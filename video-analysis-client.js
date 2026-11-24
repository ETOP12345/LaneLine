(function(root){
  'use strict';
  function sampleTimes(duration,maxFrames=24){const count=Math.min(maxFrames,Math.max(2,Math.ceil(duration*2)));return Array.from({length:count},(_,i)=>duration*(i+.5)/count);}
  if(typeof module!=='undefined'&&module.exports)module.exports={sampleTimes};
  if(typeof document==='undefined')return;
  let config=null,busy=false,controller=null,previewUrl='',fileVersion=0;
  const el=id=>document.getElementById(id);
  const status=(text,error=false)=>{el('video-status').textContent=text;el('video-status').classList.toggle('is-error',error);};
  async function json(response){if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Video analysis needs the LaneLine Node server; static hosting cannot run it.');const data=await response.json();if(!response.ok)throw Error(data.error||'Analysis request failed.');return data;}
  function update(){el('video-start').disabled=busy||!config?.enabled||!config?.authorized||!el('video-file').files[0]||!el('video-consent').checked;el('video-cancel').hidden=!busy;el('video-file').disabled=busy;}
  async function open(){try{config=await json(await fetch('/api/video-analysis/config',{cache:'no-store'}));el('video-access').hidden=config.authorized||!config.accessRequired;el('video-model').textContent=config.model;status(!config.enabled?'Set OPENAI_API_KEY on the server.':!config.authorized?config.accessRequired?'Enter the family access code.':'Remote access requires APP_ACCESS_CODE on the server.':'Ready');}catch(error){config=null;status(error.message,true);}update();}
  function cancel(){controller?.abort();el('video-preview')?.pause();}
  function waitEvent(target,event,signal){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('The browser could not decode this clip.')),15000);const done=error=>{clearTimeout(timer);target.removeEventListener(event,ready);target.removeEventListener('error',failed);signal?.removeEventListener('abort',aborted);error?reject(error):resolve();};const ready=()=>done(),failed=()=>done(Error('This video codec is not supported by your browser.')),aborted=()=>done(new DOMException('Canceled','AbortError'));target.addEventListener(event,ready,{once:true});target.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',aborted,{once:true});if(signal?.aborted)aborted();});}
  async function sample(file,signal){
    if(file.size>config.maxVideoSizeMb*1024*1024)throw Error(`Choose a video smaller than ${config.maxVideoSizeMb} MB.`);
    const video=document.createElement('video'),url=URL.createObjectURL(file);video.muted=true;video.playsInline=true;video.preload='auto';
    try{
      const loaded=waitEvent(video,'loadedmetadata',signal);video.src=url;video.load();await loaded;
      const duration=video.duration;if(!Number.isFinite(duration)||duration<=0||duration>config.maxDuration)throw Error(`Choose a clip up to ${config.maxDuration} seconds.`);
      if(!video.videoWidth||!video.videoHeight)throw Error('The clip has no readable video track.');
      const canvas=document.createElement('canvas'),scale=Math.min(1,config.maxImageEdge/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      const context=canvas.getContext('2d'),times=sampleTimes(duration,config.maxFrames),frames=[];
      for(const [index,time] of times.entries()){
        if(signal.aborted)throw new DOMException('Canceled','AbortError');
        const sought=waitEvent(video,'seeked',signal);video.currentTime=time;await sought;context.drawImage(video,0,0,canvas.width,canvas.height);
        frames.push({time,image:canvas.toDataURL('image/jpeg',.72)});status(`Sampling ${index+1} / ${times.length}`);
      }canvas.width=canvas.height=0;return {duration,frames};
    }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  }
  async function submit(event){
    event.preventDefault();if(busy||el('video-start').disabled)return;
    busy=true;controller=new AbortController();const version=fileVersion;update();el('video-answer').textContent='';el('video-result').hidden=true;
    try{const images=await sample(el('video-file').files[0],controller.signal);status('GPT-6.1 Sol is reviewing the sampled images...');
      const result=await json(await fetch('/api/video-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...images,question:el('video-question').value.trim()}),signal:controller.signal}));
      if(version!==fileVersion)return;el('video-answer').textContent=result.answer;el('video-result').hidden=false;status(`Complete · ${result.samples} sampled images · ${result.model}`);
    }catch(error){status(error.name==='AbortError'?'Canceled':error.message,error.name!=='AbortError');}finally{controller=null;busy=false;update();}
  }
  function init(){
    el('video-form').addEventListener('submit',submit);el('video-cancel').addEventListener('click',cancel);el('video-consent').addEventListener('change',update);
    el('video-file').addEventListener('change',()=>{fileVersion++;cancel();el('video-answer').textContent='';el('video-result').hidden=true;if(previewUrl)URL.revokeObjectURL(previewUrl);const file=el('video-file').files[0];previewUrl=file?URL.createObjectURL(file):'';el('video-preview').src=previewUrl;el('video-preview').hidden=!file;update();});
    el('video-access-form').addEventListener('submit',async event=>{event.preventDefault();try{await json(await fetch('/api/video-analysis/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode:el('video-code').value})}));el('video-code').value='';await open();}catch(error){status(error.message,true);}});
    window.addEventListener('pagehide',()=>{cancel();if(previewUrl)URL.revokeObjectURL(previewUrl);});
  }
  document.addEventListener('DOMContentLoaded',init);root.LaneLineVideo={open,cancel};
})(typeof window==='undefined'?globalThis:window);
