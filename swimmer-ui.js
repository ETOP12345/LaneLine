(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LaneLineSwimmerUI=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const collator=new Intl.Collator('en',{sensitivity:'base',numeric:true});
  function nameParts(swimmer){
    const parts=String(swimmer.name||'').trim().split(/\s+/);
    return [swimmer.familyName||parts.pop()||'',swimmer.givenName||parts.join(' ')];
  }
  function ordered(swimmers,pinned){
    const ranks=new Map(pinned.map((sw,index)=>[sw.usaSwimmingMemberId||sw.id,index]));
    return [...swimmers].sort((a,b)=>{
      const ar=ranks.get(a.usaSwimmingMemberId||a.id),br=ranks.get(b.usaSwimmingMemberId||b.id);
      if(ar!==undefined||br!==undefined)return (ar??Infinity)-(br??Infinity);
      const an=nameParts(a),bn=nameParts(b);
      return collator.compare(an[0],bn[0])||collator.compare(an[1],bn[1])||collator.compare(a.id,b.id);
    });
  }
  function photoUrl(value){
    if(typeof value!=='string')return '';
    if(/^ui-media\/swimmers\/[A-F0-9]{14}\.jpg$/.test(value))return value;
    try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}
  }
  return {ordered,nameParts,photoUrl};
});
