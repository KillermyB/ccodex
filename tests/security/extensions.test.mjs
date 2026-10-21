import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readlinkSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {activateNativeExtensions,nativeExtensions} from '../../dist/claude/extensions.js';

test('native extension activation preserves dedicated auth and loads user MCP, skills, plugins, hooks and agents',()=>{
 const root=mkdtempSync(join(tmpdir(),'ccodex-extensions-')),previous=process.env.HOME;process.env.HOME=root;
 const user=join(root,'.claude'),dedicated=join(root,'dedicated');mkdirSync(user);mkdirSync(dedicated);mkdirSync(join(user,'skills'));mkdirSync(join(user,'plugins'));mkdirSync(join(user,'agents'));
 writeFileSync(join(user,'agents','custom.md'),'synthetic-user-agent');writeFileSync(join(user,'settings.json'),JSON.stringify({hooks:{SessionStart:[]},enabledPlugins:{'synthetic@test':true}}));
 writeFileSync(join(root,'.claude.json'),JSON.stringify({oauthAccount:{synthetic:'must-not-copy'},mcpServers:{synthetic:{type:'stdio',command:'/bin/echo'}}}));
 writeFileSync(join(dedicated,'settings.json'),JSON.stringify({syncClaudeAiSkills:false,custom:'keep'}));writeFileSync(join(dedicated,'.credentials.json'),'synthetic-auth-unchanged');
 const config={accessMode:'personal',claudeHome:dedicated};
 try{
  activateNativeExtensions(config,'synthetic-wrapper');const options=nativeExtensions(config);
  assert.equal(options.settings.custom,'keep');assert.equal(options.settings.syncClaudeAiSkills,true);assert.deepEqual(options.settings.hooks,{SessionStart:[]});assert.equal(options.mcpServers.synthetic.command,'/bin/echo');assert.equal(options.oauthAccount,undefined);
  assert.equal(readlinkSync(join(dedicated,'skills')),join(user,'skills'));assert.equal(readFileSync(join(dedicated,'agents','custom.md'),'utf8'),'synthetic-user-agent');assert.equal(readFileSync(join(dedicated,'.credentials.json'),'utf8'),'synthetic-auth-unchanged');
  writeFileSync(join(dedicated,'agents','codex-wrapper.md'),'user-wrapper-edit');activateNativeExtensions(config,'new-wrapper');assert.equal(readFileSync(join(dedicated,'agents','codex-wrapper.md'),'utf8'),'user-wrapper-edit');assert.deepEqual(nativeExtensions({...config,accessMode:'project'}),{});
 }finally{if(previous===undefined)delete process.env.HOME;else process.env.HOME=previous;rmSync(root,{recursive:true,force:true});}
});
