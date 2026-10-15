import{c as s,u as n,I as c,j as a,ar as d,s as l,as as m,i as r}from"./index-BaoRHNB2.js";import{S as p}from"./shield-check-BYGkxmHM.js";import{U as h}from"./user-cog-qj_9sv0v.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=s("ListChecks",[["path",{d:"m3 17 2 2 4-4",key:"1jhpwq"}],["path",{d:"m3 7 2 2 4-4",key:"1obspn"}],["path",{d:"M13 6h8",key:"15sg57"}],["path",{d:"M13 12h8",key:"h98zly"}],["path",{d:"M13 18h8",key:"oe0vm4"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=s("ScrollText",[["path",{d:"M15 12h-5",key:"r7krc0"}],["path",{d:"M15 8h-5",key:"1khuty"}],["path",{d:"M19 17V5a2 2 0 0 0-2-2H4",key:"zz82l3"}],["path",{d:"M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",key:"1ph1d7"}]]),b=[{to:"/admin/roles",label:r("الأدوار والصلاحيات"),require:"admin.roles:view",icon:p},{to:"/admin/exceptions",label:r("استثناءات المستخدمين"),require:"admin.exceptions:view",icon:h},{to:"/users",label:r("المستخدمون"),require:"admin.users:view",icon:u},{to:"/admin/audit",label:r("سجل التدقيق"),require:"admin.audit:view",icon:x}];function j(){const{ui:y}=n(),{can:t}=c(),i=b.filter(e=>t(e.require));return a.jsxs("div",{className:"space-y-6",children:[a.jsx("div",{className:"flex flex-wrap items-center gap-1 border-b border-border",children:i.map(e=>a.jsxs(d,{to:e.to,className:({isActive:o})=>l("flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",o?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"),children:[a.jsx(e.icon,{className:"size-4"}),e.label]},e.to))}),a.jsx(m,{})]})}export{j as AdminLayout};
