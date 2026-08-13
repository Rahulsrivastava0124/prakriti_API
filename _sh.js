require('module-alias/register');
global.compactLog=()=>{};
const c=require('@library/common');
const run=(label,fn)=>new Promise(r=>{
  const t=Date.now(); let done=false;
  const to=setTimeout(()=>{ if(!done){ console.log(label.padEnd(46),'PENDING >20s'); r(); } },20000);
  fn().then(v=>{ done=true; clearTimeout(to); console.log(label.padEnd(46),(Date.now()-t)+'ms', typeof v==='object'?'(obj)':v); r(); })
      .catch(e=>{ done=true; clearTimeout(to); console.log(label.padEnd(46),'ERR',e.message.slice(0,50)); r(); });
});
(async()=>{
  await run('getTotalStockByUser(31)',            ()=>c.getTotalStockByUser(31));
  await run('getTotalStockPriceByUser(null,31)',  ()=>c.getTotalStockPriceByUser(null,31));
  await run('getTotalStockByUser(31,material)',   ()=>c.getTotalStockByUser(31,'material'));
  await run('getTotalStockPriceByUser(null,31,material)', ()=>c.getTotalStockPriceByUser(null,31,'material'));
  await run('getTransferSale(31)',                ()=>c.getTransferSale(31));
  process.exit(0);
})();
