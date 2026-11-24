const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {readConfig,writeConfig,configPath}=require('../family-config');
test('family secrets default outside the application repository',()=>{
  const root=path.resolve(__dirname,'..'),relative=path.relative(root,configPath);assert.ok(relative.startsWith('..')||path.isAbsolute(relative));
});
test('private configuration is validated, saved and loaded without exposing it as a public asset',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'laneline-family-')),file=path.join(directory,'config.json');
  try{assert.deepEqual(readConfig(file),{});assert.throws(()=>writeConfig({apiKey:'short',accessCode:'short'},file));assert.equal(fs.existsSync(file),false);
    writeConfig({apiKey:'sk-test-'+ 'x'.repeat(24),accessCode:'four words for family'},file);const stored=readConfig(file);assert.equal(stored.accessCode,'four words for family');assert.equal(stored.sessionSecret.length,64);
    const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');assert.doesNotMatch(server,/"\/family-config\.json"/);
  }finally{const absolute=path.resolve(directory);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(absolute,{recursive:true,force:true});}
});
