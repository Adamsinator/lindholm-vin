// Full-site smoke test against a fake Apps Script backend — no real data is touched.
//
//   npx http-server -p 8765 -c-1 .        (in the repo root, in another terminal)
//   node tools/smoke-test.js              (needs Playwright: npm i -g playwright)
//
// Logs in, clicks through every cellar tab and dialog, every atlas colour mode, filter, vineyard
// and producer panel, saves an atlas correction, logs out — on desktop, phone and dark mode.
// Prints any page errors, failed requests, HTTP errors or sideways scrolling; screenshots go to OUT.
let chromium; try{ ({chromium}=require('playwright')); }catch(e){ ({chromium}=require('/opt/node22/lib/node_modules/playwright')); }
const press = require("./press"); // a phone presses some buttons through ＋, the tabs or a menu
const OUT=require('os').tmpdir()+'/allwine-smoke/'; require('fs').mkdirSync(OUT,{recursive:true});
const BASE=process.env.BASE||'http://localhost:8765/';
const BLANK_TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
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
      case 'feed': case 'feedpost': case 'feeddelete': case 'feedcheer': case 'feedcomment': Object.assign(r,{social:true,feed:S.feed,me:'adam',users:['adam','anna'],follows:['anna']}); break;
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
  // IGN has no relief tile for a few squares at the edge of its coverage (404s, dropped by the page)
  const edgeTile = u => /data\.geopf\.fr\/wmts/.test(u||'');
  p.on('console',m=>{ if(m.type()==='error' && !edgeTile(m.location()?.url)) note(where,'console '+m.text()); });
  // relief tiles are cancelled on purpose when the view moves on before they arrive
  // the usage counts a page sends as it closes ('hits', keepalive) are cut off when the test closes the browser
  const leavingHits=q=>/ERR_ABORTED/.test(q.failure()?.errorText||'') && /"action":"hits"/.test(q.postData()||'');
  p.on('requestfailed',q=>{ if(!q.url().includes('script.google') && !leavingHits(q) && !(q.url().includes('data.geopf.fr/wmts') && /ERR_ABORTED|ERR_BLOCKED_BY_ORB/.test(q.failure()?.errorText||''))) note(where,'requestfailed '+q.url()+' '+(q.failure()?.errorText||'')); });
  p.on('response',s=>{ if(s.status()>=400 && !(s.status()<500 && edgeTile(s.url()))) note(where,'HTTP '+s.status()+' '+s.url()); });
}
const overflow=async(p,where)=>{ const o=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); if(o>1) note(where,'horizontal overflow '+o+'px'); };
(async()=>{
 // the atlas builds its map in the browser from the vineyard data: over the internet that takes seconds, not a fixed wait
 const mapReady=p=>p.waitForFunction(()=>document.querySelectorAll('#map path').length>100,null,{timeout:60000});
 const b=await chromium.launch();
 for(const [tag,vp,scheme] of [['desk',{width:1366,height:900},'light'],['mob',{width:390,height:844},'light'],['dark',{width:1366,height:900},'dark']]){
  const ctx=await b.newContext({viewport:vp,colorScheme:scheme,isMobile:tag==='mob',hasTouch:tag==='mob'});
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), backend());
  // IGN's relief tiles are decoration under the atlas, from France's map server: serve a blank tile here, so a busy
  // IGN (it refused streams once on GitHub: ERR_HTTP2_SERVER_REFUSED_STREAM) can't fail a test of this site
  await ctx.route(/data\.geopf\.fr\/wmts/, r => r.fulfill({ contentType: "image/png", body: BLANK_TILE }));
  const p=await ctx.newPage(); const W_=tag; await watch(p,W_);
  // front page, logged out
  await p.goto(BASE); await p.waitForTimeout(600); await overflow(p,tag+' front'); await p.screenshot({path:OUT+tag+'_front.png'});
  await p.click('#gateToggle'); await p.waitForTimeout(100); await p.click('#gateToggle');
  // login
  await p.fill('#gateUser','adam'); await p.fill('#gatePass','pw'); await p.click('#gateSubmit');
  await p.waitForSelector('#app:not([hidden])',{timeout:20000}).catch(()=>{}); await p.waitForTimeout(500);
  if(!(await p.isVisible('#app'))) note(tag,'app not visible after login');
  await overflow(p,tag+' cellar'); await p.screenshot({path:OUT+tag+'_cellar.png',fullPage:true});
  // cellar interactions
  try{ await press(p, '#priceBtn'); await press(p, '#priceBtn'); }catch(e){note(tag,'priceBtn '+e.message)}
  try{ await p.fill('#q','Rousseau'); await p.waitForTimeout(200); await p.fill('#q',''); }catch(e){note(tag,'search '+e.message)}
  try{ await p.click('#tbl tbody tr >> nth=0'); await p.waitForTimeout(300); }catch(e){note(tag,'row expand '+e.message)}
  try{ await press(p, '#addBtn'); await p.waitForTimeout(300); await p.screenshot({path:OUT+tag+'_addmodal.png'}); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
       const open=await p.evaluate(()=>!!document.querySelector('.modal.open')); if(open){ note(tag,'add modal does not close on Escape'); await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))); } }catch(e){note(tag,'add modal '+e.message)}
  try{ await press(p, '#tonightBtn'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.evaluate(()=>document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))); }catch(e){note(tag,'tonight '+e.message)}
  // map drill to Bourgogne (the map sits folded in the overview: open both, as a person would)
  await p.evaluate(()=>{ if(window.setLayout) ["overview","eOverview"].forEach(id=>setLayout(id, panelEls(id).map(e=>e.dataset.panel))); });
  await p.evaluate(()=>{ const o=document.getElementById('overview'); if(o) o.open=true; const m=document.getElementById('mapFold'); if(m) m.open=true; }); await p.waitForTimeout(300);
  try{ const dot=await p.$('#map circle.dot, #map .dot'); if(dot){ await dot.click(); await p.waitForTimeout(300);} }catch(e){note(tag,'map '+e.message)}
  for(const pg of ['enjoyed','wishlist','journal','feed','cellar']){
    try{ await press(p, `.tab[data-page=${pg}]`); await p.waitForTimeout(700); await overflow(p,tag+' '+pg); await p.screenshot({path:OUT+tag+'_'+pg+'.png',fullPage:true}); }
    catch(e){ note(tag,'tab '+pg+' '+e.message); }
  }
  // atlas link from app
  // the tab goes to the Wine atlas's Europe page; the Côte d'Or is one of its regions
  try{ await p.click('.tablink'); await p.waitForURL(/atlas\.html/,{timeout:15000}).catch(()=>note(tag,'tablink did not navigate'));
    if(!(await p.locator('#map .hd').count())) note(tag,'wine atlas: no regions on the Europe map');
    if(await p.isVisible('#rchips')) await p.click('#rchips button[data-r="cotedor"]'); else await p.click('#side button[data-go="cotedor"]'); /* a phone: the region chips */
    await p.waitForURL(/#r=cotedor/,{timeout:15000}).catch(()=>note(tag,'Côte d\'Or did not open')); await mapReady(p); }catch(e){note(tag,'tablink '+e.message)}
  await overflow(p,tag+' atlas');
  // the Côte d'Or: every colour mode, the filters, search, an owner, a commune, the Côtes
  const cd = (f, ...a) => p.evaluate(f, ...a);
  try{ await p.click('#styleBtn'); await p.waitForFunction(()=>document.querySelectorAll('#fColor option').length>6,null,{timeout:10000});
    for(const col of ['commune','owners','history','size','alt','slope','faces','cellar','vintage','class']){ await p.selectOption('#fColor',col); await p.waitForTimeout(120); }
    await p.click('#rotR'); await p.click('#rotR'); await p.waitForTimeout(200);
    if(await cd(()=>localStorage.getItem('atlasRot'))!=='30') note(tag,'rotation not applied');
    await p.keyboard.press('Escape'); await p.click('#compass'); await p.waitForTimeout(300); if(await cd(()=>localStorage.getItem('atlasRot'))!=='0') note(tag,'compass did not reset north');
  }catch(e){ note(tag,'map panel '+e.message); await p.keyboard.press('Escape').catch(()=>{}); }
  for(const ch of ['#fGC','#f1er','#fV','#cdMono','#cdMono','#fGC','#f1er','#fV']){ try{ if(await p.isVisible(ch)) await p.click(ch); else if(tag!=='mob') note(tag,'filter '+ch+' hidden'); }catch(e){note(tag,'filter '+ch+' '+e.message)} }
  if(await p.isVisible('#cdFilters')){ await p.click('#cdFilters [data-cdcol=W]'); await p.waitForTimeout(150);
    if(!(await cd(()=>byId('montrachet') && !byId('montrachet').el.classList.contains('dim') && byId('chambertin').el.classList.contains('dim')))) note(tag,'white filter did not keep only white'); await p.click('#cdFilters [data-cdcol=""]'); }
  const box = (await p.isVisible('#fSearch')) ? '#fSearch' : null;
  if(box){ await p.fill(box,'suchots'); await p.waitForTimeout(250); await p.press(box,'Enter'); await p.waitForTimeout(400);
    if(await cd(()=>st.sel)!=='suchots') note(tag,'search did not open Les Suchots');
    await p.fill(box,'domaine leroy'); await p.waitForTimeout(250); await p.press(box,'Enter'); await p.waitForTimeout(400);
    if(!(await p.isVisible('.prodbar'))) note(tag,'owner bar not shown after an owner search');
    else { await cd(()=>$('prodX').click()); await p.waitForTimeout(200); if(await cd(()=>st.prod)) note(tag,'owner still set after ✕'); } }
  await cd(()=>select(null)); await p.waitForTimeout(300);
  if(await p.isVisible('#cdVil')){ await p.selectOption('#cdVil','gevrey'); await p.waitForTimeout(400); if(!/Gevrey/.test(await p.textContent('#side h2'))) note(tag,'commune select did not open Gevrey');
    await cd(()=>{ st.vsel=null; renderSide(); }); await p.waitForTimeout(200); }
  else note(tag,'no commune menu in the region panel');
  if(await p.isVisible('.cdjump [data-cote=beaune]')){ await cd(()=>document.querySelector('.cdjump [data-cote=beaune]').click()); await p.waitForTimeout(400); }
  // orientation: the locator jump, zoomed in
  await cd(()=>{ const [x,y,w,h]=st.view; zoomAt(.2,x+w/2,y+h/2); }); await p.waitForTimeout(600);
  if(await p.isVisible('#locator')){ const bx=await p.$eval('#locator', e=>{const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height*.8];}); await p.mouse.click(bx[0],bx[1]); await p.waitForTimeout(500); }
  else if(tag!=='mob') note(tag,'locator hidden when zoomed in');
  // vintages: colour by vintage, step the year, the table drives the map, the vineyard panel has a chart
  await cd(()=>select(null)); await p.waitForFunction(()=>document.querySelectorAll('.vtab tbody tr').length>=20,null,{timeout:15000}).catch(()=>note(tag,'no vintage table in the region panel'));
  const vrow = await p.$('.vtab tbody tr:nth-child(4) [data-vy]'); if(vrow){ await vrow.evaluate(e=>e.click()); await p.waitForTimeout(300); /* a phone: below the sheet's fold */ if(await cd(()=>st.color)!=='vintage') note(tag,'a vintage table year did not colour the map'); }
  const y0 = await p.textContent('#legend .vyear b').catch(()=>null); if(!y0) note(tag,'vintage legend has no year');
  else { await cd(()=>document.querySelector('#legend [data-vstep="-1"]').click()); await p.waitForTimeout(200); if((await p.textContent('#legend .vyear b'))===y0) note(tag,'vintage step did not change the year'); }
  await cd(()=>select('latache')); await p.waitForTimeout(300); if(!(await p.$('#side .vchart'))) note(tag,'no vintage chart in the vineyard panel');
  await cd(()=>{ st.color='class'; paint(); renderLegend(); });
  // language: Danish and French re-render the panel, English comes back
  for(const [lg, word] of [['da','Ejere'],['fr','Propriétaires'],['en','Owners']]){
    const pick = await p.$(`.langpick [data-lang=${lg}]`); if(!pick || !(await pick.isVisible())) continue;
    await pick.click(); await p.waitForFunction(l => document.documentElement.lang === l, lg, { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
    if(!(await p.textContent('#side')).includes(word)) note(tag, `panel not in ${lg} after switching language`); }
  await p.screenshot({path:OUT+tag+'_atlas.png'});
  // every climat's panel renders, with its description; every owner's holdings
  const ids=await cd(()=>({c:st.pack.climats.map(c=>c.id), p:Object.keys(st.pack.producers).filter(k=>st.pack.climats.some(c=>holds(c,k)))}));
  for(const id of ids.c){
    const bad = await cd(id=>{ select(id); const c=byId(id), t=document.getElementById('side').textContent; return /M-?\d+(\.\d+)? -?\d+(\.\d+)?L/.test(t) || (c.d && !t.includes(c.d.slice(0,25))) || !t.includes(c.n); }, id);
    if(bad) note(tag,'side panel for '+id+' does not show its name or description');
  }
  const sideEmpty=await cd(()=>document.getElementById('side').textContent.trim().length<20); if(sideEmpty) note(tag,'side panel empty after clicks');
  for(const k of ids.p.slice(0, tag==='desk'?999:30)){ const ok = await cd(k=>{ setProd(k); return !!document.querySelector('.prodbar'); }, k); if(!ok) note(tag,'no holdings bar for '+k); }
  await cd(()=>setProd(null));
  // edit flow (the cellar's login is in this browser)
  await cd(()=>select('latache')); await p.waitForTimeout(400);
  // through the page, not clicks: on a phone the panel is a sheet, and these lie below its fold
  if(await p.$('#edOpen')){ await cd(()=>$('edOpen').click()); await p.waitForSelector('#edForm',{timeout:5000}).catch(()=>{});
    await cd(()=>{ $('edP').value='Domaine Leroy'; $('edHa').value='0.1'; $('edN').value='smoke'; $('edForm').requestSubmit(); });
    await p.waitForFunction(()=>/Domaine Leroy/.test(document.getElementById('side').textContent) && !document.getElementById('edForm'),null,{timeout:10000}).catch(()=>note(tag,'edit did not apply')); }
  else note(tag,'no edit button while logged in');
  // logout returns to the front page
  await p.goto(BASE); await p.waitForSelector('#app:not([hidden])',{timeout:20000}).catch(()=>{}); await p.waitForTimeout(300);
  try{ await press(p, '#lockBtn'); await p.waitForTimeout(400); if(!(await p.isVisible('#gate'))) note(tag,'gate not shown after logout'); if(!(await p.isVisible('.atlascard'))) note(tag,'atlas card missing after logout'); }catch(e){note(tag,'logout '+e.message)}
  await ctx.close();
 }
 // atlas DOM size and timing
 const p=await b.newPage(); const t0=Date.now(); await p.goto(BASE+'atlas.html#r=cotedor'); await p.waitForLoadState('load'); await mapReady(p);
 const stats=await p.evaluate(()=>({nodes:document.getElementsByTagName('*').length, svg:document.querySelectorAll('#map *').length, labels:document.querySelectorAll('#map .lb').length}));
 const t=await p.evaluate(()=>{ const t0=performance.now(); for(let i=0;i<20;i++){ document.getElementById('zIn').click(); } return performance.now()-t0; });
 console.log('atlas load ms', Date.now()-t0, JSON.stringify(stats), '20 zoom clicks ms', Math.round(t));
 console.log(findings.length? findings.join('\n') : 'NO FINDINGS'); console.log('screenshots in', OUT);
 process.exitCode = findings.length ? 1 : 0;
 await b.close();
})();
