import { formatDisplayNumber } from '@/lib/number-display';
import {Eye,Printer,ChevronDown,CheckCircle2,Clock3,SkipForward} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {dayLabel,savedDayNumber} from './day-number';
import {exerciseLabel} from './exercise-label';
import {latestDaySession,sessionProgress} from './history-model';
import {openTrainingReport,sessionReportHtml} from './history-report';
import {WorkoutDay,openWorkoutSheet} from './workout-sheet';
import type {Exercise,Journey,PlanDay,Session} from './model';
export function ReportActions({label,onPreview,onPrint,ar,showPrint=true}:{label:string;onPreview:()=>void;onPrint:()=>void;ar:boolean;showPrint?:boolean}) {
 return <div className="flex shrink-0 gap-1"><Button permissionAction={null} variant="outline" size="icon" className="size-11" aria-label={`${ar?'معاينة':'Preview'} · ${label}`} title={ar?'معاينة التقرير':'Report preview'} onClick={onPreview}><Eye className="size-4"/></Button>{showPrint && <Button permissionAction={null} variant="outline" size="icon" className="size-11" aria-label={`${ar?'طباعة':'Print'} · ${label}`} title={ar?'طباعة / حفظ PDF':'Print / Save PDF'} onClick={onPrint}><Printer className="size-4"/></Button>}</div>;
}
export function ProgressLine({session,ar}:{session:Session;ar:boolean}) {
 const p=sessionProgress(session.entries);
 return <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm tabular-nums"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-4 text-primary"/>{formatDisplayNumber(p.done)}/{formatDisplayNumber(p.total)} {ar?'منجزة':'done'}</span><span className="inline-flex items-center gap-1"><Clock3 className="size-4"/>{formatDisplayNumber(p.remaining)} {ar?'متبقية':'remaining'}</span>{p.skipped>0&&<span className="inline-flex items-center gap-1"><SkipForward className="size-4"/>{formatDisplayNumber(p.skipped)} {ar?'متخطاة':'skipped'}</span>}</div>;
}
export function PlannedDayHistory({assignment,sessions,memberName,trainerName,locale,onExercise}:{assignment:NonNullable<Journey['assignment']>;sessions:Session[];memberName:string;trainerName?:string;locale:string;onExercise:(e:Exercise)=>void}) {
 const days=assignment.snapshot.days.map((day,index)=>({...day,name:savedDayNumber(day.name)??String(index+1)})).sort((a,b)=>Number(a.name)-Number(b.name));
 const reportPlan={...assignment.snapshot,days};
 return <div className="mt-6 divide-y">{days.map(day=>{
 const lang=day.reportLocale??locale,ar=lang==='ar',label=dayLabel(day,lang),latest=latestDaySession(day,sessions,assignment.id);
 const options={locale:lang,dayId:day.id,memberName,trainerName,startDate:assignment.start_date};
 return <div key={day.id} lang={lang} dir={ar?'rtl':'ltr'} className="flex items-start gap-3 py-4">
 <details className="group min-w-0 flex-1"><summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180"/><div className="min-w-0 flex-1"><h3 className="font-semibold">{label}<span className="ms-3 text-sm font-normal text-muted-foreground">· {formatDisplayNumber(day.exercises.length)} {ar?'تمارين':'exercises'}</span></h3><div className="mt-2">{latest?<><ProgressLine session={latest} ar={ar}/><p className="mt-1 text-xs text-muted-foreground">{ar?'آخر حصة':'Latest session'} · {latest.date}</p></>:<p className="text-sm text-muted-foreground">{ar?'لم يبدأ بعد':'Not started'} · {formatDisplayNumber(day.exercises.reduce((n,e)=>n+e.sets,0))} {ar?'مجموعة مطلوبة':'planned sets'}</p>}</div></div></summary><WorkoutDay day={day} ar={ar} onPreview={onExercise}/></details>
 <ReportActions label={label} ar={ar} onPreview={()=>openWorkoutSheet(reportPlan,options)} onPrint={()=>openWorkoutSheet(reportPlan,{...options,print:true})}/>
 </div>;
 })}</div>;
}
export function RecordedSession({session,day,memberName,trainerName,locale,onEdit,canEdit}:{session:Session;day?:PlanDay;memberName:string;trainerName?:string;locale:string;onEdit:()=>void;canEdit:boolean}) {
 const lang=day?.reportLocale??locale,ar=lang==='ar',label=`${day?dayLabel(day,lang):ar?'حصة':'Session'} · ${session.date}`;
 const report=()=>sessionReportHtml(session,{locale:lang,memberName,trainerName,dayName:day?dayLabel(day,lang):ar?'حصة سابقة':'Previous session'});
 return <div className="flex items-start gap-3 py-4" lang={lang} dir={ar?'rtl':'ltr'}><details className="group min-w-0 flex-1"><summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronDown className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180"/><div className="min-w-0"><h3 className="font-semibold">{label}</h3><div className="mt-2"><ProgressLine session={session} ar={ar}/></div><p className="mt-2 text-xs text-muted-foreground">{session.status==='completed'?(ar?'الحصة منتهية':'Session finished'):(ar?'الحصة جارية':'Session in progress')}</p></div></summary><ul className="mt-4 divide-y">{session.entries.map(e=>{const p=sessionProgress([e]);return <li key={e.rowId??e.key} className="py-3"><p className="font-medium">{exerciseLabel(e,lang)}</p><p className="mt-1 text-sm text-muted-foreground">{e.skipped?(ar?'تم تخطيه':'Skipped'):`${formatDisplayNumber(p.done)}/${formatDisplayNumber(p.total)} ${ar?'مجموعات منجزة':'sets done'} · ${formatDisplayNumber(p.remaining)} ${ar?'متبقية':'remaining'}`}</p><p className="mt-1 text-sm tabular-nums">{e.sets.filter(s=>s.done&&!e.skipped).map(s=>e.kind==='strength'?`${formatDisplayNumber(s.weight)} kg × ${formatDisplayNumber(s.reps)}`:`${formatDisplayNumber(s.seconds)} s`).join(' · ')}</p></li>})}</ul>{session.note&&<p className="mt-3 whitespace-pre-wrap text-sm">{session.note}</p>}<Button permissionAction={null} className="mt-4" variant="outline" onClick={onEdit}>{canEdit?(ar?'فتح سجل الأداء':'Open performance log'):(ar?'عرض السجل':'View log')}</Button></details><ReportActions label={label} ar={ar} onPreview={()=>openTrainingReport(report(),lang)} onPrint={()=>openTrainingReport(report(),lang,true)}/></div>;
}
