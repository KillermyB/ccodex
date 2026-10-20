import test,{mock} from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
let code=0;let status='404';let received;
mock.module('../../dist/security/policy.js',{namedExports:{secureOptions:()=>({env:{},spawnClaudeCodeProcess:options=>{
 received=options;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('close',null);
 queueMicrotask(()=>{child.stdout.end(status);child.stderr.end('suppressed synthetic diagnostics');child.emit('close',code);});return child;
}})}});
const {verifyNetwork}=await import('../../dist/security/network.js');
test('network verification uses an unauthenticated HTTPS HEAD with strict TLS and no curl user settings',async()=>{
 assert.equal(await verifyNetwork({}),404);assert.equal(received.command,'/usr/bin/curl');
 assert.equal(received.args[0],'--disable');assert.ok(received.args.includes('--head'));assert.equal(received.args.at(-1),'https://api.anthropic.com/');
 assert.ok(!received.args.some(x=>/insecure|authorization|api.key|cookie|--data|--location/i.test(x)));
 code=6;status='000';await assert.rejects(verifyNetwork({}),/DNS/);
 code=77;await assert.rejects(verifyNetwork({}),/certificats HTTPS/);
});
