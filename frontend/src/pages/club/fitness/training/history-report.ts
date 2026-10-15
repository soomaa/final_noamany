import { getBrandProfile } from '../../../../ports/brand-registry';
import {bodyFields, type BodyCheckin, type BodyTarget} from '@/components/training/body-model';
import {exerciseLabel} from './exercise-label';
import {sessionProgress} from './history-model';
import type {Session} from './model';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function documentHtml(title: string, body: string, ar: boolean, memberName: string) {
 const brand = getBrandProfile();
 return `<!doctype html><html lang="${ar?'ar':'en'}" dir="${ar?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(brand.name)}</title><style>@font-face{font-family:Tajawal;src:url('/body3d/tajawal.woff2')}*{box-sizing:border-box}body{margin:0;background:#edf1f3;color:#14262e;font:14px/1.7 Tajawal,Arial,sans-serif;padding:24px}.sheet{max-width:900px;margin:auto;background:white;padding:32px}header{background:#14262e;color:white;padding:20px;display:flex;align-items:center;justify-content:space-between;gap:16px}header img{width:150px}h1{font-size:24px;margin:0}h2{font-size:18px;margin-top:28px}.toolbar{max-width:900px;margin:0 auto 16px}.toolbar button{background:#0a7188;color:white;border:0;border-radius:8px;padding:10px 20px;min-height:44px;font:inherit;cursor:pointer}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{text-align:start;padding:10px;border-bottom:1px solid #d2dde1;overflow-wrap:anywhere}th{background:#f2f5f6}thead{display:table-header-group}tr{break-inside:avoid}.note{white-space:pre-wrap}.scroll{overflow-x:auto}@page{size:A4;margin:12mm}@media print{body{padding:0;background:white}.sheet{padding:0}.toolbar{display:none}header,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media(max-width:600px){body{padding:12px}.sheet{padding:16px}header{flex-wrap:wrap}table{min-width:540px}}</style></head><body><div class="toolbar"><button onclick="window.print()">${ar?'طباعة / حفظ PDF':'Print / Save PDF'}</button></div><article class="sheet"><header><div><h1>${esc(title)}</h1><p>${esc(memberName)}</p></div>${brand.logoSrc ? `<img src="${esc(brand.logoSrc)}" alt="${esc(brand.name)}">` : `<strong>${esc(brand.name)}</strong>`}</header>${body}</article></body></html>`;
}
export function sessionReportHtml(session: Session, options:{locale:string;memberName:string;dayName:string;trainerName?:string}) {
 const ar=options.locale==='ar',tr=(a:string,e:string)=>ar?a:e,p=sessionProgress(session.entries);
 const summary=`<p>${esc(options.dayName)} · ${esc(session.date)} · ${tr('المدرب الحالي','Current coach')}: ${esc(options.trainerName)||'—'}</p><p>${p.done}/${p.total} ${tr('مجموعة منجزة','sets done')} · ${p.remaining} ${tr('متبقية','remaining')} · ${p.skipped} ${tr('متخطاة','skipped')}</p><p>${session.status==='completed'?tr('الحصة منتهية','Session finished'):tr('الحصة جارية','Session in progress')} · ${tr('إصدار','Revision')} ${session.revision}</p>`;
 const body=session.entries.map(e=>`<section><h2>${esc(exerciseLabel(e,options.locale))} ${e.skipped?`· ${tr('تم التخطي','Skipped')}`:''}</h2><div class="scroll"><table><thead><tr>${[tr('المجموعة','Set'),tr('الوزن / كجم','Weight / kg'),tr('التكرارات','Reps'),tr('المدة / ث','Time / sec'),tr('الحالة','Status')].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${e.sets.map((s,i)=>`<tr><td>${i+1}</td><td>${s.weight}</td><td>${s.reps}</td><td>${s.seconds}</td><td>${e.skipped?tr('متخطاة','Skipped'):s.done?tr('منجزة','Done'):tr('متبقية','Remaining')}</td></tr>`).join('')}</tbody></table></div>${e.coachNote?`<p class="note">${tr('ملاحظة المدرب','Coach note')}: ${esc(e.coachNote)}</p>`:''}${e.note?`<p class="note">${tr('ملاحظة الأداء','Performance note')}: ${esc(e.note)}</p>`:''}</section>`).join('');
 return documentHtml(tr('سجل الحصة','Session report'),summary+body+`<p class="note">${esc(session.note)}</p>`,ar,options.memberName);
}
export function measurementReportHtml(checkin:BodyCheckin,target:BodyTarget|null|undefined,locale:string,memberName:string) {
 const ar=locale==='ar',tr=(a:string,e:string)=>ar?a:e;
 return documentHtml(tr('تقرير المقاسات والهدف','Measurements & target report'),`<p>${tr('تاريخ القياس','Check-in date')}: ${esc(checkin.date)}${target?.target_date?` · ${tr('موعد الهدف','Target date')}: ${esc(target.target_date)}`:''}</p><div class="scroll"><table><thead><tr><th>${tr('المقاس','Measurement')}</th><th>${tr('المسجل','Recorded')}</th><th>${tr('الهدف الحالي','Current target')}</th></tr></thead><tbody>${bodyFields.map(f=>`<tr><th>${ar?f.ar:f.en} (${f.unit})</th><td>${checkin.measurements[f.key]??'—'}</td><td>${target?.measurements[f.key]??'—'}</td></tr>`).join('')}</tbody></table></div><p class="note">${esc(checkin.note)}</p>${target?.note?`<p class="note">${tr('ملاحظة الهدف','Target note')}: ${esc(target.note)}</p>`:''}`,ar,memberName);
}
export function openTrainingReport(html:string,locale:string,print=false) {
 const ar=locale==='ar',dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label',ar?'معاينة التقرير':'Report preview');
 Object.assign(dialog.style,{width:'min(1000px,94vw)',height:'90dvh',maxHeight:'90dvh',padding:'12px',border:'1px solid #c9d5da',borderRadius:'12px',background:'#fff',color:'#14262e'});
 const close=document.createElement('button');close.textContent=ar?'إغلاق المعاينة':'Close preview';
 Object.assign(close.style,{minHeight:'44px',padding:'8px 16px',marginBottom:'8px',border:'1px solid #c9d5da',borderRadius:'8px',background:'#fff',cursor:'pointer',font:'inherit'});close.onclick=()=>dialog.close();
 const frame=document.createElement('iframe');frame.title=ar?'تقرير التدريب القابل للطباعة':'Printable training report';frame.srcdoc=html;
 Object.assign(frame.style,{display:'block',width:'100%',height:'calc(100% - 52px)',border:'0'});
 if(print)frame.onload=()=>{void frame.contentDocument?.fonts.ready.then(()=>{if(dialog.open)frame.contentWindow?.print();});};
 dialog.append(close,frame);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();close.focus();
}
