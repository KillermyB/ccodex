import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
let state={loggedIn:true,email:'synthetic-private-email',accessToken:'synthetic-never-displayed'};
mock.module('../../dist/security/policy.js',{namedExports:{secureOptions:()=>({env:{},spawnClaudeCodeProcess:()=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
 child.kill=()=>child.emit('close',null);
 queueMicrotask(()=>{child.stdout.end(JSON.stringify(state));child.stderr.end('synthetic suppressed diagnostics');child.emit('close',state.loggedIn?0:1);});return child;
}})}});
const {authenticationStatus,assertAuthenticated}=await import('../../dist/security/authentication.js');
test('login verification returns only a boolean and a disconnected login cannot report success',async()=>{
 assert.equal(await authenticationStatus({}),true);await assertAuthenticated({});
 state={loggedIn:false,email:'synthetic-private-email',accessToken:'synthetic-never-displayed'};
 assert.equal(await authenticationStatus({}),false);
 await assert.rejects(assertAuthenticated({}),e=>e.message.includes('Connecter Claude')&&!/synthetic-private|synthetic-never/.test(e.message));
});
