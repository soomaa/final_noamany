import * as THREE from 'three';
import {decodeModel,fitBody,dimensions} from './fitter.mjs';
let model,renderer,scene,camera,meshes=[],config={},angle=0,disposed=false,drag=null;
const root=document.getElementById('stage');const message=document.getElementById('status');
const translations={ar:{loading:'تحميل موديل الجسم…',unavailable:'تعذر عرض الموديل. المقاسات والهدف محفوظان في الجدول.',missing:'أكمل الطول ومحيطات الجسم لإظهار الموديل.',current:'المقاسات الحالية',target:'تصور الهدف',approximate:'تصور تقريبي من المقاسات، وليس مسحًا لجسمك أو قياسًا للدهون.',fit:'هذه المقاسات خارج نطاق التشكيل الموثوق للموديل؛ راجع القيم.',front:'أمامي',side:'جانبي',back:'خلفي'},en:{loading:'Loading body model…',unavailable:'Unable to show the model. Measurements and target remain in the table.',missing:'Complete height and all circumferences to show the model.',current:'Current measurements',target:'Target sketch',approximate:'Approximate measurement-based avatar, not a body scan or fat measurement.',fit:'These measurements exceed the model’s reliable fitting range. Review the values.',front:'Front',side:'Side',back:'Back'}};
const text=key=>(translations[config.locale]??translations.ar)[key];
function tell(type,extra={}){if(window.BodyBridge)window.BodyBridge.postMessage(JSON.stringify({type,...extra}));else parent.postMessage({type:`swat-body-${type}`,...extra},location.origin);}
function status(key){message.textContent=text(key);message.hidden=false;}
function frameCamera(){
 if(!meshes.length)return;let lo=Infinity,hi=-Infinity,left=Infinity,right=-Infinity;
 for(const mesh of meshes){mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;lo=Math.min(lo,b.min.y);hi=Math.max(hi,b.max.y);const span=Math.max(Math.abs(b.min.x),Math.abs(b.max.x),Math.abs(b.min.z),Math.abs(b.max.z));left=Math.min(left,mesh.position.x-span);right=Math.max(right,mesh.position.x+span);}
 const height=hi-lo;const viewHeight=Math.max(height*1.18,(right-left)/camera.aspect*1.10);
 camera.position.set((left+right)/2,(lo+hi)/2,viewHeight/(2*Math.tan(camera.fov*Math.PI/360)));camera.lookAt((left+right)/2,(lo+hi)/2,0);camera.far=camera.position.z+height*5;camera.updateProjectionMatrix();
}
function resize(){if(!renderer)return;const width=root.clientWidth,height=root.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;frameCamera();camera.updateProjectionMatrix();render();}
function render(){if(disposed||!renderer)return;for(const mesh of meshes)mesh.rotation.y=angle;renderer.render(scene,camera);}
function clear(){for(const mesh of meshes){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}meshes=[];}
function build(){
 if(!model||!renderer)return;
 try{
 clear();const current=config.current??{};if(!['height',...dimensions].every(k=>Number.isFinite(current[k])&&current[k]>0)){status('missing');tell('loaded');return;}
 const target=config.target&&Object.keys(config.target).length?{...current,...config.target,height:current.height}:null;
 const results=[fitBody(model,current,config.frame),...(target?[fitBody(model,target,config.frame)]:[])];
 const H=results[0].height;const span=Math.max(...results.map(r=>{let max=0;for(let i=0;i<r.positions.length;i+=3)max=Math.max(max,Math.abs(r.positions[i]));return max;}));
 const separation=span*2+.12;const totalWidth=target?separation+span*2:span*2;
 const aspect=root.clientWidth/root.clientHeight;const viewHeight=Math.max(H*1.22,totalWidth/aspect*1.1);
 camera.position.set(0,H*.52,viewHeight/(2*Math.tan(camera.fov*Math.PI/360)));camera.lookAt(0,H*.52,0);camera.near=.01;camera.far=20;camera.updateProjectionMatrix();
 results.forEach((result,index)=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(result.positions,3));geometry.setIndex(new THREE.BufferAttribute(model.indices,1));geometry.computeVertexNormals();
  // A single matte material keeps the measurement avatar a clean mannequin.
  const color=config.dark?(index===0?'#91a7ad':'#7faeb4'):(index===0?'#7b939b':'#58959e');
  const material=new THREE.MeshStandardMaterial({color,roughness:.88,metalness:0});
  const mesh=new THREE.Mesh(geometry,material);mesh.position.x=target?(index===0?1:-1)*(config.locale==='en'?-1:1)*separation/2:0;scene.add(mesh);meshes.push(mesh);
 });
 document.getElementById('current-label').textContent=text('current');document.getElementById('target-label').textContent=text('target');document.getElementById('labels').hidden=!target;
 for(const button of document.querySelectorAll('[data-angle]'))button.textContent=text(button.dataset.angle);
 document.getElementById('hint').textContent=text('approximate');document.body.classList.toggle('dark',!!config.dark);message.hidden=true;root.setAttribute('aria-label',text('approximate'));document.getElementById('controls').setAttribute('aria-label',config.locale==='en'?'Body view':'زاوية عرض الجسم');
 if(results.some(r=>!r.withinTolerance))status('fit');resize();tell('loaded',{achieved:results.map(r=>r.achieved)});
 }catch(error){status('unavailable');tell('error');}
}
window.swatSetBody=value=>{config=value;document.documentElement.lang=config.locale??'ar';document.documentElement.dir=config.locale==='en'?'ltr':'rtl';build();};
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='swat-body')return;window.swatSetBody(event.data.config);});
for(const button of document.querySelectorAll('[data-angle]'))button.addEventListener('click',()=>{angle={front:0,side:Math.PI/2,back:Math.PI}[button.dataset.angle];for(const other of document.querySelectorAll('[data-angle]'))other.setAttribute('aria-pressed',String(other===button));render();});
root.addEventListener('pointerdown',event=>{drag={x:event.clientX,angle};root.setPointerCapture(event.pointerId);});root.addEventListener('pointermove',event=>{if(drag){angle=drag.angle+(event.clientX-drag.x)*.012;render();}});root.addEventListener('pointerup',()=>drag=null);root.addEventListener('pointercancel',()=>drag=null);
new ResizeObserver(resize).observe(root);
window.addEventListener('pagehide',()=>{disposed=true;clear();renderer?.dispose();});
(async()=>{try{
 status('loading');const embedded=window.SWAT_MODEL;let metadata,buffer;
 if(embedded){metadata=embedded.metadata;const bytes=Uint8Array.from(atob(embedded.binary),c=>c.charCodeAt(0));buffer=bytes.buffer;}
 else{const responses=await Promise.all([fetch('mesh.json'),fetch('mesh.bin')]);if(responses.some(r=>!r.ok))throw Error();[metadata,buffer]=await Promise.all([responses[0].json(),responses[1].arrayBuffer()]);}
 model=decodeModel(metadata,buffer);renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;root.appendChild(renderer.domElement);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,1,.01,20);scene.add(new THREE.HemisphereLight('#f8f3ed','#6c797e',2));const key=new THREE.DirectionalLight('#fff0de',3.2);key.position.set(2,3,4);scene.add(key);const fill=new THREE.DirectionalLight('#d9f3fa',1.2);fill.position.set(-2,1,2);scene.add(fill);const rim=new THREE.DirectionalLight('#d8e7ed',2);rim.position.set(0,2,-3);scene.add(rim);
 resize();tell('ready');build();
 }catch(error){status('unavailable');tell('error');}})();
