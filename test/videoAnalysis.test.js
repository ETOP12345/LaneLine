const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const fs=require('node:fs');
const path=require('node:path');
const {createVideoAnalysisRouter,DEFAULT_CONFIG,validateInput,modelRequest}=require('../videoAnalysis');
const {sampleTimes}=require('../video-analysis-client');
const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
const body=()=>({duration:5,question:'Lane 2, blue cap',frames:[{time:1,image},{time:4,image}]});
const cfg={...DEFAULT_CONFIG,apiKey:'test-key',accessCode:'',sessionSecret:'test-secret'};
function request(method='POST',value=body(),address='127.0.0.1',headers={}){const req=Readable.from([Buffer.from(JSON.stringify(value))]);req.method=method;req.headers={'content-type':'application/json',...headers};req.socket={remoteAddress:address};return req;}
function response(){return {status:null,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};}
test('timestamp sampling is bounded and covers short and long clips',()=>{
  for(const duration of [.1,5,90]){const times=sampleTimes(duration);assert.ok(times.length>=2&&times.length<=24);assert.ok(times[0]>0&&times.at(-1)<duration);assert.ok(times.every((t,i)=>i===0||t>times[i-1]));}
});
test('validates image types, sizes, duration and ordered timestamps',()=>{
  const valid=body();assert.equal(validateInput(valid),valid);
  for(const invalid of [{...body(),duration:100},{...body(),frames:[]},{...body(),frames:[{time:1,image},{time:1,image}]},{...body(),frames:[{time:1,image:'https://example.com/a.jpg'},{time:2,image}]}])assert.throws(()=>validateInput(invalid));
});
test('Responses request uses Sol, timestamped image input and no storage',()=>{
  const payload=modelRequest(body(),cfg);assert.equal(payload.model,'gpt-6.1-sol');assert.equal(payload.store,false);
  assert.equal(payload.input[0].content.filter(p=>p.type==='input_image').length,2);assert.match(payload.instructions,/NOT full video/);assert.ok(!JSON.stringify(payload).includes('test-key'));
});
test('configuration never exposes secrets and missing keys never create demo feedback',async()=>{
  const router=createVideoAnalysisRouter({...cfg,apiKey:''});const res=response();await router(request('GET'),res,new URL('http://localhost/api/video-analysis/config'));
  assert.equal(res.body.enabled,false);assert.ok(!JSON.stringify(res.body).includes('apiKey'));
  const failed=response();await router(request(),failed,new URL('http://localhost/api/video-analysis'));assert.equal(failed.status,503);assert.match(failed.body.error,/No analysis was generated/);
});
test('remote callers require a family access code and foreign origins are denied',async()=>{
  const router=createVideoAnalysisRouter(cfg);const res=response();await router(request('POST',body(),'192.0.2.5'),res,new URL('http://localhost/api/video-analysis'));assert.equal(res.status,401);
  const other=response();await router(request('POST',body(),'127.0.0.1',{origin:'https://other.example'}),other,new URL('http://localhost/api/video-analysis'));assert.equal(other.status,403);
});
test('family login creates an HttpOnly cookie and protects the API',async()=>{
  const router=createVideoAnalysisRouter({...cfg,accessCode:'family-code'});const res=response();await router(request('POST',{accessCode:'family-code'},'192.0.2.5',{'x-forwarded-proto':'https'}),res,new URL('https://family.example/api/video-analysis/session'));
  assert.equal(res.status,200);assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);assert.match(res.headers['Set-Cookie'],/Secure/);
  const check=response();await router(request('GET',{},'192.0.2.5',{cookie:res.headers['Set-Cookie'].split(';')[0]}),check,new URL('https://family.example/api/video-analysis/config'));assert.equal(check.body.authorized,true);
});
test('same-origin HTTPS family login works behind the hosting proxy',async()=>{
  const router=createVideoAnalysisRouter({...cfg,accessCode:'family-code'}),res=response();await router(request('POST',{accessCode:'family-code'},'192.0.2.5',{'x-forwarded-proto':'https',origin:'https://family.example'}),res,new URL('http://family.example/api/video-analysis/session'));assert.equal(res.status,200);
});
test('returns only actual model output and applies usage limits',async()=>{
  let calls=0;const router=createVideoAnalysisRouter({...cfg,maxHourly:1},{fetch:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer test-key');return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Visible coaching feedback.'}]}]})};}});
  const res=response();await router(request(),res,new URL('http://localhost/api/video-analysis'));assert.equal(res.status,200);assert.equal(res.body.answer,'Visible coaching feedback.');assert.equal(calls,1);
  const again=response();await router(request(),again,new URL('http://localhost/api/video-analysis'));assert.equal(again.status,429);assert.equal(calls,1);
});
test('upstream failures preserve key secrecy and produce no fake feedback',async()=>{
  const router=createVideoAnalysisRouter(cfg,{fetch:async()=>({ok:false,status:401})});const res=response();await router(request(),res,new URL('http://localhost/api/video-analysis'));assert.equal(res.status,502);assert.ok(!JSON.stringify(res.body).includes('test-key'));assert.ok(!res.body.answer);
});
test('old extraction, polling, demo and report renderer are removed',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),server=fs.readFileSync(path.join(__dirname,'../videoAnalysis.js'),'utf8');
  assert.doesNotMatch(html,/renderVideoImprovement|pollVideoAnalysis|analysis-improvement-card/);assert.doesNotMatch(server,/ffmpeg|ffprobe|demoAnalysis|Busboy/);
  assert.match(html,/id="video-answer"/);const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});
