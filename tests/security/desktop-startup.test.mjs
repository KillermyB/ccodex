import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {entryShim} from '../../dist/desktop/entryShim.js';
import {findDesktopCodex,DESKTOP_RUNTIME_PATHS} from '../../dist/desktop/nativeRuntime.js';
import {verifyDesktopStartup} from '../../dist/desktop/startupCheck.js';
import {classifyInvocation} from '../../dist/cli/args.js';
import {loadConfig} from '../../dist/config.js';
import {installCliPathAgent,uninstallCliPathAgent} from '../../dist/desktop/launchAgent.js';

const make=()=>mkdtempSync('/private/tmp/cc-startup-test-');
const policy=JSON.stringify({appServerVersion:'99.1.0',configRequirements:{requirements:{allowedSandboxModes:['readOnly']}}});
const args=['-c','features.code_mode_host=true','app-server','--analytics-default-enabled','--print-startup-config','--startup-client-info','{"name":"test client"}'];
function fixture(root){
 const app=join(root,"Desktop ' $(not-a-command).app"),binary=join(app,DESKTOP_RUNTIME_PATHS[0]),launcher=join(root,'entry');mkdirSync(join(binary,'..'),{recursive:true});
 writeFileSync(binary,'#!/bin/sh\n[ -z "${CODEX_CLI_PATH+x}" ] || exit 90\n[ -z "${CCODEX_SHIM_ACTIVE+x}" ] || exit 91\nprintf "%s\\n" "$@" > "$CCODEX_TEST_ARGS"\nprintf "%s" "$CCODEX_TEST_POLICY"\nexit "${CCODEX_TEST_EXIT:-0}"\n',{mode:0o755});
 writeFileSync(launcher,entryShim('/missing-node-for-this-test'),{mode:0o755});
 return{app,binary,launcher,env:{HOME:root,PATH:'/usr/bin:/bin',CCODEX_HOME:join(root,'private'),CCODEX_DESKTOP_APP:app,CODEX_CLI_PATH:launcher,CCODEX_SHIM_ACTIVE:'1',CCODEX_TEST_ARGS:join(root,'args'),CCODEX_TEST_POLICY:policy}};
}
test('startup and unfamiliar app-server operations are passed to native Codex without losing arguments',()=>{
 const config={publicSocket:'/private/tmp/unused.sock'};
 for(const argv of [args,['app-server','--startup-sign-out'],['app-server','--startup-future-check'],['app-server','--future-required-option','value'],['--enable','future-feature','app-server'],['app-server','--listen','ws://127.0.0.1:8080'],['app-server','--help']])assert.deepEqual(classifyInvocation(argv,config),{kind:'delegate'});
 assert.equal(classifyInvocation(['-c','features.code_mode_host=true','app-server','--analytics-default-enabled'],config).kind,'stdioFrontend');
});
test('the generated shell launcher performs the policy check without Node, SDK, Claude or a gateway',()=>{
 const root=make();try{const f=fixture(root);const p=spawnSync(f.launcher,args,{env:f.env,encoding:'utf8',timeout:3000});assert.equal(p.status,0,p.stderr);assert.equal(p.stdout,policy);assert.deepEqual(readFileSync(f.env.CCODEX_TEST_ARGS,'utf8').trimEnd().split('\n'),args);assert.equal(existsSync(f.env.CCODEX_HOME),false);}finally{rmSync(root,{recursive:true,force:true});}
});
test('native policy errors and explicit sign-out flags are preserved exactly by the launcher',()=>{
 const root=make();try{const f=fixture(root),failure='{"error":{"code":-32000,"message":"synthetic organization refusal"}}';const p=spawnSync(f.launcher,[...args,'--startup-sign-out'],{env:{...f.env,CCODEX_TEST_POLICY:failure,CCODEX_TEST_EXIT:'7'},encoding:'utf8',timeout:3000});assert.equal(p.status,7);assert.equal(p.stdout,failure);assert.equal(readFileSync(f.env.CCODEX_TEST_ARGS,'utf8').trimEnd().split('\n').at(-1),'--startup-sign-out');}finally{rmSync(root,{recursive:true,force:true});}
});
test('a desktop runtime pointing back to the managed launcher cannot recurse',()=>{
 const root=make();try{const f=fixture(root);rmSync(f.binary);symlinkSync(f.launcher,f.binary);assert.equal(findDesktopCodex([f.app]),f.launcher);const p=spawnSync(f.launcher,args,{env:{...f.env,CCODEX_SHIM_ACTIVE:'0'},encoding:'utf8',timeout:3000});assert.notEqual(p.status,0,p.stderr);assert.equal(p.stdout,'');assert.equal(p.error,undefined);}finally{rmSync(root,{recursive:true,force:true});}
});
test('runtime discovery follows a desktop engine replacement and rejects missing/non-executable engines',()=>{
 const root=make();try{const f=fixture(root);assert.equal(findDesktopCodex([f.app]),f.binary);rmSync(f.binary);assert.equal(findDesktopCodex([f.app]),undefined);writeFileSync(f.binary,'replacement',{mode:0o644});assert.equal(findDesktopCodex([f.app]),undefined);rmSync(f.binary);writeFileSync(f.binary,'replacement',{mode:0o755});assert.equal(findDesktopCodex([f.app]),f.binary);}finally{rmSync(root,{recursive:true,force:true});}
});
test('the desktop bundle is preferred to a stale CLI on PATH while plain CLI delegation remains available',()=>{
 const root=make(),before={...process.env};try{const f=fixture(root),bin=join(root,'bin');mkdirSync(bin);writeFileSync(join(bin,'codex'),'#!/bin/sh\nexit 0\n',{mode:0o755});Object.assign(process.env,{HOME:root,CCODEX_HOME:join(root,'private'),CCODEX_CONFIG:join(root,'absent.toml'),CCODEX_DESKTOP_APP:f.app,CCODEX_CLAUDE_BINARY:'/bin/echo',PATH:bin});delete process.env.CCODEX_CODEX;delete process.env.CCODEX_DELEGATE_CODEX;const c=loadConfig();assert.equal(c.codex,f.binary);assert.equal(c.delegateCodex,join(bin,'codex'));}finally{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);rmSync(root,{recursive:true,force:true});}
});
test('activation accepts a valid native response and refuses malformed or denied policy without fabricating requirements',async()=>{
 const root=make();try{const binary=join(root,'native');writeFileSync(binary,'#!/bin/sh\nprintf \'%s\' \''+policy+'\'\n',{mode:0o755});assert.equal(await verifyDesktopStartup(binary),'99.1.0');for(const response of ['not JSON','{"appServerVersion":"99","configRequirements":{}}','{"error":{"code":-32000,"message":"deny"}}']){writeFileSync(binary,'#!/bin/sh\nprintf \'%s\' \''+response+'\'\n',{mode:0o755});await assert.rejects(()=>verifyDesktopStartup(binary),/incompatible startup response/);}}finally{rmSync(root,{recursive:true,force:true});}
});
test('upgrading the GUI session agent never restores its own launcher on removal',()=>{
 const root=make(),home=process.env.HOME;process.env.HOME=root;try{for(const original of [undefined,'/synthetic/original']){let value=original;const runtime={run(args){if(args[0]==='getenv')return{status:0,stdout:value??'',stderr:''};if(args[0]==='setenv')value=args[2];if(args[0]==='unsetenv')value=undefined;return{status:0,stdout:'',stderr:''};}};const first=installCliPathAgent('/synthetic/ccodex',undefined,runtime);const upgraded=installCliPathAgent('/synthetic/ccodex',first,runtime);assert.equal(upgraded.previousValue,original);assert.equal(uninstallCliPathAgent(upgraded,runtime),true);assert.equal(value,original);}}finally{if(home===undefined)delete process.env.HOME;else process.env.HOME=home;rmSync(root,{recursive:true,force:true});}
});
