import {readFileSync} from 'node:fs';import {test} from 'node:test';import assert from 'node:assert/strict';import {decodeModel,fitBody,dimensions} from './fitter.mjs';
const metadata=JSON.parse(readFileSync(new URL('../../../../public/body3d/mesh.json',import.meta.url)));const raw=readFileSync(new URL('../../../../public/body3d/mesh.bin',import.meta.url));const model=decodeModel(metadata,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const normal={height:175,weight:84,chest:104,waist:91,hips:106,arm:34,thigh:61,calf:39};
for(const frame of ['neutral','masculine','feminine'])test(`fitted ${frame} circumferences match supplied measurements`,()=>{const result=fitBody(model,normal,frame);for(const key of dimensions)assert.ok(Math.abs(result.achieved[key]-normal[key])<.7,`${key}: ${result.achieved[key]}`);});
test('fuller and target bodies preserve valid geometry and independently fit every dimension',()=>{for(const body of [{...normal,height:165,chest:130,waist:145,hips:138,arm:45,thigh:77,calf:48},{...normal,waist:82,arm:36,chest:106},{...normal,height:190,chest:98,waist:76,hips:100,arm:32,thigh:55,calf:36}]){const result=fitBody(model,body);assert.ok(result.positions.every(Number.isFinite));for(const key of dimensions)assert.ok(Math.abs(result.achieved[key]-body[key])<1,`${key}: ${result.achieved[key]} vs ${body[key]}`);}});
test('weight alone does not invent fat distribution, while height changes physical body height',()=>{assert.deepEqual(fitBody(model,normal).positions,fitBody(model,{...normal,weight:100}).positions);assert.equal(fitBody(model,{...normal,height:190}).height,1.9);assert.throws(()=>fitBody(model,{height:175,weight:85}));});

test('hip-to-thigh fitting preserves the shared body midline across fuller bodies and targets',()=>{
 const bodies=[{...normal,chest:124,waist:132,hips:130,arm:42,thigh:74,calf:44},{...normal,height:165,chest:130,waist:145,hips:138,arm:45,thigh:77,calf:48},{...normal,chest:108,waist:94,hips:110,arm:36,thigh:62,calf:39}];
 const midline=[];
 for(let i=0;i<model.positions.length;i+=3)if(Math.abs(model.positions[i])<1e-7&&model.positions[i+1]>.40&&model.positions[i+1]<.52)midline.push(i);
 assert.ok(midline.length>10,'fixture contains connected pelvic midline vertices');
 for(const frame of ['neutral','masculine','feminine'])for(const body of bodies){
  const result=fitBody(model,body,frame);
  for(const i of midline)assert.ok(Math.abs(result.positions[i])<1e-6,`midline displaced at vertex ${i/3}, ${frame}, waist ${body.waist}`);
  for(const key of dimensions)assert.ok(Math.abs(result.achieved[key]-body[key])<1,`${key} still fits after smoothing`);
 }
});

test('neighboring hip surface points stay connected when circumferences change',()=>{
 // Probe the known visible tear on both sides of the body, separated by only
 // 0.002% of body height. Existing measurement rings still use the real mesh.
 const probes=[.11,.46499,.055,.11,.46501,.055,-.11,.46499,.055,-.11,.46501,.055];
 const extended={...model};
 for(const key of ['positions','masculine','feminine','fatMasculine','fatFeminine']){
  extended[key]=new Float32Array(model[key].length+probes.length);
  extended[key].set(model[key]);
 }
 extended.positions.set(probes,model.positions.length);
 for(const frame of ['neutral','masculine','feminine'])for(const body of [{...normal,chest:124,waist:132,hips:130,arm:42,thigh:74,calf:44},{...normal,height:165,chest:130,waist:145,hips:138,arm:45,thigh:77,calf:48},{...normal,chest:108,waist:94,hips:110,arm:36,thigh:62,calf:39}]){
  const result=fitBody(extended,body,frame);
  for(const offset of [0,6]){
   const start=model.positions.length+offset;
   const distance=Math.hypot(...[0,1,2].map(k=>result.positions[start+k]-result.positions[start+3+k]));
   assert.ok(distance < .00002*body.height/100*8,`hip surface jumps ${distance*1000}mm, ${frame}, waist ${body.waist}`);
  }
 }
});
