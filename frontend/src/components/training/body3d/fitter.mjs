export const dimensions=['chest','waist','hips','arm','thigh','calf'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function profile(y,knots){for(let i=1;i<knots.length;i++)if(y<=knots[i][0]){const t=smooth((y-knots[i-1][0])/(knots[i][0]-knots[i-1][0]));return knots[i-1][1]*(1-t)+knots[i][1]*t;}return knots.at(-1)[1];}
export function decodeModel(metadata,buffer){const a={};for(const[name,def]of Object.entries(metadata.arrays))a[name]=def.type==='uint16'?new Uint16Array(buffer,def.offset,def.count):new Float32Array(buffer,def.offset,def.count);return{...a,metadata};}
function point(positions,sample){const [a,b,t]=sample;return [0,1,2].map(d=>positions[a*3+d]*(1-t)+positions[b*3+d]*t);}
export function measure(positions,segments){let total=0;for(const[a,b]of segments){const p=point(positions,a),q=point(positions,b);total+=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);}return total*100;}
export function fitBody(model,values,frame='neutral'){
 if(!['height',...dimensions].every(k=>typeof values[k]==='number'&&Number.isFinite(values[k])&&values[k]>0))throw Error('Complete height and circumferences first');
 const femininity=frame==='feminine'?1:frame==='masculine'?0:.5;
 // This is a graphical fullness control derived from the entered waist, NOT a
 // body-fat estimate. The perimeter fit below remains the measurement authority.
 const fullness=clamp((values.waist/values.height-.40)/.36,0,1);
 const base=new Float32Array(model.positions.length);
 for(let i=0;i<base.length;i++)base[i]=model.positions[i]+model.masculine[i]*(1-femininity)+model.feminine[i]*femininity+(model.fatMasculine[i]*(1-femininity)+model.fatFeminine[i]*femininity)*fullness;
 let lo=Infinity,hi=-Infinity;for(let i=1;i<base.length;i+=3){lo=Math.min(lo,base[i]);hi=Math.max(hi,base[i]);}
 const physicalScale=values.height/100/(hi-lo);
 const coefficients=Object.fromEntries(dimensions.map(k=>[k,1]));
 const deform=()=>{
  const result=new Float32Array(base.length);
  for(let i=0;i<base.length;i+=3){
   const bx=model.positions[i],by=model.positions[i+1];let x=base[i],y=base[i+1],z=base[i+2];const sign=bx>=0?1:-1;
   const armBoundary=by>.75?.10+(by-.75)*1.2:.115;
   if(by<.51){
    const centerX=sign*profile(by,[[0,.12],[.2,.11],[.4,.076],[.465,.055]]);
    const centerZ=profile(by,[[0,0],[.2,-.003],[.4,.018],[.465,.012]]);
    const factor=profile(by,[[0,1],[.055,1],[.2,coefficients.calf],[.29,1+(coefficients.thigh+coefficients.calf-2)*.22],[.4,coefficients.thigh],[.465,1]]);
    x=centerX+(x-centerX)*factor+sign*(coefficients.hips-1)*.055*smooth((by-.29)/.175);
    z=centerZ+(z-centerZ)*factor;
    // The hip and each leg are one connected surface. Blend their deformation
    // fields across the upper thigh, instead of switching at a horizontal cut.
    // Keep the measured thigh (.40) and hip (.51) rings as the fit anchors.
    // Fade the separate leg axes into the midline. A hard left/right sign
    // otherwise pushes shared crotch vertices to one side and tears the profile.
    const legInfluence=smooth(Math.abs(bx)/.025);
    x=base[i]+(x-base[i])*legInfluence;
    z=base[i+2]+(z-base[i+2])*legInfluence;
    const hipBlend=smooth((by-.415)/.095);
    const hipCenterZ=profile(by,[[.415,.012],[.465,.012],[.51,.01]]);
    const hipX=base[i]*coefficients.hips;
    const hipZ=hipCenterZ+(base[i+2]-hipCenterZ)*coefficients.hips;
    x=x*(1-hipBlend)+hipX*hipBlend;
    z=z*(1-hipBlend)+hipZ*hipBlend;
   }else if(by>.465&&by<.83&&Math.abs(bx)>armBoundary){
    const w=smooth((by-.62)/.06)*(1-smooth((by-.74)/.07));
    const factor=1+(coefficients.arm-1)*w;
    const cx=sign*profile(by,[[.53,.30],[.63,.257],[.69,.194],[.75,.139],[.83,.09]]);
    const cz=profile(by,[[.53,.16],[.63,.118],[.69,.03],[.75,.01],[.83,0]]);
    // Scale radially around the local arm axis, preserving bone direction.
    const ax=sign*-.66,ay=.69,az=-.30;const dx=x-cx,dy=0,dz=z-cz;const axial=dx*ax+dy*ay+dz*az;
    x+=((dx-axial*ax)*(factor-1));y+=(-axial*ay)*(factor-1);z+=((dz-axial*az)*(factor-1));
    x+=sign*.08*Math.max(0,coefficients.chest-1,coefficients.waist-1)*smooth((.84-by)/.1);
   }else if(by<.85){
    const factor=profile(by,[[.465,coefficients.hips],[.51,coefficients.hips],[.64,coefficients.waist],[.73,coefficients.chest],[.815,1],[.85,1]]);
    const centerZ=profile(by,[[.465,.012],[.51,.01],[.64,.036],[.73,.027],[.85,.01]]);
    x*=factor;z=centerZ+(z-centerZ)*factor;
   }
   result[i]=x*physicalScale;result[i+1]=(y-lo)*physicalScale;result[i+2]=z*physicalScale;
  }
  return result;
 };
 let positions=deform();
 for(let pass=0;pass<12;pass++){
  for(const key of dimensions){const actual=measure(positions,model.metadata.rings[key]);coefficients[key]=clamp(coefficients[key]*values[key]/actual,.28,4.5);positions=deform();}
  if(dimensions.every(k=>Math.abs(measure(positions,model.metadata.rings[k])-values[k])<.25))break;
 }
 const achieved=Object.fromEntries(dimensions.map(k=>[k,measure(positions,model.metadata.rings[k])]));
 return{positions,achieved,coefficients,height:values.height/100,withinTolerance:dimensions.every(k=>Math.abs(achieved[k]-values[k])<Math.max(.5,values[k]*.01))};
}
