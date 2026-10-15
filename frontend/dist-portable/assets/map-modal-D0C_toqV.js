import{g as n,u as i,j as e}from"./portable-index-BjYQo9_9.js";import{D as d,a as u,b as x,c as p}from"./dialog-I-_J3hs2.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=n("MapPin",[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",key:"1r0f0z"}],["circle",{cx:"12",cy:"10",r:"3",key:"ilqhr7"}]]);function j({open:l,onOpenChange:c,lat:s,lng:o,employeeName:a}){const{ui:r}=i(),t=s!=null&&o!=null&&s!==""&&o!==""?`https://maps.google.com/maps?q=${s},${o}&hl=ar&z=14&output=embed`:null;return e.jsx(d,{open:l,onOpenChange:c,children:e.jsxs(u,{size:"xl",children:[e.jsx(x,{children:e.jsx(p,{children:a?`${r("موقع")} ${a}`:r("الموقع الجغرافي")})}),t?e.jsx("iframe",{title:r("خريطة الموقع"),src:t,className:"h-[360px] w-full rounded-lg border border-border",loading:"lazy",referrerPolicy:"no-referrer-when-downgrade"}):e.jsx("p",{className:"py-12 text-center text-sm text-muted-foreground",children:r("لا تتوفر إحداثيات GPS لهذا السجل.")})]})})}export{g as M,j as a};
