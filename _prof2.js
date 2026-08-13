require('module-alias/register');
global.compactLog=()=>{};
const db=require('@models');
let n=0,dbms=0;
const orig=db.sequelize.query.bind(db.sequelize);
db.sequelize.query=async function(sql,opts){ n++; const t=Date.now(); try{return await orig(sql,opts);} finally{dbms+=Date.now()-t;} };
const ctrl=require('@controllers/superadmin/dashboard.controller');
const t0=Date.now();
const res={
  send:(d)=>{ const fields=d&&d.data?Object.keys(d.data).length:0;
    console.log(`RESULT ${Date.now()-t0}ms | ${dbms}ms DB | ${n} queries | success=${d&&d.success} fields=${fields} msg=${d&&d.message}`);
    if(d&&d.data) console.log('  sample:', JSON.stringify({total_admin:d.data.total_admin,total_retailer:d.data.total_retailer,total_purchase:d.data.total_purchase,wallet_balance:d.data.wallet_balance}));
    process.exit(0); },
  status:(c)=>{ console.log('HTTP STATUS', c); return res; },
};
const sec=process.argv[4]||'summary';
ctrl[sec]({userId:Number(process.argv[2]),role:Number(process.argv[3]),query:{},params:{},body:{},headers:{}},res);
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},180000);
