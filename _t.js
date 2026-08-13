require('module-alias/register');
global.compactLog=()=>{};
const c=require('@library/common');
const req={userId:31,role:2,query:{},params:{},body:{},headers:{}};
const time=async(label,fn)=>{const t=Date.now();try{await fn();}catch(e){console.log(label,'ERR',e.message.slice(0,60));}console.log(label.padEnd(34), (Date.now()-t)+'ms');};
(async()=>{
  await time('getPurchaseProductsUser(countsOnly)', ()=>c.getPurchaseProductsUser(req,null,true));
  await time('getPurchaseProductsUser(full)',       ()=>c.getPurchaseProductsUser(req,null,false));
  await time('getTransferSale(31)',                 ()=>c.getTransferSale(31));
  await time('getWalletBalance(31)',                ()=>c.getWalletBalance(31));
  process.exit(0);
})();
