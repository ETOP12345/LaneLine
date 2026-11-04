const fs=require('node:fs');
const path=require('node:path');
const dashboard=require('../rankings-dashboard');
const root=path.join(__dirname,'..');
function build(destination=path.join(root,'rankings-dashboard.html')){
  const template=fs.readFileSync(path.join(root,'western-zone-dashboard/index.html'),'utf8');
  const html=dashboard.shell(template);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,html);
  return html;
}
if(require.main===module)build(process.argv[2]?path.resolve(process.argv[2]):undefined);
module.exports=build;
