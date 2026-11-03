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
  function validAge(value){return /^\d+$/.test(String(value))&&Number(value)>=1&&Number(value)<=120;}
  function importedAge(existing,profile){
    return {sourceAgeGroup:profile.ageGroup,ageGroup:validAge(existing?.manualAge)?String(Number(existing.manualAge)):profile.ageGroup,
      ...(validAge(existing?.manualAge)?{manualAge:String(Number(existing.manualAge))}:{})};
  }
  function setAge(swimmer,value){
    if(value===null){const {manualAge,...rest}=swimmer;return {...rest,ageGroup:swimmer.sourceAgeGroup??swimmer.ageGroup};}
    if(!validAge(value))throw new Error('Age must be a whole number from 1 to 120.');
    return {...swimmer,sourceAgeGroup:swimmer.sourceAgeGroup??swimmer.ageGroup,ageGroup:String(Number(value)),manualAge:String(Number(value))};
  }
  return {ordered,nameParts,validAge,importedAge,setAge};
});
