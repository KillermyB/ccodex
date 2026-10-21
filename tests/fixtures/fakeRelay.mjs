#!/usr/bin/env node
import {createInterface} from 'node:readline';
const socket=process.argv[process.argv.indexOf('--socket')+1];
if(socket.includes('startup-failure'))process.exit(2);
console.log(JSON.stringify({type:'status',params:{status:'enabled',environmentId:'synthetic-host'}}));
console.log(JSON.stringify({type:'ready'}));
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.params?.simulateExit)process.exit(3);
 console.log(JSON.stringify({type:'response',id:m.id,result:{method:m.method,clientName:m.clientName,synthetic:true}}));
});
