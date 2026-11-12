// 在 GPU 上程序化生成可无缝平铺的 PBR 贴图。每一套贴图由一个高度函数 H(uv) 和一个遮罩函数 M(uv) 定义：
//   N 贴图 = 由高度求出的法线（rgb）+ 高度（a）
//   M 贴图 = 四个遮罩：r 细节（划痕 / 每块石头的明暗），g 大块脏污，b 细粒（粗糙度变化），a 凹处（砖缝、凹坑、裂纹 → 积灰、变暗）
import * as THREE from 'three';

const COMMON = `precision highp float; varying vec2 vUv; uniform float uMode; uniform float uStr; uniform float uPx;
float h1(vec2 p,float per){ p=mod(p,per); return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec2 h2(vec2 p,float per){ p=mod(p,per); return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
float vn(vec2 p,float per){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h1(i,per),h1(i+vec2(1,0),per),f.x),mix(h1(i+vec2(0,1),per),h1(i+vec2(1,1),per),f.x),f.y); }
float fbm(vec2 p,float per){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*vn(p,per); p*=2.; per*=2.; a*=.5; } return s; }
float ridge(vec2 p,float per){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*(1.-abs(vn(p,per)*2.-1.)); p*=2.; per*=2.; a*=.5; } return s; }
// Voronoi：x = 到最近点的距离，y = 到最近边的距离，z = 该格的随机数
vec3 voro(vec2 p,float per){ vec2 n=floor(p),f=fract(p); vec2 mg,mr; float md=8.; float id=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=h2(n+g,per); vec2 r=g+o-f; float d=dot(r,r); if(d<md){ md=d; mr=r; mg=g; id=h1(n+g+7.3,per);} }
  float me=8.; for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){ vec2 g=mg+vec2(float(i),float(j)); vec2 o=h2(n+g,per); vec2 r=g+o-f; if(dot(mr-r,mr-r)>1e-5) me=min(me,dot(.5*(mr+r),normalize(r-mr))); }
  return vec3(sqrt(md),me,id); }
// 断断续续的细裂纹
float cracks(vec2 uv,float f,float w){ vec3 v=voro(uv*f+fbm(uv*f*2.,f*2.)*.35,f); return smoothstep(w,0.,v.y)*smoothstep(.42,.62,fbm(uv*f*.7+3.1,f*.7*2.)); }
`;
const MAIN = `
void main(){
  if(uMode<.5){ float e=uPx; float hx=H(vUv+vec2(e,0.))-H(vUv-vec2(e,0.)), hy=H(vUv+vec2(0.,e))-H(vUv-vec2(0.,e));
    vec3 n=normalize(vec3(-hx*uStr,-hy*uStr,1.)); gl_FragColor=vec4(n*.5+.5,H(vUv)); }
  else gl_FragColor=M(vUv);
}`;

