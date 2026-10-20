import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {verifyBundle} from '../../dist/security/bundle.js';

test('bundle verification refuses changed, missing, extra and symlinked files',()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-bundle-'));
 try{
  const files=['package.json','dist/cli/main.js','node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs'];
  const entries={};for(const file of files){mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),'synthetic');entries[file]=createHash('sha256').update('synthetic').digest('hex');}
  const manifest=join(root,'BUNDLE-SHA256.json');writeFileSync(manifest,JSON.stringify(entries));verifyBundle(root);
  writeFileSync(join(root,'unexpected.js'),'extra');assert.throws(()=>verifyBundle(root),/integrity/);rmSync(join(root,'unexpected.js'));
  writeFileSync(join(root,'dist/cli/main.js'),'modified');assert.throws(()=>verifyBundle(root),/integrity/);writeFileSync(join(root,'dist/cli/main.js'),'synthetic');
  rmSync(join(root,'dist/cli/main.js'));assert.throws(()=>verifyBundle(root),/Missing/);
  symlinkSync(join(root,'package.json'),join(root,'dist/cli/main.js'));assert.throws(()=>verifyBundle(root),/Symlink/);rmSync(join(root,'dist/cli/main.js'));
  writeFileSync(manifest,'{}');assert.throws(()=>verifyBundle(root),/Incomplete/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
