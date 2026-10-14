// Full-site smoke test against a fake Apps Script backend — no real data is touched.
//
//   npx http-server -p 8765 -c-1 .        (in the repo root, in another terminal)
//   node tools/smoke-test.js              (needs Playwright: npm i -g playwright)
//
// Logs in, clicks through every cellar tab and dialog, every atlas colour mode, filter, vineyard
// and producer panel, saves an atlas correction, logs out — on desktop, phone and dark mode.
// Prints any page errors, failed requests, HTTP errors or sideways scrolling; screenshots go to OUT.
let chromium; try{ ({chromium}=require('playwright')); }catch(e){ ({chromium}=require('/opt/node22/lib/node_modules/playwright')); }
const OUT=require('os').tmpdir()+'/allwine-smoke/'; require('fs').mkdirSync(OUT,{recursive:true});
const BASE=process.env.BASE||'http://localhost:8765/';
const W=(o)=>Object.assign({country:'Frankrig',region:'Bourgogne',commune:'',classification:'',type:'Rød',grape:'Pinot Noir',vintage:2018,qty:1,drunk:0,price:'',rating:'',value:'',acquired:'2024-01-10',drunkDate:'',drinkFrom:'',drinkTo:'',size:'',source:'',note:''},o);
function backend(){
  const S={wines:[
    W({row:2,producer:'Domaine de la Romanée-Conti',commune:'Vosne-Romanée',name:'La Tâche',classification:'Grand Cru',vintage:2015,qty:1,price:45000,rating:98}),
    W({row:3,producer:'Sylvain Cathiard',commune:'Vosne-Romanée',name:'Aux Malconsorts',classification:'1er Cru',vintage:2017,qty:3,price:3200,drunk:1,drunkDate:'2025-05-01'}),
    W({row:4,producer:'Armand Rousseau',commune:'Gevrey-Chambertin',name:'Clos St-Jacques',classification:'1er Cru',vintage:2016,qty:2,price:4500}),
    W({row:5,producer:'Domaine Leflaive',commune:'Puligny-Montrachet',name:'Les Pucelles',classification:'1er Cru',type:'Hvid',grape:'Chardonnay',vintage:2019,qty:2,price:2100,size:'Magnum'}),
    W({row:6,producer:'Krug',region:'Champagne',commune:'Reims',name:'Grande Cuvée',type:'Mousserende',grape:'',vintage:'NV',qty:2,price:1800}),
    W({row:7,producer:'Egon Müller',country:'Tyskland',region:'Mosel',commune:'Wiltingen',name:'Scharzhofberger Kabinett',type:'Hvid',grape:'Riesling',vintage:2020,qty:6,price:600}),
    W({row:8,producer:'Giacomo Conterno',country:'Italien',region:'Piemonte',commune:'Monforte d\'Alba',name:'Barolo Cascina Francia',grape:'Nebbiolo',vintage:2013,qty:1,drunk:'x',drunkDate:'2024-12-24',price:2500,rating:96}),
  ], journal:[{row:2,date:'2025-05-01',producer:'Sylvain Cathiard',wine:'Aux Malconsorts',vintage:2017,country:'Frankrig',region:'Bourgogne',grape:'Pinot Noir',place:'Hjemme',rating:9,price:'',note:'Silk.',photo:''}],
     wish:[{row:2,producer:'Domaine Bizot',wine:'Échezeaux',vintage:2019,region:'Bourgogne',price:6000,note:''}],
     feed:[{row:2,id:'a1',time:'2025-05-01T20:00',from:'anna',type:'drank',producer:'Krug',wine:'Grande Cuvée',vintage:'NV',region:'Champagne',rating:9,note:'Yum',to:'',photo:'',cheers:['adam'],comments:[]}],
     edits:[]};
  return async route=>{
    const b=JSON.parse(route.request().postData()||'{}'); const a=b.action; let r={ok:true};
    const W2=()=>({wines:S.wines});
    switch(a){
      case 'login': r={ok:true,user:b.user,token:'tok'}; break;
      case 'data': Object.assign(r,W2()); break;
      case 'add': S.wines.push(W({row:S.wines.length+2,...b.wine})); Object.assign(r,W2()); break;
      case 'drink': {const w=S.wines.find(w=>w.row===b.row); w.drunk=(Number(w.drunk)||0)+b.qty; Object.assign(r,W2()); break;}
      case 'rate': case 'setvalue': case 'setprice': case 'setsize': case 'setwindow': case 'setdate': case 'enjoyadd': Object.assign(r,W2()); break;
      case 'journal': case 'jadd': case 'jedit': case 'jdelete': r.entries=S.journal; break;
      case 'wish': case 'wadd': case 'wedit': case 'wdelete': r.items=S.wish; break;
      case 'wtocellar': r.items=S.wish; Object.assign(r,W2()); break;
      case 'feed': case 'feedpost': case 'feeddelete': case 'feedcheer': case 'feedcomment': Object.assign(r,{feed:S.feed,me:'adam',users:['adam','anna'],follows:['anna']}); break;
      case 'follow': case 'unfollow': r.follows=['anna']; break;
      case 'photo': r.photo=''; break;
      case 'atlas': r.edits=S.edits; break;
      case 'atlasedit': S.edits.push({...b.edit,time:'2026-10-14T01:00',user:'adam'}); r.edits=S.edits; break;
      default: r={ok:false,error:'bad-action'};
    }
    r.v=25; await route.fulfill({contentType:'application/json',body:JSON.stringify(r)});
  };
}
const findings=[]; const note=(where,what)=>{findings.push(where+': '+what);};
async function watch(p,where){
  p.on('pageerror',e=>note(where,'PAGEERROR '+e.message));
  p.on('console',m=>{ if(m.type()==='error') note(where,'console '+m.text()); });
  p.on('requestfailed',q=>{ if(!q.url().includes('script.google')) note(where,'requestfailed '+q.url()); });
  p.on('response',s=>{ if(s.status()>=400) note(where,'HTTP '+s.status()+' '+s.url()); });
}
const overflow=async(p,where)=>{ const o=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); if(o>1) note(where,'horizontal overflow '+o+'px'); };
(async()=>{
 const b=await chromium.launch();
 for(const [tag,vp,scheme] of [['desk',{width:1366,height:900},'light'],['mob',{width:390,height:844},'light'],['dark',{width:1366,height:900},'dark']]){
  const ctx=await b.newContext({viewport:vp,colorScheme:scheme,isMobile:tag==='mob',hasTouch:tag==='mob'});
  await ctx.route('https://script.google.com/**', backend());
  const p=await ctx.newPage(); const W_=tag; await watch(p,W_);
  // front page, logged out
  await p.goto(BASE); await p.waitForTimeout(600); await overflow(p,tag+' front'); await p.screenshot({path:OUT+tag+'_front.png'});
  await p.click('#gateToggle'); await p.waitForTimeout(100); await p.click('#gateToggle');
  // login
  await p.fill('#gateUser','adam'); await p.fill('#gatePass','pw'); await p.click('#gateSubmit'); await p.waitForTimeout(1500);
  if(!(await p.isVisible('#app'))) note(tag,'app not visible after login');
  await overflow(p,tag+' cellar'); await p.screenshot({path:OUT+tag+'_cellar.png',fullPage:true});
  // cellar interactions
  try{ await p.click('#priceBtn'); await p.click('#priceBtn'); }catch(e){note(tag,'priceBtn '+e.message)}
  try{ await p.fill('#q','Rousseau'); await p.waitForTimeout(200); await p.fill('#q',''); }catch(e){note(tag,'search '+e.message)}
  try{ await p.click('#tbl tbody tr >> nth=0'); await p.waitForTimeout(300); }catch(e){note(tag,'row expand '+e.message)}
  try{ await p.click('#addBtn'); await p.waitForTimeout(300); await p.screenshot({path:OUT+tag+'_addmodal.png'}); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
       const open=await p.evaluate(()=>!!document.querySelector('.modal.open')); if(open){ note(tag,'add modal does not close on Escape'); await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))); } }catch(e){note(tag,'add modal '+e.message)}
  try{ await p.click('#tonightBtn'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))); }catch(e){note(tag,'tonight '+e.message)}
  // map drill to Bourgogne
  try{ const dot=await p.$('#map circle.dot, #map .dot'); if(dot){ await dot.click(); await p.waitForTimeout(300);} }catch(e){note(tag,'map '+e.message)}
  for(const pg of ['enjoyed','wishlist','journal','feed','cellar']){
    try{ await p.click(`.tab[data-page=${pg}]`); await p.waitForTimeout(700); await overflow(p,tag+' '+pg); await p.screenshot({path:OUT+tag+'_'+pg+'.png',fullPage:true}); }
    catch(e){ note(tag,'tab '+pg+' '+e.message); }
  }
  // atlas link from app
  try{ await p.click('.tablink'); await p.waitForTimeout(1200); if(!p.url().includes('burgundy')) note(tag,'tablink did not navigate'); }catch(e){note(tag,'tablink '+e.message)}
  await overflow(p,tag+' atlas');
  // atlas: every colour mode, chips, search, sorting, compare, cote buttons
  for(const col of ['commune','producer','size','owners','cellar','class']){ await p.selectOption('#fColor',col); await p.waitForTimeout(80); }
  for(const ch of ['[data-cls="GC"]','[data-cls="1er"]','[data-cls="V"]','#monoChip','#monoChip','[data-cls="GC"]','[data-cls="1er"]','[data-cls="V"]']) { try{ await p.click(ch);}catch(e){note(tag,'chip '+ch+' '+e.message)} }
  await p.fill('#fSearch','suchots'); await p.press('#fSearch','Enter'); await p.waitForTimeout(500);
  await p.fill('#fSearch','Domaine Leroy · producer'); await p.waitForTimeout(500);
  if(!(await p.isVisible('#prodChip'))) note(tag,'producer chip not shown after producer search');
  if(!(await p.isVisible('#side'))) note(tag,'drawer not open in producer view');
  await p.click('#prodChip'); await p.waitForTimeout(300);
  if(await p.isVisible('#side')) note(tag,'drawer still open after clearing producer');
  await p.click('#zInfo'); await p.waitForTimeout(200); if(!/Marsannay/.test(await p.textContent('#side'))) note(tag,'overview not shown');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); if(await p.isVisible('#side')) note(tag,'Escape did not close overview');
  await p.selectOption('#fCommune','gevrey'); await p.waitForTimeout(500);
  if(!/Gevrey/.test(await p.textContent('#side'))) note(tag,'commune select did not open Gevrey');
  for(const x of ['list','gc','cmp','domaines']){ await p.click('.xtabs [data-x='+x+']'); await p.waitForTimeout(100);
    if(!(await p.isVisible('.xpane[data-x='+x+']'))) note(tag,'tab '+x+' pane not visible'); if(x==='list') await overflow(p,tag+' list tab'); }
  for(const th of ['n','v','c','ha','own']) await p.evaluate(k=>document.querySelector('#list th[data-k='+k+']').click(), th);
  await p.click('#coteSeg [data-cote=beaune]'); await p.waitForTimeout(500);
  await p.click('#dtabs [data-t=beaune]'); await p.click('#dtabs [data-t=vosne]');
  // orientation: rotate, compass back to north, locator jump, where-am-I pill, wine colour filter
  if(await p.isVisible('#rotR')){ await p.click('#rotR'); await p.click('#rotR'); await p.waitForTimeout(300);
    if(await p.evaluate(()=>localStorage.getItem('atlasRot'))!=='30') note(tag,'rotation not applied');
    await p.click('#compass'); await p.waitForTimeout(300); if(await p.evaluate(()=>localStorage.getItem('atlasRot'))!=='0') note(tag,'compass did not reset north'); }
  await p.click('#zIn'); await p.click('#zIn'); await p.waitForTimeout(300);
  if(!(await p.isVisible('#here'))) note(tag,'where-am-I pill hidden when zoomed in');
  else { await p.click('#here'); await p.waitForTimeout(300); if(!(await p.isVisible('#side'))) note(tag,'pill click did not open the commune'); }
  if(await p.isVisible('#locator')){ const bx=await p.$eval('#locator', e=>{const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height*.8];}); await p.mouse.click(bx[0],bx[1]); await p.waitForTimeout(500); }
  await p.click('#wineSeg [data-wc=W]'); await p.waitForTimeout(200);
  if(!/of \d+ vineyards match/.test(await p.textContent('#legend'))) note(tag,'legend count missing with white filter');
  await p.click('#wineSeg [data-wc=""]');
  // vintages: colour by vintage, step the year, the table drives the map, the vineyard panel has a chart
  if(await p.$('#fColor option[value=vintage]')){
    await p.selectOption('#fColor','vintage'); await p.waitForTimeout(200);
    const y0 = await p.textContent('#legend .vyear b'); if(!y0) note(tag,'vintage legend has no year');
    else { await p.evaluate(()=>document.querySelector('#legend [data-vstep="-1"]').click()); await p.waitForTimeout(200); if((await p.textContent('#legend .vyear b'))===y0) note(tag,'vintage step did not change the year'); }
    await p.click('.xtabs [data-x=vint]'); await p.waitForTimeout(150);
    const rows = await p.$$('#vintages tr[data-vy]'); if(rows.length < 20) note(tag,'vintage table has only '+rows.length+' rows');
    else { await rows[3].click(); await p.waitForTimeout(300); }
    await p.evaluate(()=>window.__atlas.CL.latache.el.dispatchEvent(new MouseEvent('click',{bubbles:true}))); await p.waitForTimeout(200);
    if(!(await p.$('#side .vchart'))) note(tag,'no vintage chart in the vineyard panel');
    await p.selectOption('#fColor','class');
  }
  // language: Danish and French re-render the legend and panel, English comes back
  for(const [lg, word] of [['da','Klassifikation'],['fr','Classement'],['en','Classification']]){
    await p.click(`.langpick [data-lang=${lg}]`); await p.waitForTimeout(250);
    if(!(await p.textContent('#legend')).includes(word)) note(tag, `legend not in ${lg} after switching language`); }
  await p.click('#reset'); await p.waitForTimeout(400);
  await p.screenshot({path:OUT+tag+'_atlas.png'});
  // every climat, village and producer panel renders
  const ids=await p.evaluate(()=>({c:Object.keys(window.__atlas.CL), p:Object.keys(window.__atlas.PROD)}));
  for(const id of ids.c){
    const bad = await p.evaluate(id=>{ const c=window.__atlas.CL[id]; c.el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const t=document.getElementById('side').textContent; return /M-?\d+(\.\d+)? -?\d+(\.\d+)?L/.test(t) || (c.d && !t.includes(c.d.slice(0,25))); }, id);
    if(bad) note(tag,'side panel for '+id+' does not show its description');
  }
  const sideEmpty=await p.evaluate(()=>document.getElementById('side').textContent.trim().length<20); if(sideEmpty) note(tag,'side panel empty after clicks');
  for(const k of ids.p.slice(0, tag==='desk'?999:30)){ await p.evaluate(k=>{ location.hash='p='+k; }, k); }
  // edit flow
  await p.evaluate(()=>window.__atlas.CL.latache.el.dispatchEvent(new MouseEvent('click',{bubbles:true}))); await p.waitForTimeout(200);
  if(await p.$('#edOpen')){ await p.click('#edOpen'); await p.fill('#edP','Domaine Leroy'); await p.fill('#edHa','0.1'); await p.fill('#edN','smoke'); await p.click('#edForm button[type=submit]'); await p.waitForTimeout(400);
    if(!/Domaine Leroy/.test(await p.textContent('#side'))) note(tag,'edit did not apply'); }
  else note(tag,'no edit button while logged in');
  // logout returns to the front page
  await p.goto(BASE); await p.waitForTimeout(800);
  try{ await p.click('#lockBtn'); await p.waitForTimeout(400); if(!(await p.isVisible('#gate'))) note(tag,'gate not shown after logout'); if(!(await p.isVisible('.atlascard'))) note(tag,'atlas card missing after logout'); }catch(e){note(tag,'logout '+e.message)}
  await ctx.close();
 }
 // atlas DOM size and timing
 const p=await b.newPage(); const t0=Date.now(); await p.goto(BASE+'burgundy.html'); await p.waitForLoadState('load');
 const stats=await p.evaluate(()=>({nodes:document.getElementsByTagName('*').length, svg:document.querySelectorAll('#map *').length, labels:document.querySelectorAll('.lab').length}));
 const t=await p.evaluate(()=>{ const t0=performance.now(); for(let i=0;i<20;i++){ document.getElementById('zIn').click(); } return performance.now()-t0; });
 console.log('atlas load ms', Date.now()-t0, JSON.stringify(stats), '20 zoom clicks ms', Math.round(t));
 console.log(findings.length? findings.join('\n') : 'NO FINDINGS'); console.log('screenshots in', OUT);
 process.exitCode = findings.length ? 1 : 0;
 await b.close();
})();
