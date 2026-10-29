// Run with Node's --experimental-test-module-mocks flag and an absolute runtime path.
// All files live in a temporary HOME. launchctl is replaced with an in-memory implementation.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readlinkSync,symlinkSync,existsSync,rmSync,appendFileSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=resolve(process.argv[2]);
const root=mkdtempSync(join(tmpdir(),'ccodex-install-test-'));
const before={...process.env};
let value='synthetic-previous-cli';let rejectBootstrap=false;
const launchctl={run(args){
 if(args[0]==='getenv')return{status:0,stdout:value??'',stderr:''};
 if(args[0]==='setenv'){value=args[2];return{status:0,stdout:'',stderr:''};}
 if(args[0]==='unsetenv'){value=undefined;return{status:0,stdout:'',stderr:''};}
 return{status:args[0]==='print'||rejectBootstrap&&['load','bootstrap'].includes(args[0])?1:0,stdout:'',stderr:rejectBootstrap?'synthetic failure':''};
}};
try{
 process.env.HOME=root;process.env.CCODEX_HOME=join(root,"private-'$()-state");process.env.CODEX_HOME=join(root,'codex');
 process.env.PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
 delete process.env.CLAUDE_CONFIG_DIR;delete process.env.CCODEX_CLAUDE_BINARY;
 assert.equal(homedir(),root,'Refusing to test outside the temporary HOME');
 const agentUrl=pathToFileURL(join(runtime,'dist/desktop/launchAgent.js')).href;
 const agent=await import(agentUrl);
 mock.module(agentUrl,{namedExports:{...agent,
  installCliPathAgent:(shim,previous)=>agent.installCliPathAgent(shim,previous,launchctl),
  uninstallCliPathAgent:record=>agent.uninstallCliPathAgent(record,launchctl),
 }});
 const {setup,uninstall,runManagementCommand}=await import(pathToFileURL(join(runtime,'dist/management/commands.js')).href);
 mkdirSync(join(root,'.local','bin'),{recursive:true});symlinkSync('/bin/echo',join(root,'.local','bin','codex'));
 const zsh=join(root,'.zshrc');writeFileSync(zsh,'# original synthetic settings\n');
 await setup([]);
 assert.equal(value,join(process.env.CCODEX_HOME,'bin','codex'));
 assert.ok(existsSync(join(process.env.CCODEX_HOME,'install.json')));
 assert.doesNotMatch(readFileSync(zsh,'utf8'),/export CODEX_CLI_PATH=/);
 await runManagementCommand(['desktop','disable'],()=>({}));
 assert.equal(value,'synthetic-previous-cli');
 await runManagementCommand(['desktop','enable'],()=>({}));
 assert.equal(value,join(process.env.CCODEX_HOME,'bin','codex'));
 appendFileSync(zsh,'# user edit after installation\n');
 await uninstall([]);
 assert.equal(value,'synthetic-previous-cli');assert.equal(readlinkSync(join(root,'.local','bin','codex')),'/bin/echo');
 assert.equal(readFileSync(zsh,'utf8'),'# original synthetic settings\n# user edit after installation\n');
 assert.equal(existsSync(join(process.env.CCODEX_HOME,'install.json')),false);
 console.log('PASS: packaged setup/uninstall restores prior launch state and preserves later user edits.');
 rejectBootstrap=true;
 await assert.rejects(setup([]),/activation failed/);
 assert.equal(value,'synthetic-previous-cli');assert.equal(readlinkSync(join(root,'.local','bin','codex')),'/bin/echo');
 assert.equal(readFileSync(zsh,'utf8'),'# original synthetic settings\n# user edit after installation\n');
 assert.equal(existsSync(join(process.env.CCODEX_HOME,'current')),false);
 console.log('PASS: failed activation rolls back startup files and managed launchers. No system launchctl operation was used.');
}finally{
 for(const name of Object.keys(process.env))if(!(name in before))delete process.env[name];
 Object.assign(process.env,before);mock.restoreAll();rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
