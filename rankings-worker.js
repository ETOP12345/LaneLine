importScripts('standards-engine.js','insights-engine.js','rankings-engine.js','relay-engine.js','rankings-dashboard.js');
self.onmessage=event=>{
  const {id,swimmers,standards,course}=event.data;
  try{
    self.postMessage({id,data:LaneLineRankingDashboard.data(swimmers,standards,course,{includeRelays:false}),partial:true});
    const relays=LaneLineRelays.boards(swimmers,course);
    self.postMessage({id,relays});
  }
  catch(error){self.postMessage({id,error:error.message});}
};
