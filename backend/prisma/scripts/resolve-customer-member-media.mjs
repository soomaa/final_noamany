import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
const p=new PrismaClient({errorFormat:'minimal'});
const database=decodeURIComponent(new URL(process.env.DATABASE_URL||'').pathname.slice(1));
const uploadRoot=path.resolve(process.env.UPLOAD_DIR||'./uploads');
const apply=process.argv.includes('--apply');
const confirm=process.argv.find(x=>x.startsWith('--confirm-db='))?.slice(13);
if(apply&&confirm!==database)throw new Error('Use --confirm-db='+database+' to select the intended database');
const allowed=['club_members','club_member_images'];
const tableFields={club_members:'profile_picture',club_member_images:'image_path'};
const stats={database,uploadRoot,mode:apply?'apply':'plan',files:0,changes:0,resolved:0,missing:0,ambiguous:0,skippedExternal:0};
const files=new Set(),byName=new Map();
async function walk(dir){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())await walk(full);
  else if(entry.isFile()){
   const rel=path.relative(uploadRoot,full).split(path.sep).join('/');
   files.add(rel); const key=entry.name.toLowerCase();
   const found=byName.get(key)||[];found.push(rel);byName.set(key,found);
  }
 }
}
function resolveValue(value){
 let rel=String(value||'').trim();
 if(!rel||rel==='0')return {state:'empty'};
 if(/^https?:\/\//i.test(rel)){
  const url=new URL(rel);
  if(!/(^|\.)noamanycenter\.com$/i.test(url.hostname))return {state:'external'};
  rel=url.pathname;
 }
 rel=rel.replace(/\\/g,'/').split(/[?#]/)[0];
 try{rel=decodeURIComponent(rel)}catch{}
 const marker=rel.toLowerCase().indexOf('uploads/');
 if(marker>=0)rel=rel.slice(marker+8);
 rel=rel.replace(/^\/+/, '');
 if(rel.split('/').includes('..'))return {state:'missing'};
 if(files.has(rel))return {state:'resolved',path:rel};
 const choices=byName.get(path.posix.basename(rel).toLowerCase())||[];
 if(choices.length===1)return {state:'resolved',path:choices[0]};
 return {state:choices.length?'ambiguous':'missing',candidates:choices};
}
try{
 const st=await fs.stat(uploadRoot);if(!st.isDirectory())throw new Error('Upload root is not a directory');
 await walk(uploadRoot);stats.files=files.size;
 const changes=[],issues=[];
 for(const table of allowed){
  const field=tableFields[table];
  const rows=await p.$queryRawUnsafe(`SELECT id,${field} value FROM ${table} WHERE ${field} IS NOT NULL AND ${field}<>'' AND ${field}<>'0' ORDER BY id`);
  for(const row of rows){
   const match=resolveValue(row.value);
   if(match.state==='empty')continue;
   if(match.state==='resolved'){
    stats.resolved++;
    if(match.path!==row.value)changes.push({table,field,id:row.id,before:row.value,after:match.path});
   }else if(match.state==='external')stats.skippedExternal++;
   else {stats[match.state]++;issues.push({table,id:row.id,value:row.value,state:match.state,candidates:match.candidates||[]});}
  }
 }
 stats.changes=changes.length;
 const report=path.resolve('tmp/customer-member-media-plan-20261007.json');
 await fs.mkdir(path.dirname(report),{recursive:true});
 await fs.writeFile(report,JSON.stringify({stats,changes,issues},null,2)+'\n');
 if(apply){
  await p.$transaction(async tx=>{
   for(const change of changes){
    const n=await tx.$executeRawUnsafe(`UPDATE ${change.table} SET ${change.field}=? WHERE id=? AND ${change.field}=?`,change.after,change.id,change.before);
    if(n!==1)throw new Error(`Media changed since planning: ${change.table}:${change.id}`);
   }
  },{timeout:600000,maxWait:30000});
 }
 console.log(JSON.stringify({...stats,report}));
 if(issues.length)console.log('Unresolved filenames are retained and listed for review; no guesses or deletion.');
}finally{await p.$disconnect()}
