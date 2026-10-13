import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const languages=['en','ru','es','pt','fr','de','it','tr','vi','id','zh','ar'];
const read=lang=>JSON.parse(readFileSync(new URL(`../src/lib/locales/surfaces/wallet-ux-${lang}.json`,import.meta.url),'utf8'));
const en=read('en');
for(const lang of languages) {
 test(`new wallet strings are complete for ${lang}`,()=>{
   const copy=read(lang);
   assert.deepEqual(Object.keys(copy).sort(),Object.keys(en).sort());
   for(const [key,value] of Object.entries(copy))assert.ok(typeof value==='string'&&value.trim(),`${lang}.${key}`);
   for(const key of ['memoLong'])assert.ok(copy[key].includes('256'));
   for(const key of ['total','feeError'])assert.ok(copy[key].includes('PPL'));
   if(lang!=='en')for(const key of ['overview','sendTab','historyTab','settingsTab','review','confirm','cameraError','addressError','feeError'])assert.notEqual(copy[key],en[key],`${lang}.${key} must not fall back to English`);
   if(lang!=='en'&&lang!=='ru')for(const key of ['migrationTitle','migrationBody','migrationExisting','migrationNew','migrationKeepExisting'])assert.notEqual(copy[key],en[key],`${lang}.${key} must not fall back to English`);
 });
}
test('wallet locale registry is exhaustive, with no language-based English fallback',()=>{
 const source=readFileSync(new URL('../src/lib/wallet-ux-copy.ts',import.meta.url),'utf8');
 assert.ok(source.includes('Record<Language, typeof en>'));
 assert.ok(!source.includes('language ==='));
 for(const lang of languages)assert.ok(source.includes(`wallet-ux-${lang}.json`));
 const app=readFileSync(new URL('../src/components/wallet/WalletApp.tsx',import.meta.url),'utf8');
 assert.ok(!app.includes('lang === "ru" ?'));
 assert.ok(!app.includes('<Eyebrow>WALLET</Eyebrow>'));
});
