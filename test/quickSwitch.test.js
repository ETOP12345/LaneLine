const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const UI=require('../swimmer-ui');

test('quick search supports keyboard navigation, selection, and empty results',()=>{
  const nodes=new Map(),ready=[],documentEvents={},opened=[];
  function element(id){
    if(!nodes.has(id))nodes.set(id,{id,value:'',open:false,hidden:false,attributes:{},events:{},focus(){},scrollIntoView(){},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},addEventListener(type,fn){this.events[type]=fn;},showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(id);
  }
  const results=element('quick-results');
  Object.defineProperty(results,'innerHTML',{get(){return this.html||'';},set(value){this.html=value;for(const match of value.matchAll(/id="(quick-result-\d+)"/g))element(match[1]);}});
  const doc={getElementById:element,querySelectorAll(){return [...nodes.values()].filter(node=>/^quick-result-\d+$/.test(node.id));},querySelector(selector){if(selector==='dialog[open]'&&element('quick-switch').open)return element('quick-switch');return null;},addEventListener(type,fn){documentEvents[type]=fn;}};
  const context=vm.createContext({document:doc,window:{addEventListener(type,fn){if(type==='DOMContentLoaded')ready.push(fn);}},LaneLineSwimmerUI:UI,orderedSwimmers:()=>[{id:'ethan',name:'Ethan Wang',team:'Bellevue Club Swim Team'}],swimmerFavorites:()=>new Set(['ethan']),escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),openSwimmerView:(id,page)=>opened.push([id,page]),showPage:page=>opened.push([page])});
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  vm.runInContext(html.slice(html.indexOf('let quickResults='),html.indexOf("let rankingCourse='SCY'")),context);
  ready.forEach(fn=>fn());vm.runInContext('openQuickSwitch()',context);
  assert.equal(element('quick-switch').open,true);
  const input=element('quick-query');input.value='Ethan';input.events.input();
  assert.match(results.innerHTML,/Best times/);assert.match(results.innerHTML,/Growth/);
  input.events.keydown({key:'ArrowDown',preventDefault(){}});
  assert.equal(input.attributes['aria-activedescendant'],'quick-result-1');
  input.events.keydown({key:'Enter',preventDefault(){}});
  assert.deepEqual(opened,[['ethan','growth']]);assert.equal(element('quick-switch').open,false);
  documentEvents.keydown({key:'k',ctrlKey:true,target:{matches:()=>false},preventDefault(){}});
  assert.equal(element('quick-switch').open,true);
  input.value='not a swimmer';input.events.input();assert.equal(element('quick-empty').hidden,false);
  assert.equal(input.attributes['aria-activedescendant'],undefined);
  input.events.keydown({key:'Enter',preventDefault(){}});assert.equal(opened.length,1);
});
