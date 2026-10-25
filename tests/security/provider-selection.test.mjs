import test,{mock} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';import {join,resolve} from 'node:path';import {createConnection} from 'node:net';import WebSocket from 'ws';import * as sdk from '@anthropic-ai/claude-agent-sdk';
import {fakeClaude,fakeQuery,fakeStartup} from '../../test-generated/fakeClaude.js';
mock.module('@anthropic-ai/claude-agent-sdk',{namedExports:{...sdk,query:fakeQuery,startup:fakeStartup}});
const {startGateway}=await import('../../dist/gateway/server.js');const {Logger}=await import('../../dist/log.js');

test('picker selection reaches Claude despite Desktop sending the old GPT collaboration model',async()=>{
 const root=mkdtempSync('/private/tmp/cc-routing-'),project=join(root,'project');mkdirSync(project);
 const before={...process.env};process.env.HOME=root;process.env.CLAUDE_CONFIG_DIR=join(root,'claude');process.env.CODEX_HOME=join(root,'codex');
 const config={accessMode:'personal',codex:resolve('tests/fixtures/fakeStock.mjs'),delegateCodex:resolve('tests/fixtures/fakeStock.mjs'),claudeBinary:'/bin/echo',claudeHome:process.env.CLAUDE_CONFIG_DIR,productHome:root,dataDir:join(root,'state'),publicSocket:join(root,'gw.sock'),modelPrefix:'claude:',logLevel:'error',rpcCapture:false,rpcCaptureMaxBytes:1000,rpcLimitBytes:1e7,improveModelsFormatting:true,claudeVisualize:false};
 fakeClaude.reset();const server=await startGateway(config,config.publicSocket,['app-server'],new Logger('error'),false);
 const ws=new WebSocket('ws://routing/rpc',{createConnection:()=>createConnection(config.publicSocket)}),messages=[],pending=new Map();let seq=0;
 ws.on('message',b=>{const m=JSON.parse(String(b));messages.push(m);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.bad(Error(m.error.message)):p.ok(m.result);}});
 const req=(method,params={})=>new Promise((ok,bad)=>{const id=++seq,timer=setTimeout(()=>bad(Error('timeout '+method)),8000);pending.set(id,{ok,bad,timer});ws.send(JSON.stringify({id,method,params}));});
 const until=async f=>{const deadline=Date.now()+8000;while(!f()){if(Date.now()>deadline)throw Error('event timeout');await new Promise(r=>setTimeout(r,10));}};
 try{
  await new Promise((ok,bad)=>{ws.once('open',ok);ws.once('error',bad)});await req('initialize',{clientInfo:{name:'routing-regression',version:'1'}});ws.send(JSON.stringify({method:'initialized'}));
  for(const scenario of ['stale-collaboration','existing-history','effort-after-picker','cancel-selection','explicit-turn-model']){
   const {thread}=await req('thread/start',{model:'gpt-6-luna',cwd:project});const threadId=thread.id;
   if(scenario==='existing-history'){
    await req('turn/start',{threadId,input:[{type:'text',text:'history sentinel',text_elements:[]}]});
    await until(()=>messages.some(m=>m.method==='turn/completed'&&m.params.threadId===threadId));
   }
   await req('thread/settings/update',{threadId,model:'claude:opus',effort:'low'});
   assert.ok(messages.some(m=>m.method==='thread/settings/updated'&&m.params.threadId===threadId&&m.params.threadSettings.model==='claude:opus'),'picker must receive its settings acknowledgement before a turn');
   if(scenario==='effort-after-picker')await req('thread/settings/update',{threadId,effort:'medium'});
   if(scenario==='cancel-selection')await req('thread/settings/update',{threadId,model:'gpt-6-luna'});
   const turnStart=messages.length;
   await req('turn/start',{threadId,model:scenario==='explicit-turn-model'?'gpt-6-luna':null,collaborationMode:{mode:'default',settings:{model:'gpt-6-luna',reasoning_effort:'high',developer_instructions:null}},input:[{type:'text',text:'routing sentinel',text_elements:[]}]});
   await until(()=>messages.slice(turnStart).some(m=>m.method==='turn/completed'&&m.params.threadId===threadId));
   const answers=messages.filter(m=>m.method==='item/completed'&&m.params.threadId===threadId&&m.params.item.type==='agentMessage').map(m=>m.params.item.text);
   const claude=['stale-collaboration','existing-history','effort-after-picker'].includes(scenario);
   assert.ok(answers.includes((claude?'claude':'gpt')+': routing sentinel'),scenario+': '+JSON.stringify(answers));
   if(claude){
    assert.ok(fakeClaude.options.some(o=>o.model==='opus'));
    const selection=messages.filter(m=>m.method==='thread/settings/updated'&&m.params.threadId===threadId).at(-1).params.threadSettings;
    assert.equal(selection.model,'claude:opus');assert.equal(selection.effort,scenario==='effort-after-picker'?'medium':'low');
    // The reverse switch must also honor the picker over the old Claude collaboration model.
    const since=messages.length;await req('thread/settings/update',{threadId,model:'gpt-6-luna'});
    await req('turn/start',{threadId,model:null,collaborationMode:{mode:'default',settings:{model:'claude:opus',reasoning_effort:'low',developer_instructions:null}},input:[{type:'text',text:'reverse sentinel',text_elements:[]}]});
    await until(()=>messages.slice(since).some(m=>m.method==='turn/completed'&&m.params.threadId===threadId));
    assert.ok(messages.slice(since).some(m=>m.method==='item/completed'&&m.params.threadId===threadId&&m.params.item.text==='gpt: reverse sentinel'));
   }
  }
 }finally{for(const p of pending.values())clearTimeout(p.timer);ws.close();await server.stop();for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
