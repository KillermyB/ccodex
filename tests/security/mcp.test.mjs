import test from 'node:test';import assert from 'node:assert/strict';import {PassThrough} from 'node:stream';
import {runMcpServer} from '../../dist/mcp/server.js';
test('restored Codex delegation MCP advertises both tools without starting a model',async()=>{
 const input=new PassThrough(),output=new PassThrough();let result='';output.on('data',b=>result+=b);
 const run=runMcpServer({codex:'/nonexistent-no-model-may-start'},'test',input,output);
 input.write(JSON.stringify({id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}})+'\n');input.write(JSON.stringify({id:2,method:'tools/list'})+'\n');input.end();await run;
 const messages=result.trim().split('\n').map(line=>JSON.parse(line));assert.equal(messages[0].result.serverInfo.name,'codex-mcp-server');assert.deepEqual(messages[1].result.tools.map(t=>t.name),['codex','codex-reply']);
});
