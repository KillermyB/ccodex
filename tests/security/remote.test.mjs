import test,{mock} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import * as security from '../../dist/security/relay.js';
mock.module('../../dist/security/relay.js',{namedExports:{...security,remoteRelayBinary:()=>resolve('tests/fixtures/fakeRelay.mjs')}});
const {RemoteControl}=await import('../../dist/gateway/remote.js');const {Logger}=await import('../../dist/log.js');

test('remote relay checks executable integrity and excludes parent credentials',()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-relay-integrity-')),file=join(root,'relay');
 try{writeFileSync(file,'synthetic executable',{mode:0o700});security.verifyRelayFile(file,createHash('sha256').update('synthetic executable').digest('hex'));writeFileSync(file,'changed');assert.throws(()=>security.verifyRelayFile(file,'a'.repeat(64)),/integrity/);
  process.env.ANTHROPIC_API_KEY='synthetic-key';assert.equal(security.remoteRelayEnvironment().ANTHROPIC_API_KEY,undefined);delete process.env.ANTHROPIC_API_KEY;
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('remote enable/pair/disable persists preference, notifies clients and recovers after a relay crash',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-remote-'));const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=root;
 const remote=new RemoteControl(join(root,'gateway.sock'),new Logger('error'),false),events=[];
 remote.intercept({notify:(_method,params)=>events.push(params)},{status:'disabled',environmentId:null});
 try{
  await remote.start();await assert.rejects(()=>remote.pairing('remoteControl/pairing/start',{}),/requires remote control/);
  assert.equal((await remote.enable(false)).status,'enabled');assert.equal(JSON.parse(readFileSync(join(root,'app-server-daemon/settings.json'),'utf8')).remoteControlEnabled,true);
  assert.equal((await remote.pairing('remoteControl/pairing/start',{},'synthetic-client')).clientName,'synthetic-client');
  await assert.rejects(()=>remote.pairing('arbitrary/method',{}),/unsupported/);
  await remote.disable(false);assert.equal(remote.current().status,'disabled');assert.equal(JSON.parse(readFileSync(join(root,'app-server-daemon/settings.json'),'utf8')).remoteControlEnabled,false);
  await remote.enable(true);await assert.rejects(()=>remote.pairing('remoteControl/pairing/status',{simulateExit:true}),/exited/);
  assert.equal(remote.current().status,'disabled');assert.ok(events.some(e=>e.status==='enabled'));
  assert.equal((await remote.enable(true)).status,'enabled');
 }finally{await remote.stop();if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;rmSync(root,{recursive:true,force:true});}
});

test('a failed remote startup leaves local gateway operation possible',async()=>{
 const remote=new RemoteControl('/private/tmp/startup-failure.sock',new Logger('error'),true);
 await remote.start();assert.equal(remote.current().status,'disabled');await remote.stop();
});
