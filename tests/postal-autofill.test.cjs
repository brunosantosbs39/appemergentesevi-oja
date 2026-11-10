const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const deps=require('node:module').createRequire(process.env.FRONTEND_TEST_DEPS || path.resolve(__dirname,'../frontend/package.json'));
const {JSDOM}=deps('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/onboarding'});
global.window=dom.window;global.document=dom.window.document;global.FormData=dom.window.FormData;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=deps('react'),{createRoot}=deps('react-dom/client');
let requests=[],root;
const api={get:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))};
const mocks={
'@/components/common/CategoryChips':{CategoryChips:()=>null},
'react-router-dom':{Navigate:()=>null,useNavigate:()=>()=>{}},
'@clerk/react':{useUser:()=>({user:{fullName:'Test',primaryEmailAddress:{emailAddress:'test@example.com'}}})},
'react-leaflet':{MapContainer:({children})=>React.createElement('div',null,children),TileLayer:()=>null,CircleMarker:()=>null,useMapEvents:()=>({getCenter:()=>({lat:-23,lng:-46})})},
'@/components/theme/ThemeToggle':{ThemeToggle:()=>null},
'@/components/auth/LogoutButton':{LogoutButton:()=>null},
'@/components/common/Misc':{Logo:()=>null},
'@/lib/api':{useApi:()=>api,errMsg:e=>e.message},
'@/context/MeContext':{useMe:()=>({me:{},setMe:()=>{}})},
'./AuthPages.css':{},'leaflet/dist/leaflet.css':{}
};
const code=deps('@babel/core').transformSync(fs.readFileSync(path.resolve(__dirname,'../frontend/src/pages/Onboarding.jsx'),'utf8'),{presets:[[deps.resolve('@babel/preset-react'),{runtime:'automatic'}]],plugins:[deps.resolve('@babel/plugin-transform-modules-commonjs')],configFile:false,babelrc:false}).code;
const output={exports:{}};new Function('require','module','exports',code)(n=>mocks[n]||deps(n),output,output.exports);
async function render(){root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(output.exports.default)));}
async function type(value){await React.act(async()=>{const input=document.querySelector('#registration-postal_code');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function settle(){await React.act(async()=>new Promise(r=>setTimeout(r,400)));}
const result=(cep,city='São Paulo')=>({data:{postal_code:cep,street:'Praça da Sé',district:'Sé',city,state:'SP',lat:-23.55,lng:-46.63}});
afterEach(async()=>{if(root)await React.act(async()=>root.unmount());requests=[];});
test('only a complete CEP triggers lookup and fills the address without a click',async()=>{
 await render();await type('01001');await settle();assert.equal(requests.length,0);
 await type('01001-000');await settle();assert.equal(requests.length,1);assert.equal(requests[0].url,'/me/address/01001000');
 await React.act(async()=>requests[0].resolve(result('01001000')));
 for(const [field,value] of Object.entries({street:'Praça da Sé',district:'Sé',city:'São Paulo',state:'SP'}))assert.equal(document.querySelector('#registration-'+field).value,value);
 await settle();assert.equal(requests.length,1);
});
test('late response for an old CEP cannot overwrite the new one',async()=>{
 await render();await type('01001000');await settle();await type('20040002');await settle();
 await React.act(async()=>requests[1].resolve(result('20040002','Rio de Janeiro')));
 await React.act(async()=>requests[0].resolve(result('01001000')));
 assert.equal(document.querySelector('#registration-city').value,'Rio de Janeiro');
});
test('lookup errors remain visible and the manual button can retry',async()=>{
 await render();await type('01001000');await settle();
 await React.act(async()=>requests[0].reject(new Error('Consulta indisponível')));
 assert.match(document.querySelector('[role=alert]').textContent,/indisponível/);
 await React.act(async()=>document.querySelector('.access-google').click());assert.equal(requests.length,2);
});
