import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { runSandboxedShell } from '../../dist/security/shell.js';
import { seatbeltProfile } from '../../dist/security/policy.js';
import { spawn, spawnSync } from 'node:child_process';
const base=mkdtempSync(join(tmpdir(),'ccodex-secure-shell-'));const cwd=join(base,'project');mkdirSync(cwd);writeFileSync(join(cwd,'input.txt'),'synthetic');writeFileSync(join(base,'outside.txt'),'outside');
test.after(()=>rmSync(base,{recursive:true,force:true}));
test('secure shell runs build code, writes the project, and has no inherited secrets',async()=>{
 process.env.SUPER_SECRET_TEST='must-not-appear';
 const r=await runSandboxedShell(cwd,`node -e 'require("fs").writeFileSync("result.txt", "built"); console.log(process.env.SUPER_SECRET_TEST || "clean")'`);
 delete process.env.SUPER_SECRET_TEST;
 assert.equal(r.failed,false,r.text);assert.equal(readFileSync(join(cwd,'result.txt'),'utf8'),'built');assert.match(r.text,/clean/);assert.doesNotMatch(r.text,/must-not-appear/);
});
test('secure shell cannot read or modify files outside the project',async()=>{
 for(const command of [`cat ../outside.txt`,`echo tampered > ../outside.txt`]){const r=await runSandboxedShell(cwd,command);assert.equal(r.failed,true,r.text);assert.doesNotMatch(r.text,/outside\n/);}
 assert.equal(readFileSync(join(base,'outside.txt'),'utf8'),'outside');
});
test('secure shell cannot contact a local network server',async()=>{
 let connections=0;const server=createServer(socket=>{connections++;socket.end('unexpected');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const port=server.address().port;const r=await runSandboxedShell(cwd,`curl --max-time 2 http://127.0.0.1:${port}`);assert.equal(r.failed,true,r.text);assert.equal(connections,0);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('read-only process cannot create project files',()=>{
 const profile=seatbeltProfile([cwd],[],[],[cwd]);const r=spawnSync('/usr/bin/sandbox-exec',['-p',profile,'/bin/sh','-c','echo bad > new-file'],{cwd,encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(existsSync(join(cwd,'new-file')),false);
});
test('commands are stopped at a bounded deadline',async()=>{
 const start=Date.now();const r=await runSandboxedShell(cwd,'sleep 20',150);assert.equal(r.failed,true);assert.match(r.text,/time limit/);assert.ok(Date.now()-start<4000);
});

test('commands cannot inspect environments or signal another process',async()=>{
 const sentinel='synthetic-process-secret-ccodex';const child=spawn('/bin/sleep',['20'],{env:{CCODEX_TEST_SECRET:sentinel},stdio:'ignore'});
 try{
  const read=await runSandboxedShell(cwd,`/bin/ps eww -p ${child.pid}`);assert.doesNotMatch(read.text,new RegExp(sentinel));
  const kill=await runSandboxedShell(cwd,`/bin/kill -TERM ${child.pid}`);assert.equal(kill.failed,true,kill.text);assert.equal(child.exitCode,null);
 }finally{child.kill('SIGKILL');}
});

test('commands cannot read nested credential and configuration files',async()=>{
 mkdirSync(join(cwd,'.codex'),{recursive:true});writeFileSync(join(cwd,'.codex','auth.json'),'synthetic-protected-token');
 writeFileSync(join(cwd,'credentials.json'),'synthetic-protected-token');mkdirSync(join(cwd,'.ccodex-secure'));writeFileSync(join(cwd,'.ccodex-secure','auth.json'),'synthetic-protected-token');
 for(const file of ['.codex/auth.json','credentials.json','.ccodex-secure/auth.json']){const r=await runSandboxedShell(cwd,`cat ${file}`);assert.equal(r.failed,true,r.text);assert.doesNotMatch(r.text,/synthetic-protected-token/);}
});
