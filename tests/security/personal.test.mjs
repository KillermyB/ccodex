import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:http';
import {secureOptions,toolDecision,workspace,permittedPath} from '../../dist/security/policy.js';
import {pinEngine} from '../../dist/security/engine.js';import {permissionSettings,codexPermissions} from '../../dist/claude/sdk.js';
import {runManagementCommand} from '../../dist/management/commands.js';

test('personal mode permits cross-project paths and keeps normal write/command approvals',()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-personal-policy-'));const project=join(root,'project');mkdirSync(project);const sibling=join(root,'other-project.txt');writeFileSync(sibling,'synthetic');
 try{
  assert.equal(workspace(root,'personal'),root.startsWith('/var/')?'/private'+root:root);
  assert.equal(permittedPath(sibling,project,'personal'),true);assert.equal(permittedPath(sibling,project),false);
  assert.equal(toolDecision('Read',{file_path:sibling},project,false,'personal'),'pass');
  assert.equal(toolDecision('Write',{file_path:sibling},project,false,'personal'),'ask');assert.equal(toolDecision('Bash',{command:'git status'},project,false,'personal'),'ask');
  assert.equal(toolDecision('Bash',{command:'ls'},project,true,'personal'),'deny');assert.equal(toolDecision('Write',{file_path:sibling},project,true,'personal'),'deny');
  assert.equal(toolDecision('WebFetch',{url:'https://example.com'},project,false,'personal'),'ask');assert.equal(toolDecision('mcp__artifacts__publish_html',{},project,true,'personal'),'pass');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('Full Access requires the personal mode and an explicit conversation permission selection',()=>{
 const current={permissionMode:'default',plan:false};assert.throws(()=>permissionSettings({sandbox:'danger-full-access'},current));
 assert.equal(permissionSettings({},current,true).permissionMode,'default');
 assert.equal(permissionSettings({sandbox:'danger-full-access'},current,true).permissionMode,'bypassPermissions');
 assert.equal(permissionSettings({},{permissionMode:'bypassPermissions',plan:false},true).permissionMode,'bypassPermissions');
 assert.equal(codexPermissions('default','/tmp/project',true).sandboxPolicy.networkAccess,true);
 assert.equal(codexPermissions('bypassPermissions','/tmp/project',true).sandboxPolicy.type,'dangerFullAccess');
});

test('personal process can use sibling project files, Git and a local preview server',{skip:process.platform!=='darwin'},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-personal-process-'));const project=join(root,'project'),other=join(root,'other');mkdirSync(project);mkdirSync(other);writeFileSync(join(other,'document.txt'),'synthetic-cross-project-document');
 const config={accessMode:'personal',productHome:join(root,'product'),claudeHome:join(root,'claude'),dataDir:join(root,'state'),claudeBinary:'/bin/sh'};pinEngine(config);
 let requests=0;const server=createServer((req,res)=>{requests++;res.end('synthetic-preview');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const options=secureOptions(config,project,false);const command=`cat ../other/document.txt && echo synthetic-change > ../other/created.txt && git -C ../other init --quiet && curl --disable --silent --max-time 3 http://127.0.0.1:${server.address().port}`;
  const child=options.spawnClaudeCodeProcess({command:'/bin/sh',args:['-c',command],cwd:project,env:{...options.env,HOME:root},signal:new AbortController().signal});let out='';let err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const code=await new Promise(r=>child.once('close',r));assert.equal(code,0,err);assert.match(out,/synthetic-cross-project-document/);assert.match(out,/synthetic-preview/);assert.equal(requests,1);assert.equal(readFileSync(join(other,'created.txt'),'utf8'),'synthetic-change\n');
 }finally{await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});}
});

test('mode switch preserves unrelated settings and is reversible',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-access-setting-'));const file=join(root,'config.toml');const previous=process.env.CCODEX_CONFIG;process.env.CCODEX_CONFIG=file;
 try{
  writeFileSync(file,'log_level = "warn"\nrpc_capture = false\n');
  await runManagementCommand(['access','personal'],()=>({}));assert.match(readFileSync(file,'utf8'),/access_mode = "personal"/);assert.match(readFileSync(file,'utf8'),/log_level = "warn"/);
  await runManagementCommand(['access','project'],()=>({}));assert.match(readFileSync(file,'utf8'),/access_mode = "project"/);
  await assert.rejects(runManagementCommand(['access','unknown'],()=>({})),/Usage/);
 }finally{if(previous===undefined)delete process.env.CCODEX_CONFIG;else process.env.CCODEX_CONFIG=previous;rmSync(root,{recursive:true,force:true});}
});
