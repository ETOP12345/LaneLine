importScripts('standards-engine.js','insights-engine.js','rankings-engine.js','relay-engine.js','rankings-dashboard.js');
self.onmessage=event=>{
  const {id,swimmers,standards,course}=event.data;
  try{self.postMessage({id,data:LaneLineRankingDashboard.data(swimmers,standards,course)});}
  catch(error){self.postMessage({id,error:error.message});}
};
