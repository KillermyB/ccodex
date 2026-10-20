import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {v7} from 'uuid';
import {publishArtifact} from '../../dist/claude/artifacts.js';import {visualizationFolder} from '../../dist/claude/visualize.js';

test('animation publishing writes an HTML fragment into its own chat folder and returns an escaped inline directive',()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-artifact-test-'));const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=root;
 try{
  const thread=v7(),html='<style>.dot{animation:pulse 1s infinite}@keyframes pulse{50%{transform:scale(1.2)}}</style><div class="dot">Synthetic animation</div>';
  const result=publishArtifact(thread,html,'Animation "test"');assert.equal(readFileSync(result.path,'utf8'),html);assert.ok(result.path.startsWith(visualizationFolder(thread)+'/'));
  assert.match(result.directive,/^::codex-inline-vis\{path=/);assert.ok(result.directive.includes(JSON.stringify('Animation "test"')));
  const traversal=publishArtifact(thread,html,'../../other-project');assert.ok(traversal.path.startsWith(visualizationFolder(thread)+'/'));assert.doesNotMatch(traversal.path.slice(visualizationFolder(thread).length+1),/\//);
  assert.throws(()=>publishArtifact('not-a-thread',html,'x'),/new Codex conversation/);
  assert.throws(()=>publishArtifact(thread+'/../../other-chat',html,'x'),/new Codex conversation/);
  assert.throws(()=>publishArtifact(thread,'<!doctype html><html><body>x</body></html>','x'),/fragment/);
  assert.throws(()=>publishArtifact(thread,'x'.repeat(2_000_001),'x'),/1 MB/);
 }finally{if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;rmSync(root,{recursive:true,force:true});}
});
