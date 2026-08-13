require('module-alias/register');
require('dotenv').config();
const {base64FileUpload}=require('@helpers/upload');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async()=>{
  const configured = !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
  console.log('R2 configured:', configured);
  const t=Date.now(); const r=await base64FileUpload(png,'users');
  console.log('result:', JSON.stringify(r), 'in', Date.now()-t, 'ms');
  process.exit(0);
})();
