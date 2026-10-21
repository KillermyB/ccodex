import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';import {mkdtempSync,mkdirSync,readFileSync,existsSync,rmSync,statSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {extractRuntimeArchive,updateFromGitHub} from '../../dist/management/updates.js';

function archive(entries){return execFileSync('python3',['-c',`import sys,json,io,tarfile
entries=json.load(sys.stdin);out=io.BytesIO()
with tarfile.open(fileobj=out,mode='w:gz',format=tarfile.USTAR_FORMAT) as tar:
 for name,value in entries.items():
  item=tarfile.TarInfo(name)
  if isinstance(value,dict):item.type=tarfile.SYMTYPE;item.linkname=value['link'];tar.addfile(item)
  else:
   data=value.encode();item.size=len(data);item.mode=0o755 if name.endswith('.js') else 0o644;tar.addfile(item,io.BytesIO(data))
sys.stdout.buffer.write(out.getvalue())`],{input:JSON.stringify(entries)});}

test('update extraction accepts regular runtime files and rejects traversal and symlink archives',()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-update-extract-'));
 try{
  extractRuntimeArchive(archive({'nested/main.js':'synthetic-script'}),root);assert.equal(readFileSync(join(root,'nested/main.js'),'utf8'),'synthetic-script');assert.ok(statSync(join(root,'nested/main.js')).mode&0o100);
  assert.throws(()=>extractRuntimeArchive(archive({'../outside':'bad'}),root),/Unsafe/);
  assert.throws(()=>extractRuntimeArchive(archive({'link':{link:'/tmp'}}),root),/links/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('fork updater checks release origin and checksum before running a verified synthetic setup',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-update-test-')),previous=globalThis.fetch;
 const files={'package.json':JSON.stringify({name:'@gkorepanov/ccodex',version:'99.0.0'}),'dist/cli/main.js':"require('fs').writeFileSync(require('path').join(process.env.CCODEX_HOME,'synthetic-installed'),process.argv[2]);",'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs':'// synthetic dependency'};
 files['BUNDLE-SHA256.json']=JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,createHash('sha256').update(text).digest('hex')])));
 const bytes=archive(files),name='ccodex-personal-runtime-99.0.0.tgz',base='https://github.com/KillermyB/ccodex/releases/download/v99.0.0/';let checksum=createHash('sha256').update(bytes).digest('hex');
 const release={tag_name:'v99.0.0',draft:false,assets:[{name,browser_download_url:base+name},{name:name+'.sha256',browser_download_url:base+name+'.sha256'}]};
 globalThis.fetch=async url=>new Response(String(url).includes('api.github.com')?JSON.stringify([release]):String(url).endsWith('.sha256')?checksum:bytes);
 try{
  const config={productHome:root};assert.match(await updateFromGitHub(config,'0.7.0-personal.1',true),/99.0.0 disponible/);assert.equal(existsSync(join(root,'synthetic-installed')),false);
  assert.match(await updateFromGitHub(config,'0.7.0-personal.1',false),/installé/);assert.equal(readFileSync(join(root,'synthetic-installed'),'utf8'),'setup');rmSync(join(root,'synthetic-installed'));
  checksum='a'.repeat(64);await assert.rejects(()=>updateFromGitHub(config,'0.7.0-personal.1',false),/checksum/);assert.equal(existsSync(join(root,'synthetic-installed')),false);
  checksum=createHash('sha256').update(bytes).digest('hex');release.assets[0].browser_download_url='https://example.invalid/changed.tgz';await assert.rejects(()=>updateFromGitHub(config,'0.7.0-personal.1',false),/origin/);
 }finally{globalThis.fetch=previous;rmSync(root,{recursive:true,force:true});}
});
