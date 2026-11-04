import config from "./demo-config.json";
const KEY = "rawnaq-demo-v1";
const admin = {id:"demo-admin",display_name:"إدارة تجريبية",role:"admin",active:true};
const fresh = () => ({leads:[],appointments:[],activities:[],profiles:[admin],config:structuredClone(config),qa:[]});
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { return fresh(); } };
const save = d => localStorage.setItem(KEY,JSON.stringify(d));
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export const configured = true;
export const db = {auth:{signOut:async()=>({error:null})}};
export const arabicError = e => e?.message || "تعذر تنفيذ العملية";
export async function loadWorkspace(){ return read(); }
export async function rpc(name,args={}){
 const d=read(), p=args.p||{}, lead=d.leads.find(l=>l.id===args.lid), ap=d.appointments.find(a=>a.id===args.aid);
 const l=lead || (ap&&d.leads.find(x=>x.id===ap.lead_id));
 if(l && args.expected!==undefined && l.revision!==args.expected) throw Error("البيانات اتغيرت. حدّث الصفحة وحاول تاني.");
 const log=(target,body)=>d.activities.push({id:id(),lead_id:target.id,actor_id:admin.id,kind:name,body,details:{},created_at:now()});
 let result;
 if(name==="add_lead"){
  if(d.leads.some(x=>x.contact===p.contact))throw Error("رقم التواصل مسجل بالفعل");
  result=id();
  const x={id:result,...p,stage:"new",grade:"cold",next_action:"first_reply",next_at:p.next_at||now(),received_at:p.received_at||now(),first_response_at:null,qualified_at:null,booking_offered_at:null,first_booked_at:null,objection_id:null,lost_reason_id:null,last_outcome:null,need:p.need||"",note:p.note||"",campaign:p.campaign||"",follow_up_count:0,revision:1,created_at:now(),updated_at:now()};
  d.leads.push(x);log(x,"تمت إضافة عميلة تجريبية");
 } else if(name==="record_contact"&&l){
  if(["lost","unqualified","attended"].includes(l.stage))throw Error("أعيدي فتح الملف أولًا");
  if(p.first_reply){if(l.first_response_at)throw Error("الرد الأول مسجل بالفعل");l.first_response_at=p.contact_at;l.stage=l.stage==="new"?"contacted":l.stage;}
  Object.assign(l,{last_outcome:p.outcome,next_action:p.next_action,next_at:p.next_at,follow_up_count:l.follow_up_count+(p.is_follow_up?1:0)});
  log(l,p.body||"تم تسجيل تواصل");
 } else if(name==="update_lead"&&l){
  if(!l.first_response_at&&!["lost","unqualified"].includes(p.stage))throw Error("سجلي الرد الأول قبل تغيير الحالة");
  if(["qualified","booking_offered"].includes(p.stage)&&!p.need?.trim())throw Error("سجلي ملخص الاحتياج أولًا");
  if(p.stage==="lost"&&!p.lost_reason_id)throw Error("اختاري سبب الفقد");
  Object.assign(l,p,{objection_id:p.objection_id||null,lost_reason_id:p.lost_reason_id||null});
  if(p.stage==="qualified"||p.stage==="booking_offered")l.qualified_at ||= now();
  if(p.stage==="booking_offered")l.booking_offered_at ||= now();
  if(["lost","unqualified"].includes(p.stage)){l.next_action=null;l.next_at=null;}
  log(l,"تم تحديث بيانات العميلة");
 } else if(name==="book_appointment"&&l){
  if(!l.first_response_at||!l.qualified_at||!l.booking_offered_at)throw Error("سجلي الرد والتأهيل وعرض الحجز أولًا");
  if(d.appointments.some(a=>a.lead_id===l.id&&["scheduled","confirmed"].includes(a.status)))throw Error("يوجد حجز قائم");
  result=id();d.appointments.push({id:result,lead_id:l.id,starts_at:p.starts_at,status:"scheduled",note:p.note||"",created_by:admin.id,created_at:now()});
  Object.assign(l,{stage:"booked",first_booked_at:l.first_booked_at||now(),next_action:"confirm",next_at:p.starts_at});log(l,"تم تثبيت الحجز");
 } else if(name==="set_appointment"&&l&&ap){
  if(["attended","no_show"].includes(p.status)&&new Date(ap.starts_at)>new Date())throw Error("لا يمكن تسجيل الحضور أو الغياب قبل الموعد");
  ap.status=p.status;
  if(p.status==="confirmed")Object.assign(l,{stage:"booked",next_action:"attendance",next_at:ap.starts_at});
  if(p.status==="attended")Object.assign(l,{stage:"attended",next_action:null,next_at:null});
  if(["no_show","cancelled"].includes(p.status))Object.assign(l,{stage:"follow_up",next_action:"recovery",next_at:p.next_at});
  log(l,"تم تحديث نتيجة الحجز");
 } else if(name==="reopen_lead"&&l){
  Object.assign(l,{stage:l.first_response_at?"follow_up":"new",lost_reason_id:null,next_action:l.first_response_at?"follow_up":"first_reply",next_at:p.next_at});log(l,p.note||"إعادة فتح الملف");
 } else if(name==="save_configuration"){
  const x=d.config.find(c=>c.id===p.id); if(x)Object.assign(x,p);else d.config.push({...p,sort_order:0,meta:{}});
 } else if(name==="manage_member"){
  const x=d.profiles.find(x=>x.id===args.uid);if(x)Object.assign(x,p);else d.profiles.push({id:args.uid,...p});
 } else if(name==="save_qa"&&l){
  const weights={response:10,greeting:10,discovery:15,understanding:15,trust:10,objection:15,booking:15,follow_up:10};
  let total=0,denom=0;for(const [k,v] of Object.entries(p.scores||{})){if(v!==null&&v!==""){const n=Number(v);if(!weights[k]||n<0||n>weights[k])throw Error("الدرجة خارج النطاق");total+=n;denom+=weights[k];}}
  if(!denom)throw Error("أدخلي درجة معيار واحد على الأقل");
  d.qa.push({id:id(),lead_id:l.id,rep_id:l.owner_id,reviewer_id:admin.id,scores:p.scores,score:Math.round(total/denom*1000)/10,note:p.note,created_at:now()});
 } else throw Error("العملية غير متاحة في نسخة الاختبار");
 if(l){l.revision++;l.updated_at=now();}
 save(d);return result;
}
