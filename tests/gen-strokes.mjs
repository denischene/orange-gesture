// generates synthetic strokes from gestures.json sequences
import fs from "fs";
const G = JSON.parse(fs.readFileSync(process.argv[2]+"/data/gestures.json","utf8"));
const V={R:[1,0],UR:[.707,-.707],U:[0,-1],UL:[-.707,-.707],L:[-1,0],DL:[-.707,.707],D:[0,1],DR:[.707,.707]};
function toks(s){if(s.includes("-"))return s.split("-");const o=[];for(let i=0;i<s.length;){const t=s.substr(i,2);if(V[t]&&t.length==2){o.push(t);i+=2}else{o.push(s[i]);i++}}return o}
let seed=1;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
const cases=[];
for(const g of G.gestures){for(const s of [g.canonical,...(g.aliases||[])]){const t=toks(s);
 for(let v=0;v<12;v++){const len=[60,90,140][v%3];const jit=v<3?0:[2,5,9][v%3];const ang=v<3?0:(rnd()-.5)*0.5;
  let x=500,y=500;const pts=[[x,y]];
  for(const d of t){let [dx,dy]=V[d];const c=Math.cos(ang),sn=Math.sin(ang);[dx,dy]=[dx*c-dy*sn,dx*sn+dy*c];
   for(let k=0;k<len/6;k++){x+=dx*6+(rnd()-.5)*jit;y+=dy*6+(rnd()-.5)*jit;pts.push([Math.round(x),Math.round(y)])}}
  cases.push({gesture:g.id,source:s,points:pts})}}}
fs.writeFileSync(process.argv[3],JSON.stringify(cases));console.log(cases.length);
