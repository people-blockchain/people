import { test, expect } from '@playwright/test';
// Isolated browser test fixtures. No fixture markets ship in the application.
const base = { status:'undeployed',chainId:97401,height:'100',blockHash:'0x'+'a'.repeat(64),timestamp:Math.floor(Date.now()/1000),contract:null,markets:[],marketCount:'0',orders:[],orderCount:'0',trades:[],historyFrom:null,credits:null,accountBalance:null,admin:null,page:0,orderPage:0 };
for (const width of [390,1280]) test(`honest undeployed state and locale navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/predict?**',r=>r.fulfill({json:base}));
 await page.goto('/predict');
 await expect(page.getByRole('heading',{name:'The first market starts with clear rules.'})).toBeVisible();
 await expect(page.locator('.pp-market-card')).toHaveCount(0);
 await expect(page.locator('.pp-network')).toContainText('100');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Switch to Russian'}).click();
 await expect(page.getByRole('heading',{name:'Первый рынок начинается с ясных правил.'})).toBeVisible();
 await page.getByRole('link',{name:'Как это работает',exact:true}).click();
 await expect(page.getByRole('heading',{name:'04 / Споры и расчёт'})).toBeVisible();
 await expect(page.locator('.pp-rules')).toContainText('48 часов');
});
test('RPC failure displays unavailable state, never invented markets',async({page})=>{
 await page.route('**/api/predict?**',r=>r.fulfill({status:503,json:{error:'rpc_unavailable'}}));
 await page.goto('/predict');
 await expect(page.locator('.pp-alert[role="alert"]')).toContainText('Network data is unavailable');
 await expect(page.locator('.pp-network')).toContainText('Network unavailable');
 await expect(page.locator('.pp-market-card')).toHaveCount(0);
});
test('wrong wallet chain prevents all writes',async({page})=>{
 await page.addInitScript(()=>{
  window.predictTestRequests=[];
  window.ethereum={request:async({method})=>{window.predictTestRequests.push(method);if(method==='eth_accounts')return[];if(method==='eth_requestAccounts')return['0x1111111111111111111111111111111111111111'];if(method==='eth_chainId')return'0x1';throw Object.assign(new Error('denied'),{code:4001});},on(){},removeListener(){}};
 });
 await page.route('**/api/predict?**',r=>r.fulfill({json:{...base,accountBalance:'1000000000000000000'}}));
 await page.goto('/predict/portfolio');
 await page.locator('.pp-header').getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(page.getByRole('alert').or(page.locator('.pp-alert')).first()).toContainText('97401');
 await expect(page.getByRole('button',{name:'Withdraw',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>window.predictTestRequests.filter(x=>/sendTransaction|sign|private|secret/i.test(x)))).toEqual([]);
});
test('event fixture renders exact terms, no chart without trades, disabled unconnected writes',async({page})=>{
 const m={id:'1',title:'TEST FIXTURE — official launch by deadline?',terms:'YES only if the official source confirms by the exact UTC deadline. Otherwise NO.',source:'https://example.org/official',category:'Science',closeAt:base.timestamp+3600,resolver:'0x2222222222222222222222222222222222222222',arbiter:'0x3333333333333333333333333333333333333333',proposedAt:0,proposedOutcome:0,disputed:false,outcome:0,collateral:'1000000000000000000'};
 await page.route('**/api/predict?**',r=>r.fulfill({json:{...base,status:'ready',contract:'0x1111111111111111111111111111111111111111',markets:[m],marketCount:'1',historyFrom:'1'}}));
 await page.goto('/predict/event/1');
 await expect(page.getByRole('heading',{name:m.title})).toBeVisible();
 await expect(page.locator('.pp-terms')).toContainText(m.terms);
 await expect(page.locator('.pp-chart-empty')).toContainText('real executed trades');
 await expect(page.getByRole('button',{name:'Place limit order',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Back a Yes + No pair',exact:true})).toBeDisabled();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
