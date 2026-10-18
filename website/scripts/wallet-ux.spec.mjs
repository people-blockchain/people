import {test,expect} from '@playwright/test';
import {createECDH,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Covers the sheet-based People Wallet (Send / Receive / Settings dialogs,
// Tokens / NFT / Activity tabs). Chain reads are mocked on both public
// backends: `/api/evm/compat/*` (default cosmos-evm) and `/api/network/*`
// (legacy people-node). Nothing here broadcasts a transaction: the test stops at
// the review step and at the "balance changed" guard, which run before any
// signing or RPC submission.
const privateKey='1'.padStart(64,'0');const ecdh=createECDH('secp256k1');ecdh.setPrivateKey(Buffer.from(privateKey,'hex'));
const key={privateKey,address:'0x'+createHash('sha256').update(ecdh.getPublicKey(null,'compressed')).digest('hex').slice(0,40)};
const recipient='0x'+'a'.repeat(40);
const legacyBackend=['legacy','people-node'].includes((process.env.NEXT_PUBLIC_CHAIN??'').trim().toLowerCase());
const chainId=legacyBackend?(process.env.NEXT_PUBLIC_CHAIN_ID?.trim()||'people-public-testnet-v2-2026-09-30'):'97401';
const LOCALES=['en','ru','es','pt','fr','de','it','tr','vi','id','zh','ar'];

test('wallet reviews before signing, guards stale balances, exports encrypted backup',async({page})=>{
 const sent=[];let balance=10;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const seedWallet=async({key})=>{
   localStorage.setItem('people_lang','en');
   const salt=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));
   const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-password'),'PBKDF2',false,['deriveKey']);
   const derived=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
   const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},derived,new TextEncoder().encode(key.privateKey)));
   const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
   localStorage.setItem('ppl-web-wallets',JSON.stringify([{id:'test-wallet',label:'Test wallet',address:key.address,createdAt:1,encryptedPrivateKey:JSON.stringify({salt:hex(salt),iv:hex(iv),data:hex(data)})}]));
 };
 await page.route(/\/api\/(network|evm\/compat)\//,async route=>{
   const url=new URL(route.request().url());const path=url.pathname.replace(/^\/api\/(network|evm\/compat)\//,'');let body={};
   if(path==='health')body={chainId,status:'ok',height:100};
   else if(path==='metrics')body={height:100,finalizedHeight:99};
   else if(path.endsWith('/transactions'))body=[];
   else if(path.startsWith('address/'))body={balance,nonce:0,balances:{demo:1230000}};
   else if(path==='assets')body=[{assetId:'demo',name:'Demo token',symbol:'DEMO',decimals:6}];
   else if(path==='nfts')body=[{nftId:'nft-1',name:'Test NFT'}];
   else if(path==='tx'){sent.push(route.request().postDataJSON());body={accepted:true};}
   await route.fulfill({json:body});
 });
 await page.goto('/wallet');
 await page.evaluate(seedWallet,{key});
 await page.reload();
 await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await page.getByLabel('Password',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Unlock',exact:true}).click();

 // Home: balance, asset tabs, search.
 await expect(page.getByTestId('wallet-ppl')).toContainText('10');
 const tabs=page.getByRole('tablist',{name:'Wallet assets'});
 await expect(tabs.getByRole('tab',{name:'Tokens',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('link',{name:/Demo token/})).toBeVisible();
 await page.getByLabel('Search assets by name, symbol or ID').fill('not-found');
 await expect(page.getByRole('link',{name:/Demo token/})).toHaveCount(0);
 await page.getByLabel('Search assets by name, symbol or ID').fill('');
 await tabs.getByRole('tab',{name:'NFT',exact:true}).click();
 await expect(tabs.getByRole('tab',{name:'NFT',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:/Test NFT/}).click();
 const nft=page.getByRole('dialog',{name:'NFT details'});
 await expect(nft).toContainText('nft-1');
 if (process.env.NFT_TRANSFERS_ENABLED!=='1') await expect(nft.getByRole('button',{name:'Review payment'})).toHaveCount(0);
 await nft.getByRole('button',{name:'Close'}).click();
 await expect(nft).toHaveCount(0);
 await tabs.getByRole('tab',{name:'Activity',exact:true}).click();
 await expect(tabs.getByRole('tab',{name:'Activity',exact:true})).toHaveAttribute('aria-selected','true');

 // Send: review first, nothing leaves the browser until confirmed.
 await page.getByTestId('wallet-action-send').click();
 const send=page.getByRole('dialog',{name:'Send PPL'});
 await send.getByLabel('To address',{exact:true}).fill(recipient);
 await send.getByLabel('Amount',{exact:true}).fill('1');
 await send.getByLabel('Memo').fill('Invoice 42');
 await send.getByRole('button',{name:'Review payment',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Review payment'});
 await expect(review).toBeVisible();
 await expect(review).toContainText(recipient);
 await expect(review).toContainText('Invoice 42');
 expect(sent).toHaveLength(0);
 await review.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(review).toHaveCount(0);
 expect(sent).toHaveLength(0);

 // Balance moves between review and confirm → refuse and ask to review again.
 await page.getByTestId('wallet-action-send').click();
 await expect(send.getByLabel('Amount',{exact:true})).toHaveValue('1');
 await expect(send.getByLabel('Memo')).toHaveValue('Invoice 42');
 await send.getByRole('button',{name:'Review payment',exact:true}).click();
 await expect(review).toBeVisible();
 balance=9;
 await review.getByRole('button',{name:'Confirm and send'}).click();
 await expect(review.getByRole('alert')).toContainText('Balance or fee changed');
 expect(sent).toHaveLength(0);
 await review.getByRole('button',{name:'Cancel',exact:true}).click();
 balance=10;

 // Receive shows the full address.
 await page.getByTestId('wallet-action-receive').click();
 await expect(page.getByTestId('wallet-receive-dialog')).toContainText(key.address);
 await page.getByRole('dialog',{name:'Receive'}).getByRole('button',{name:'Close'}).click();

 // Settings: encrypted backup never contains the raw key and can be restored.
 await page.getByTestId('wallet-settings-button').click();
 const settings=page.getByRole('dialog',{name:'Settings'});
 const downloadPromise=page.waitForEvent('download');
 await settings.getByRole('button',{name:'Download encrypted backup'}).click();
 const download=await downloadPromise;expect(download.suggestedFilename()).toContain('people-wallet-');
 const backup=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(backup.wallet.address).toBe(key.address);
 expect(JSON.stringify(backup)).not.toContain(key.privateKey);
 await settings.getByRole('button',{name:'Import wallet',exact:true}).click();
 const importer=page.getByRole('dialog',{name:'Import wallet'});
 await importer.getByLabel('Restore encrypted backup').setInputFiles({name:'wallet.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await importer.getByLabel('Password',{exact:true}).fill('test-password');
 await importer.getByRole('button',{name:'Import wallet',exact:true}).click();
 await expect(importer).toHaveCount(0);
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ppl-web-wallets')));
 expect(restored.some(w=>w.address===key.address)).toBe(true);
 expect(JSON.stringify(restored)).not.toContain(key.privateKey);
 await page.keyboard.press('Escape');

 // Mobile layout and every shipped wallet locale.
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 for (const lang of LOCALES) {
  const copy=JSON.parse(await readFile(new URL(`../src/lib/locales/surfaces/wallet-ux-${lang}.json`,import.meta.url),'utf8'));
  await page.evaluate(lang=>{localStorage.setItem('people_lang',lang);window.dispatchEvent(new StorageEvent('storage',{key:'people_lang'}));},lang);
  const localeTabs=page.getByRole('tablist',{name:copy.walletTabsAria});
  for(const name of [copy.tokensTab,copy.nftTab,copy.historyTab])await expect(localeTabs.getByRole('tab',{name,exact:true})).toBeVisible();
  await expect(page.getByTestId('wallet-action-send')).toHaveText(copy.sendTab);
  await page.getByTestId('wallet-settings-button').click();
  const localeSettings=page.getByRole('dialog',{name:copy.settingsTab});
  await expect(localeSettings.getByRole('button',{name:copy.download,exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(localeSettings).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if(lang==='ar') await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 }
 expect(errors).toEqual([]);
});
