// Explicit offline packaging step; never downloads or executes a binary.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const archive=process.argv[2];
if(!archive)throw new Error('Usage: node scripts/prepare-remote-relay.mjs /path/to/ccodex-relay-darwin-arm64-0.5.11.tgz');
const pin=JSON.parse(readFileSync(resolve(root,'config/remote-relay.json'),'utf8'));
const digest=createHash('sha512').update(readFileSync(archive)).digest('base64');
if('sha512-'+digest!==pin.archive_integrity)throw new Error('Relay archive integrity check failed.');
const binary=execFileSync('/usr/bin/tar',['-xOf',resolve(archive),'package/bin/ccodex-relay'],{maxBuffer:128*1024*1024});
if(createHash('sha256').update(binary).digest('hex')!==pin.binary_sha256)throw new Error('Relay executable integrity check failed.');
const target=resolve(root,'dist/bin/ccodex-relay'),temporary=target+'.tmp-'+process.pid;
mkdirSync(dirname(target),{recursive:true,mode:0o700});
try{writeFileSync(temporary,binary,{flag:'wx',mode:0o755});chmodSync(temporary,0o755);renameSync(temporary,target);}
finally{rmSync(temporary,{force:true});}
console.log('Prepared pinned upstream macOS relay. No program was executed.');
