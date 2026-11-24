const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const configPath=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.config'),'LaneLine','family-config.json');
function readConfig(file=configPath){
  let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw Error('LaneLine family configuration could not be read.');}
  const result={};for(const key of ['apiKey','accessCode','sessionSecret'])if(typeof value[key]==='string'&&!/[\r\n]/.test(value[key]))result[key]=value[key];return result;
}
function writeConfig({apiKey,accessCode},file=configPath){
  if(typeof apiKey!=='string'||apiKey.trim().length<20||apiKey.length>2048||/[\r\n]/.test(apiKey))throw Error('Enter a valid OpenAI API key.');
  if(typeof accessCode!=='string'||accessCode.length<12||accessCode.length>200||/[\r\n]/.test(accessCode))throw Error('Choose a family access code of 12 to 200 characters.');
  const directory=path.dirname(path.resolve(file));fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(process.platform==='win32'){
    try{const identity=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});const sid=identity.match(/S-1-\d+(?:-\d+)+/)?.[0];if(!sid)throw Error();execFileSync('icacls',[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});}
    catch{throw Error('Could not protect the local secret folder. Configuration was not saved.');}
  }
  const temp=path.join(directory,'.family-config-'+crypto.randomUUID()+'.tmp');
  try{fs.writeFileSync(temp,JSON.stringify({apiKey:apiKey.trim(),accessCode,sessionSecret:crypto.randomBytes(32).toString('hex')})+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,path.resolve(file));}
  finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
module.exports={configPath,readConfig,writeConfig};
