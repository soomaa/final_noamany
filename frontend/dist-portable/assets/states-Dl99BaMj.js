import{g as n,u as l,j as e,h as m,B as x}from"./portable-index-BjYQo9_9.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=n("CircleAlert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=n("Inbox",[["polyline",{points:"22 12 16 12 14 15 10 15 8 12 2 12",key:"o97t9d"}],["path",{d:"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",key:"oot6mr"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=n("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=n("ServerCrash",[["path",{d:"M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2",key:"4b9dqc"}],["path",{d:"M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2",key:"22nnkd"}],["path",{d:"M6 6h.01",key:"1utrut"}],["path",{d:"M6 18h.01",key:"uhywen"}],["path",{d:"m13 6-4 6h6l-4 6",key:"14hqih"}]]);function u({icon:a=p,title:s,description:r,action:o,className:t,compact:d}){return e.jsxs("div",{className:m("flex flex-col items-center justify-center rounded-2xl border border-dashed text-center","border-primary/20 bg-gradient-to-b from-primary/[0.04] via-muted/15 to-muted/35","shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.05)]","dark:border-white/35 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",d?"px-5 py-10":"px-6 py-16",t),children:[e.jsx("div",{className:"mb-4 flex size-14 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-primary/15 dark:bg-primary/10 dark:ring-primary/25",children:e.jsx(a,{className:"size-7 text-primary/60 dark:text-primary/70"})}),e.jsx("h3",{className:"text-lg font-semibold dark:text-white",children:s}),r&&e.jsx("p",{className:"mt-2 max-w-md text-sm leading-relaxed text-muted-foreground dark:text-white/85",children:r}),o&&e.jsx("div",{className:"mt-6",children:o})]})}function g({title:a,message:s,onRetry:r,className:o,inline:t}){const{t:d}=l(),i=a??d("errors.loadFailed"),c=s??d("errors.loadFailedMessage");return e.jsxs("div",{className:m("flex flex-col items-center justify-center rounded-2xl border text-center",t?"border-border/80 bg-card px-6 py-12 shadow-sm":"border-amber-200/60 bg-gradient-to-b from-amber-50/80 to-orange-50/40 px-6 py-16 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20",o),children:[e.jsx("div",{className:m("mb-4 flex size-14 items-center justify-center rounded-2xl",t?"bg-muted text-muted-foreground":"bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"),children:t?e.jsx(b,{className:"size-7"}):e.jsx(h,{className:"size-7"})}),e.jsx("h3",{className:m("text-lg font-semibold",!t&&"text-amber-900 dark:text-amber-100"),children:i}),e.jsx("p",{className:"mt-2 max-w-md text-sm leading-relaxed text-muted-foreground",children:c}),r&&e.jsxs(x,{variant:t?"default":"outline",className:"mt-6 gap-2",onClick:r,children:[e.jsx(y,{className:"size-4"}),d("errors.retry")]})]})}function f({title:a,className:s}){const{t:r}=l();return e.jsx(u,{className:s,title:a??r("errors.notImplemented"),description:r("errors.notImplementedMessage")})}export{g as E,p as I,f as N,u as a};
