require('module-alias/register');
global.compactLog=()=>{};
const ctrl=require('@controllers/superadmin/dashboard.controller');
const call=(sec,userId,role)=>new Promise(r=>{
  const t=Date.now();
  const res={send:(d)=>r({ms:Date.now()-t,ok:d&&d.success,fields:d&&d.data?Object.keys(d.data).length:0}),status:()=>res};
  ctrl[sec]({userId,role,query:{},params:{},body:{},headers:{}},res);
});
(async()=>{
  for (const [label,sec,u,role] of [['admin stock  (1st)','stock',31,2],['admin stock  (2nd)','stock',31,2],
                                    ['admin summary','summary',31,2],['admin charts','charts',31,2]]) {
    const r=await call(sec,u,role);
    console.log(label.padEnd(20), String(r.ms).padStart(6)+'ms  success='+r.ok+'  fields='+r.fields);
  }
  process.exit(0);
})();
