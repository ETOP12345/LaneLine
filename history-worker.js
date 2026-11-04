let version='';
self.onmessage=async event=>{
  if(event.data.type!=='refresh')return;
  try{
    const response=await fetch('datahub-history.json',{cache:'no-cache'});
    if(!response.ok)throw Error(`History request failed (${response.status})`);
    const nextVersion=response.headers.get('etag')||response.headers.get('last-modified')||'';
    if(nextVersion&&version===nextVersion){self.postMessage({type:'done',unchanged:true});return;}
    const histories=await response.json(),entries=Object.entries(histories);
    for(let index=0;index<entries.length;index+=12){
      self.postMessage({type:'batch',entries:entries.slice(index,index+12)});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    version=nextVersion;self.postMessage({type:'done',unchanged:false});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