export const SETS = {
  // 金属：锤痕起伏 + 细密划痕 + 小凹坑
  metal: { str: 2.2, src: `
    float scratch(vec2 uv){ float s=0.; for(int i=0;i<3;i++){ float a=float(i)*1.1+.4; vec2 d=vec2(cos(a),sin(a)); vec2 q=vec2(dot(uv,d),dot(uv,vec2(-d.y,d.x)));
        float n=vn(vec2(q.x*3.,q.y*96.),768.); s=max(s,smoothstep(.86,.97,n)*vn(q*6.+float(i)*3.,96.)); } return s; }
    float pit(vec2 uv){ return smoothstep(.74,.9,vn(uv*90.,90.))*smoothstep(.4,.7,fbm(uv*5.+1.9,5.)); }
    float H(vec2 uv){ float dent=fbm(uv*6.,6.)*.5+vn(uv*18.,18.)*.12; return dent*.6-scratch(uv)*.35-pit(uv)*.3+fbm(uv*64.,64.)*.05; }
    vec4 M(vec2 uv){ return vec4(scratch(uv), fbm(uv*4.+3.7,4.), fbm(uv*24.+1.3,24.), pit(uv)); }` },
  // 砌石墙：错缝的大石块，带倒角、风化面和少量裂纹
  stone: { str: 5.5, src: `
    vec4 brick(vec2 uv){ vec2 g=vec2(4.,8.); vec2 p=uv*g; float row=floor(p.y); p.x+=mod(row,2.)*.5+h1(vec2(row,3.),8.)*.18; vec2 c=floor(p), f=fract(p);
      float sp=step(.72,h1(c+3.7,8.)); float fx=mix(f.x, fract(f.x*2.), sp); float sid=floor(f.x*2.)*sp; vec2 d=min(vec2(fx,f.y),1.-vec2(fx,f.y))*vec2(mix(2.,1.,sp),1.); float edge=min(d.x,d.y)+(fbm(uv*14.,14.)-.5)*.07; return vec4(edge, h1(c+11.+sid*5.,8.), c); }
    float H(vec2 uv){ vec4 b=brick(uv); float joint=smoothstep(.0,.045,b.x+(fbm(uv*40.,40.)-.5)*.04); float bevel=smoothstep(.0,.3,b.x);
      float surf=fbm(uv*12.+b.y*9.,12.)*.35+ridge(uv*28.,28.)*.12+fbm(uv*96.,96.)*.06;
      return joint*(.55+bevel*.25+b.y*.18)+surf*joint-cracks(uv,5.,.016)*.14; }
    vec4 M(vec2 uv){ vec4 b=brick(uv); float j=(1.-smoothstep(.0,.045,b.x+(fbm(uv*40.,40.)-.5)*.04))*.6; return vec4(b.y, fbm(uv*3.+5.1,3.)*.6+fbm(uv*11.,11.)*.4, fbm(uv*64.,64.), max(j,cracks(uv,5.,.016)*.6)); }` },
  // 石板地：不规则的大石板
  flag: { str: 5.0, src: `
    float H(vec2 uv){ vec3 v=voro(uv*5.,5.); float joint=smoothstep(.0,.06,v.y+(fbm(uv*30.,30.)-.5)*.04); float bevel=smoothstep(0.,.25,v.y);
      return joint*(.6+bevel*.2+v.z*.15)+(fbm(uv*10.+v.z*7.,10.)*.3+ridge(uv*24.,24.)*.1+fbm(uv*96.,96.)*.05)*joint-cracks(uv,7.,.025)*.22; }
    vec4 M(vec2 uv){ vec3 v=voro(uv*5.,5.); float j=1.-smoothstep(.0,.06,v.y+(fbm(uv*30.,30.)-.5)*.04); return vec4(v.z, fbm(uv*3.+2.2,3.), fbm(uv*64.,64.), max(j,cracks(uv,7.,.025))); }` },
  // 粗石（柱子、雕像、岩石）：没有砖缝的风化石面
  rock: { str: 4.0, src: `
    float H(vec2 uv){ return fbm(uv*5.,5.)*.5+ridge(uv*11.,11.)*.3+fbm(uv*40.,40.)*.14+fbm(uv*128.,128.)*.05-cracks(uv,4.,.014)*.12; }
    vec4 M(vec2 uv){ return vec4(fbm(uv*7.+1.,7.), fbm(uv*3.+4.,3.), fbm(uv*64.,64.), cracks(uv,4.,.014)*.6); }` },
  // 织物（披风、旗帜）：经纬交织
  cloth: { str: 2.5, src: `
    float H(vec2 uv){ vec2 p=uv*140.; float w=sin(p.x*6.2832)*sin(p.y*6.2832+3.14159*floor(p.x)); return w*.35+fbm(uv*12.,12.)*.4+fbm(uv*60.,60.)*.12; }
    vec4 M(vec2 uv){ return vec4(fbm(uv*9.,9.), fbm(uv*3.+1.7,3.), fbm(uv*40.,40.), smoothstep(.6,.3,fbm(uv*6.+2.,6.))*.4); }` },
  // 锁子甲：一排排互相咬合的小环
  mail: { str: 6.0, src: `
    float ringsRow(vec2 p){ vec2 f=fract(p)-.5; float r=length(f*vec2(1.,1.25)); return smoothstep(.16,.05,abs(r-.3)); }
    float H(vec2 uv){ vec2 p=uv*vec2(44.,30.); return max(ringsRow(p), ringsRow(p+vec2(.5,.5))*.85); }
    vec4 M(vec2 uv){ vec2 p=uv*vec2(44.,30.); float r=max(ringsRow(p), ringsRow(p+vec2(.5,.5))); return vec4(r, fbm(uv*4.,4.), fbm(uv*20.,20.), 1.-r); }` },
  // 皮革：细密的龟裂纹
  leather: { str: 3.0, src: `
    float H(vec2 uv){ vec3 v=voro(uv*46.,46.); return smoothstep(0.,.12,v.y)*.5+fbm(uv*10.,10.)*.3+v.z*.1; }
    vec4 M(vec2 uv){ vec3 v=voro(uv*46.,46.); return vec4(v.z, fbm(uv*4.,4.), fbm(uv*30.,30.), 1.-smoothstep(0.,.12,v.y)); }` },
};

export function makeTextures(renderer, size = 1024) {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); scene.add(quad); quad.frustumCulled = false;
  const out = {}, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const [name, set] of Object.entries(SETS)) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uMode: { value: 0 }, uStr: { value: set.str }, uPx: { value: 1 / size } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }', fragmentShader: COMMON + set.src + MAIN });
    quad.material = mat; out[name] = {};
    for (const [key, mode] of [['N', 0], ['M', 1]]) {
      const rt = new THREE.WebGLRenderTarget(size, size, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      mat.uniforms.uMode.value = mode; renderer.setRenderTarget(rt); renderer.render(scene, cam); rt.texture.anisotropy = aniso; out[name][key] = rt.texture;
    }
    mat.dispose();
  }
  renderer.setRenderTarget(null);
  return out;
}
