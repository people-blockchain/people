import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {compileIsolated, findSolidityImport} from '../src/lib/solidity-compiler.ts';
import {lookupPrecompiledTemplate} from '../src/lib/contract-precompiled.ts';
import {CONTRACT_TEMPLATES} from '../src/lib/contract-templates.ts';
test('compiler denies path traversal and does not disclose sentinel contents',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'people-compiler-'));
 try {const file=join(dir,'sentinel.sol');await writeFile(file,'SECRET_SENTINEL_12345');
 const importPath='audit-prefix/../'+relative(join(process.cwd(),'node_modules'),file);
 const output=await compileIsolated('Audit.sol',`pragma solidity ^0.8.20; import "${importPath}"; contract Audit {}`);
 assert.ok(output.errors.some(e=>e.severity==='error'));
 assert.ok(!JSON.stringify(output).includes('SECRET_SENTINEL_12345'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('compiler permits reviewed OpenZeppelin contracts',async()=>{
 const output=await compileIsolated('Audit.sol','pragma solidity ^0.8.20; import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; contract Audit is ERC20 {constructor() ERC20("Audit","AUD") {}}');
 assert.ok(output.contracts['Audit.sol'].Audit.evm.bytecode.object);
});
test('timeout terminates compiler and releases concurrency slot',async()=>{
 await assert.rejects(compileIsolated('Audit.sol','pragma solidity ^0.8.20; contract Audit {}',1),/compile_timeout/);
 const output=await compileIsolated('Audit.sol','pragma solidity ^0.8.20; contract Audit {}');
 assert.ok(output.contracts['Audit.sol']);
});
test('precompiled timelock artifact matches live template source',async()=>{
 const template=CONTRACT_TEMPLATES.find(t=>t.id==='timelock');
 assert.ok(template);
 const hit=lookupPrecompiledTemplate('timelock',template.source,template.fileName);
 assert.ok(hit?.bytecode.startsWith('0x'));
});
test('findSolidityImport rejects non OpenZeppelin paths',()=>{
 assert.equal(findSolidityImport('../secret.sol').error,'import_not_allowed');
});
