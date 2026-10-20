import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { permittedPath, toolDecision, seatbeltProfile, secureEnvironment, secureOptions } from '../../dist/security/policy.js';
import { permissionSettings } from '../../dist/claude/sdk.js';
import { defaultConfigToml, productHome, claudeHome } from '../../dist/config.js';
import { pinEngine, verifyEngine } from '../../dist/security/engine.js';
import { ClaudeThreads } from '../../dist/claude/threads.js';
import { Gateway } from '../../dist/gateway/server.js';
import { Logger } from '../../dist/log.js';
import { RemoteControl } from '../../dist/gateway/remote.js';
import { runMcpServer } from '../../dist/mcp/server.js';

const base = mkdtempSync(join(tmpdir(), 'ccodex-secure-policy-'));
const project = join(base, 'project'); const other = join(base, 'other');
mkdirSync(project); mkdirSync(other);
writeFileSync(join(other, 'secret.txt'), 'outside'); writeFileSync(join(project, 'good.txt'), 'safe');
mkdirSync(join(project, 'nested')); writeFileSync(join(project, 'nested', '.env'), 'FAKE_SECRET');
mkdirSync(join(project,'.codex'));writeFileSync(join(project,'.codex','auth.json'),'synthetic-token');writeFileSync(join(project,'credentials.json'),'synthetic-token');
symlinkSync(other, join(project, 'escape')); linkSync(join(other,'secret.txt'),join(project,'alias.txt'));
const config={productHome:join(base,'product'),dataDir:join(base,'state'),claudeHome:join(base,'claude'),claudeBinary:'/bin/echo'};
test.after(()=>rmSync(base,{recursive:true,force:true}));

