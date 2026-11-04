const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const {server}=require('../server');
const data=require('../time-standards.json');

test('preview serves every standards dependency with the correct content type',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const standards=await fetch(base+'/time-standards.json');
    assert.equal(standards.status,200);assert.match(standards.headers.get('content-type'),/application\/json/);
    assert.ok(Object.keys((await standards.json()).motivational).length>400);
    for(const name of ['standards-engine.js','insights-engine.js','rankings-engine.js','relay-engine.js','rankings-worker.js','motion.js','fluid-engine.js','history-worker.js']){
      const response=await fetch(base+'/'+name);assert.equal(response.status,200);
      assert.match(response.headers.get('content-type'),/javascript/);assert.ok((await response.text()).length>100);
    }
    const compressed=await fetch(base+'/swimmer-roster.json',{headers:{'Accept-Encoding':'gzip'}});
    assert.equal(compressed.headers.get('content-encoding'),'gzip');
    const etag=compressed.headers.get('etag');assert.ok(etag);
    assert.ok((await compressed.json()).swimmers.length>500);
    const unchanged=await fetch(base+'/swimmer-roster.json',{headers:{'If-None-Match':etag}});
    assert.equal(unchanged.status,304);
    assert.equal((await fetch(base+'/swimmer-roster.json')).status,200);
    for(const [asset,type] of [['performance.css','text/css'],['upcoming-meets.js','text/javascript'],['ui-media/pool.jpg','image/jpeg']]){
      const response=await fetch(base+'/'+asset);assert.equal(response.status,200);
      assert.ok(response.headers.get('content-type').startsWith(type));assert.ok((await response.arrayBuffer()).byteLength>100);
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});

async function loadingContext(fetchResponse){
  const html=await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  const source=html.slice(html.indexOf('async function loadVerifiedStandards()'),html.indexOf('function renderStandardsPage()'));
  const context={verifiedStandardsData:null,standardsLoadError:'',motivationalStandards:{},
    LaneLineStandards:{},LaneLineInsights:{},AbortController,setTimeout,clearTimeout,
    fetch:fetchResponse,document:{getElementById:()=>null},refreshes:0,
    refreshStandardsViews(){context.refreshes++;},escapeHtml:s=>s,console:{warn(){}}};
  vm.createContext(context);vm.runInContext(source,context);return context;
}
test('failed standards load leaves loading state and a retry restores valid data',async()=>{
  const context=await loadingContext(async()=>({ok:false,status:404}));
  await context.loadVerifiedStandards();
  assert.equal(context.verifiedStandardsData,null);assert.match(context.standardsLoadError,/could not load/);
  assert.equal(context.refreshes,2);
  context.fetch=async()=>({ok:true,json:async()=>data});
  await context.loadVerifiedStandards();
  assert.equal(context.standardsLoadError,'');assert.equal(context.verifiedStandardsData,data);
});
test('malformed data and missing engine scripts report failure instead of fake grades',async()=>{
  const context=await loadingContext(async()=>({ok:true,json:async()=>({meets:[]})}));
  await context.loadVerifiedStandards();assert.equal(context.verifiedStandardsData,null);
  assert.ok(context.standardsLoadError);
  delete context.LaneLineInsights;
  context.fetch=async()=>{throw Error('Should not fetch with missing engines');};
  await context.loadVerifiedStandards();assert.ok(context.standardsLoadError);
});
