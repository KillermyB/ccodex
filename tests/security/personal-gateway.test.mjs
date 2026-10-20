import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createConnection} from 'node:net';
import WebSocket from 'ws';
import * as sdk from '@anthropic-ai/claude-agent-sdk';
import {fakeClaude,fakeQuery,fakeStartup} from '../../test-generated/fakeClaude.js';
mock.module('@anthropic-ai/claude-agent-sdk',{namedExports:{...sdk,query:fakeQuery,startup:fakeStartup}});
const {startGateway}=await import('../../dist/gateway/server.js');
const {Logger}=await import('../../dist/log.js');

test('personal gateway exposes native tools, cross-project access and inline artifacts while honoring chat permissions',async()=>{
 const root=mkdtempSync(join('/private/tmp','ccsgw-'));const project=join(root,'project');mkdirSync(project);
 process.env.CLAUDE_CONFIG_DIR=join(root,'claude');process.env.CODEX_HOME=join(root,'codex');
 const config={accessMode:'personal',codex:resolve('tests/fixtures/fakeStock.mjs'),delegateCodex:resolve('tests/fixtures/fakeStock.mjs'),claudeBinary:'/bin/echo',claudeHome:process.env.CLAUDE_CONFIG_DIR,productHome:root,dataDir:join(root,'state'),publicSocket:join(root,'gw.sock'),modelPrefix:'claude:',logLevel:'error',rpcCapture:false,rpcCaptureMaxBytes:1000,rpcLimitBytes:1e7,improveModelsFormatting:true,claudeVisualize:false};
 fakeClaude.reset();const server=await startGateway(config,config.publicSocket,['app-server'],new Logger('error'),false);
 const ws=new WebSocket('ws://test/rpc',{createConnection:()=>createConnection(config.publicSocket)});await new Promise((ok,bad)=>{ws.once('open',ok);ws.once('error',bad)});
 let id=0;const pending=new Map();const messages=[];
 ws.on('message',b=>{const m=JSON.parse(String(b));messages.push(m);if(m.method&&m.id){ws.send(JSON.stringify({id:m.id,result:{decision:'decline'}}));}else if(m.id&&pending.has(m.id)){const {ok,bad}=pending.get(m.id);pending.delete(m.id);m.error?bad(new Error(m.error.message)):ok(m.result);}});
 const request=(method,params={})=>new Promise((ok,bad)=>{const n=++id;pending.set(n,{ok,bad});ws.send(JSON.stringify({id:n,method,params}));});
 const until=async f=>{const deadline=Date.now()+5000;while(!f()){if(Date.now()>deadline)throw new Error('gateway event timeout');await new Promise(r=>setTimeout(r,10));}};
 try{
  await request('initialize',{clientInfo:{name:'security-test',version:'1'}});ws.send(JSON.stringify({method:'initialized'}));
  const stock=await request('weird/method');assert.equal(stock.echo,'weird/method');
  const models=await request('model/list');assert.ok(models.data.some(m=>m.id.startsWith('claude:')));assert.ok(models.data.some(m=>m.id.startsWith('gpt')));
  const started=await request('thread/start',{model:'claude:claude-opus-5-5',cwd:project,sandbox:'workspace-write'});assert.equal(started.sandbox.type,'workspaceWrite');assert.equal(started.sandbox.networkAccess,true);
  const threadId=started.thread.id;await request('turn/start',{threadId,input:[{type:'text',text:'synthetic prompt',text_elements:[]}]});
  await until(()=>messages.some(m=>m.method==='turn/completed'&&m.params.threadId===threadId));
  const options=fakeClaude.options.findLast(o=>(o.sessionId===threadId||o.resume===threadId));assert.ok(options);assert.ok(options.tools.includes('Bash'));assert.ok(!options.disallowedTools.includes('Bash'));assert.equal(options.allowDangerouslySkipPermissions,false);assert.deepEqual(Object.keys(options.mcpServers),['artifacts']);
  const guard=options.hooks.PreToolUse[0].hooks[0];const result=await guard({tool_name:'Write',tool_input:{file_path:join(project,'file.txt')}});assert.equal(result.hookSpecificOutput.permissionDecision,'ask');const bash=await guard({tool_name:'Bash',tool_input:{command:'git status'}});assert.equal(bash.hookSpecificOutput.permissionDecision,'ask');const read=await guard({tool_name:'Read',tool_input:{file_path:join(root,'sibling.txt')}});assert.deepEqual(read,{});const artifact=await guard({tool_name:'mcp__artifacts__publish_html',tool_input:{html:'<div>demo</div>',title:'Demo'}});assert.deepEqual(artifact,{});
  const count=fakeClaude.prompts.length;await request('turn/start',{threadId,turnTrigger:'thread_title',input:[{type:'text',text:'private title text',text_elements:[]}]});assert.equal(fakeClaude.prompts.length,count);
  await assert.rejects(()=>request('thread/settings/update',{threadId,model:'gpt-6-luna'}),/blocks provider transfers/);
  await assert.rejects(()=>request('remoteControl/enable'),/disabled/);
  await request('thread/settings/update',{threadId,sandbox:'danger-full-access'});
  await request('turn/start',{threadId,input:[{type:'text',text:'synthetic full access check',text_elements:[]}]});
  await until(()=>fakeClaude.options.some(o=>(o.sessionId===threadId||o.resume===threadId)&&o.allowDangerouslySkipPermissions===true));
  const full=fakeClaude.options.findLast(o=>(o.sessionId===threadId||o.resume===threadId));assert.equal(full.permissionMode,'bypassPermissions');
  await until(()=>messages.filter(m=>m.method==='turn/completed'&&m.params.threadId===threadId).length>=3);
  await request('thread/settings/update',{threadId,sandbox:'read-only'});
  await request('turn/start',{threadId,input:[{type:'text',text:'synthetic read only check',text_elements:[]}]});
  await until(()=>fakeClaude.options.findLast(o=>(o.sessionId===threadId||o.resume===threadId))?.allowDangerouslySkipPermissions===false);
  const readonly=fakeClaude.options.findLast(o=>(o.sessionId===threadId||o.resume===threadId));const deny=await readonly.hooks.PreToolUse[0].hooks[0]({tool_name:'Bash',tool_input:{command:'touch new-file'}});assert.equal(deny.hookSpecificOutput.permissionDecision,'deny');
 }finally{ws.close();await server.stop();rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