test('paths reject traversal, symlink escapes, hardlinks and secret files',()=>{
 for(const path of ['../other/secret.txt','escape/secret.txt','alias.txt','.git/config','nested/.env','key.pem']) assert.equal(permittedPath(path,project),false,path);
 assert.equal(permittedPath('good.txt',project),true);assert.equal(permittedPath('new/future.ts',project),true);
});
test('all tool calls are gated, unknown tools and sandbox escapes are denied',()=>{
 assert.equal(toolDecision('mcp__secure__shell',{command:'echo test'},project,false),'ask');
 assert.equal(toolDecision('Bash',{command:'echo test',dangerouslyDisableSandbox:true},project,false),'deny');
 assert.equal(toolDecision('Bash',{command:'cat good.txt'},project,true),'deny');
 assert.equal(toolDecision('Read',{file_path:'../other/secret.txt'},project,false),'deny');
 assert.equal(toolDecision('Read',{file_path:'good.txt'},project,false),'pass');
 assert.equal(toolDecision('Write',{file_path:'good.txt'},project,false),'ask');
 assert.equal(toolDecision('Write',{file_path:'good.txt'},project,true),'deny');
 for(const name of ['Agent','Task','mcp__codex__codex','WebFetch','new-unknown-tool']) assert.equal(toolDecision(name,{},project,false),'deny');
});
test('Full Access is refused and auto review cannot enable Claude auto mode',()=>{
 assert.throws(()=>permissionSettings({sandbox:'danger-full-access'},{permissionMode:'default',plan:false}),/refuses Full Access/);
 assert.throws(()=>permissionSettings({permissions:'unknown-custom-profile'},{permissionMode:'default',plan:false}),/Unsupported permission/);
 assert.equal(permissionSettings({approvalsReviewer:'auto_review'},{permissionMode:'bypassPermissions',plan:false}).permissionMode,'default');
});
test('no inherited credentials, proxies, custom endpoints or executable hooks',()=>{
 process.env.ANTHROPIC_API_KEY='test-only';process.env.AWS_SECRET_ACCESS_KEY='test-only';process.env.HTTPS_PROXY='test-only';process.env.NODE_OPTIONS='test-only';
 const env=secureEnvironment(config);
 for(const name of ['ANTHROPIC_API_KEY','AWS_SECRET_ACCESS_KEY','HTTPS_PROXY','NODE_OPTIONS','SSH_AUTH_SOCK'])assert.equal(env[name],undefined);
 assert.equal(env.DISABLE_TELEMETRY,'1');assert.equal(env.CLAUDE_CONFIG_DIR,config.claudeHome);
 const options=secureOptions(config,project,false);
 assert.deepEqual(options.settingSources,[]);assert.deepEqual(options.mcpServers,{});assert.equal(options.strictMcpConfig,true);
 assert.equal(options.sandbox.enabled,false);assert.equal(typeof options.spawnClaudeCodeProcess,'function');
 for(const name of ['ANTHROPIC_API_KEY','AWS_SECRET_ACCESS_KEY','HTTPS_PROXY','NODE_OPTIONS'])delete process.env[name];
});
test('titles and authentication state are separated by default',()=>{
 assert.doesNotMatch(defaultConfigToml(),/rename_prompt\s*=/);assert.equal(claudeHome(),join(productHome(),'claude'));
});
test('remote control and automatic GPT delegation fail closed',async()=>{
 const remote=new RemoteControl('',new Logger('error'),true);await remote.start();
 await assert.rejects(()=>remote.enable(false),/disabled/);await assert.rejects(()=>runMcpServer(config,'test'),/disabled/);
});
test('a foreign connection cannot resolve another chats approval request',async()=>{
 const gateway=new Gateway({...config,rpcCapture:false},join(base,'sock'),new Logger('error'));
 const subscriber={request(){},send(){}};gateway.subscribe('test-thread',subscriber);
 let settled=false;const done=gateway.serverRequest('test-thread','item/fileChange/requestApproval',{}).then(()=>settled=true);
 gateway.resolveServerRequest({id:'ccodex:1',result:{decision:'accept'}},{request(){},send(){}});
 await Promise.resolve();assert.equal(settled,false);
 gateway.resolveServerRequest({id:'ccodex:1',result:{decision:'accept'}},subscriber);await done;assert.equal(settled,true);
});
test('macOS boundary permits a project write but blocks external files and nested secrets',{skip:process.platform!=='darwin'},()=>{
 const profile=seatbeltProfile([project],[project],[],[project]);
 const run=(script)=>spawnSync('/usr/bin/sandbox-exec',['-p',profile,'/bin/sh','-c',script],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
 const allowed=run(`echo yes > '${project}/result.txt'`);assert.equal(allowed.status,0,allowed.stderr);
 for(const script of [`cat '${other}/secret.txt'`,`echo bad > '${other}/modified.txt'`,`cat '${project}/escape/secret.txt'`,`cat '${project}/nested/.env'`]) {
  const denied=run(script);assert.notEqual(denied.status,0,script);assert.doesNotMatch(denied.stdout,/outside|FAKE_SECRET/);
 }
});

test('read-only policy survives a new gateway object and unsupported profiles fail closed',()=>{
 const g=new Gateway({...config,rpcCapture:false},join(base,'policy-sock'),new Logger('error'));
 const threads=new ClaudeThreads(config,g,new Logger('error'));g.claude=threads;
 const session=threads.create({cwd:project,model:null,effort:null,fast:false,permissionMode:'default',plan:false,readOnly:true});
 assert.equal(g.meta.plan(session.threadId).readOnly,true);
 const reopened=new ClaudeThreads(config,g,new Logger('error'));assert.equal(reopened.settings(session.threadId).readOnly,true);
 assert.equal(threads.settingsResponse(session.settings).activePermissionProfile.id,':read-only');
});
test('an engine replacement is rejected after pinning',()=>{
 const fake=join(base,'fake-engine');writeFileSync(fake,'original');const pinned={productHome:join(base,'pin'),claudeBinary:fake};
 assert.throws(()=>verifyEngine(pinned),/not been pinned/);pinEngine(pinned);verifyEngine(pinned);writeFileSync(fake,'replaced-content');assert.throws(()=>verifyEngine(pinned),/changed after installation/);
});

test('DNS exception targets only the macOS resolver and public CA remains readable while private PEM is blocked',{skip:process.platform!=='darwin'},()=>{
 const engine=seatbeltProfile([project],[],[],[project],true,true);const shell=seatbeltProfile([project],[],[],[project],false,false);
 assert.match(engine,/\(literal "\/private\/var\/run\/mDNSResponder"\)/);assert.doesNotMatch(shell,/mDNSResponder/);assert.match(shell,/\(deny network\*\)/);assert.doesNotMatch(engine,/remote udp/);
 writeFileSync(join(project,'private.pem'),'synthetic-private-pem');
 const run=path=>spawnSync('/usr/bin/sandbox-exec',['-p',engine,'/bin/cat',path],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
 const ca=run('/etc/ssl/cert.pem');assert.equal(ca.status,0,ca.stderr);assert.match(ca.stdout,/BEGIN CERTIFICATE/);
 const denied=run(join(project,'private.pem'));assert.notEqual(denied.status,0);assert.doesNotMatch(denied.stdout,/synthetic-private-pem/);
});
