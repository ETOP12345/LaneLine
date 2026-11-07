(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LaneLineSwimmerUI=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const collator=new Intl.Collator('en',{sensitivity:'base',numeric:true});
  function searchable(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
  function matchesSearch(swimmer,query){
    const team=searchable(swimmer.team),aliases=[['bellevue club','bcst'],['wave aquatics','wave'],['pacific dragons','pdst'],['olympic cascade','oca']].filter(([name])=>team.includes(name)).map(([,code])=>code);
    const text=searchable([swimmer.name,swimmer.team,swimmer.teamCode,swimmer.ageGroup,swimmer.division,...aliases].join(' '));
    return searchable(query).split(' ').filter(Boolean).every(word=>text.includes(word));
  }
  function cleanPreferences(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const result={};
    for(const key of ['bestSwimmer','growthSwimmer','growthEvent'])if(typeof value[key]==='string'&&value[key].length<=160)result[key]=value[key];
    if(['best','growth','strengths','goals','training','analysis','standards','zone','profiles'].includes(value.tab))result.tab=value.tab;
    if(['SCY','LCM','SCM'].includes(value.bestCourse))result.bestCourse=value.bestCourse;
    if(['SCY','LCM'].includes(value.growthCourse))result.growthCourse=value.growthCourse;
    return result;
  }
  function loadPreferences(storage){try{return cleanPreferences(JSON.parse(storage.getItem('laneline-view-preferences')||'{}'));}catch{return {};}}
  function bestTimesCsv(swimmer,rows,course){
    const cell=value=>{
      let text=String(value??'');
      if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const data=[['Swimmer','Team','Event','Course','Best time','Meet','Date'],...rows.map(row=>[swimmer.name,swimmer.team,row.event,course,row.time,row.meet,row.date])];
    return '\uFEFF'+data.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  function quickItems(swimmers,query,favorites=[]){
    const tabs=[['best','Best times'],['growth','Growth'],['strengths','Strengths'],['goals','Goals'],['training','Tests / Training'],['standards','Time standards'],['zone','Rankings'],['profiles','Swimmers'],['analysis','Video analysis']];
    const favoriteIds=new Set(favorites),term=String(query||'').trim();
    const pages=tabs.filter(([,name])=>matchesSearch({name},term)).map(([page,label])=>({page,label,detail:'Page'}));
    const people=swimmers.filter(sw=>term?matchesSearch(sw,term):favoriteIds.has(sw.id)).slice(0,6).flatMap(sw=>[
      {page:'best',swimmerId:sw.id,label:sw.name,detail:'Best times'+(sw.team?' · '+sw.team:'')},
      {page:'growth',swimmerId:sw.id,label:sw.name,detail:'Growth'+(sw.team?' · '+sw.team:'')}
    ]);
    return (term?[...pages,...people]:[...people.slice(0,6),...pages]).slice(0,16);
  }
  function savePreferences(storage,value){try{storage.setItem('laneline-view-preferences',JSON.stringify(cleanPreferences(value)));return true;}catch{return false;}}
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
  return {ordered,nameParts,validAge,importedAge,setAge,matchesSearch,loadPreferences,savePreferences,quickItems,bestTimesCsv};
});
