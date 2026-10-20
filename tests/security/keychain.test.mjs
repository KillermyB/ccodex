import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {trustedKeychainPath} from '../../dist/security/keychain.js';
import {seatbeltProfile} from '../../dist/security/policy.js';

test('authentication grant accepts one standard keychain file and rejects path escapes',()=>{
 const home=mkdtempSync(join(tmpdir(),'ccodex-keychain-path-'));
 try{
  const dir=join(home,'Library/Keychains');mkdirSync(dir,{recursive:true});const file=join(dir,'login.keychain-db');writeFileSync(file,'synthetic database');
  assert.ok(trustedKeychainPath(file,home)?.endsWith('/login.keychain-db'));
  const outside=join(home,'other.keychain-db');writeFileSync(outside,'synthetic');assert.equal(trustedKeychainPath(outside,home),undefined);
  symlinkSync(outside,join(dir,'escape.keychain-db'));assert.equal(trustedKeychainPath(join(dir,'escape.keychain-db'),home),undefined);
  assert.equal(trustedKeychainPath(dir,home),undefined);assert.equal(trustedKeychainPath('relative.keychain-db',home),undefined);
 }finally{rmSync(home,{recursive:true,force:true});}
});

test('authentication file exception is literal, engine-only, and never reaches shell commands',{skip:process.platform!=='darwin'},()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-auth-boundary-test-'));const project=join(root,'project');mkdirSync(project);
 const allowed=join(root,'login.keychain-db'),neighbor=join(root,'unrelated.keychain-db');writeFileSync(allowed,'synthetic-auth-marker');writeFileSync(neighbor,'synthetic-other-marker');
 const run=(keychain,path)=>spawnSync('/usr/bin/sandbox-exec',['-p',seatbeltProfile([project],[],[],[],false,keychain,[allowed]),'/bin/cat',path],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
 try{
  const engine=run(true,allowed);assert.equal(engine.status,0,engine.stderr);assert.match(engine.stdout,/synthetic-auth-marker/);
  assert.notEqual(run(true,neighbor).status,0);
  const shell=run(false,allowed);assert.notEqual(shell.status,0);assert.doesNotMatch(shell.stdout,/synthetic-auth-marker/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
