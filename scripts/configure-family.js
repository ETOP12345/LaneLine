const http=require('node:http');
const crypto=require('node:crypto');
const {writeConfig}=require('../family-config');
function serve(port=5193,{fetch:fetchApi=global.fetch,save=writeConfig}={}){
  const token=crypto.randomBytes(32).toString('hex');let busy=false;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page=(message='',saved=false)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LaneLine family setup</title><style>body{font:16px system-ui,sans-serif;color:#173b59;background:#edf6ff;margin:0;padding:36px 20px}main{max-width:560px;margin:auto}h1{font-size:28px}form{display:grid;gap:18px}label{display:grid;gap:7px}input{font:inherit;padding:12px;border:1px solid #a6cbe5;border-radius:6px;min-width:0}button{font:600 16px system-ui;padding:13px;background:#1679bf;color:white;border:0;border-radius:6px;cursor:pointer}p{line-height:1.6}#status{color:#a32b44}.saved{color:#136c4a!important}</style><main><h1>LaneLine family setup</h1>${saved?'<p id="status" class="saved">Configuration saved securely. LaneLine needs a restart.</p>':`<p>Secrets stay on this computer, outside the repository and OneDrive. The key is checked with OpenAI for GPT-6.1 Sol access; this does not run an analysis.</p><p id="status" role="status">${escape(message)}</p><form method="post" action="/save" autocomplete="off"><input type="hidden" name="token" value="${token}"><label>OpenAI API key<input name="apiKey" type="password" autocomplete="off" required minlength="20" maxlength="2048" spellcheck="false"></label><label>Family access code<input name="accessCode" type="password" autocomplete="new-password" required minlength="12" maxlength="200"></label><label>Confirm access code<input name="confirmCode" type="password" autocomplete="new-password" required minlength="12" maxlength="200"></label><button type="submit">Verify and save</button></form>`}</main></html>`;
  const server=http.createServer(async(req,res)=>{
    const send=(status,html)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(html);};
    const hosts=[`localhost:${port}`,`127.0.0.1:${port}`];if(!hosts.includes(req.headers.host)){send(403,page('Local access only.'));return;}
    if(req.method==='GET'&&req.url==='/'){send(200,page());return;}
    if(req.method!=='POST'||req.url!=='/save'){send(404,page('Not found.'));return;}
    if(!hosts.map(host=>'http://'+host).includes(req.headers.origin)){send(403,page('Local origin required.'));return;}
    if(busy){send(429,page('A verification is already running.'));return;}busy=true;
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw Error('Configuration request is too large.');}
      const form=new URLSearchParams(body);if(form.get('token')!==token)throw Error('Reopen the setup page and try again.');
      const apiKey=(form.get('apiKey')||'').trim(),accessCode=form.get('accessCode')||'';
      if(apiKey.length<20||apiKey.length>2048||/[\r\n]/.test(apiKey))throw Error('Enter a valid OpenAI API key.');
      if(accessCode.length<12||accessCode.length>200||/[\r\n]/.test(accessCode))throw Error('Choose a family access code of 12 to 200 characters.');
      if(accessCode!==form.get('confirmCode'))throw Error('The access codes do not match.');
      let response;try{response=await fetchApi('https://api.openai.com/v1/models/gpt-6.1-sol',{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(15000)});}catch{throw Error('OpenAI could not be reached. Nothing was saved.');}
      if(!response.ok)throw Error(response.status===401?'OpenAI rejected this key. Nothing was saved.':response.status===403||response.status===404?'This API key cannot access GPT-6.1 Sol. Nothing was saved.':'OpenAI could not verify access. Try again later.');
      const model=await response.json();if(model.id!=='gpt-6.1-sol')throw Error('Model access could not be verified. Nothing was saved.');
      save({apiKey,accessCode});send(200,page('',true));server.close();
    }catch(error){send(400,page(/^(Enter|Choose|The access|OpenAI|This API|Model|Reopen|Configuration|Could not protect)/.test(error.message)?error.message:'Configuration could not be saved.'));}
    finally{busy=false;}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Family setup: http://localhost:${port}`));return server;
}
if(require.main===module)serve();
module.exports={serve};
