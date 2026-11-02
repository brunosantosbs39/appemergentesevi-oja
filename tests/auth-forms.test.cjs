const {test, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const deps = createRequire(process.env.FRONTEND_TEST_DEPS || path.resolve(__dirname,'../frontend/package.json'));
const React = deps('react');
const {JSDOM} = deps('jsdom');
const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost/sign-in'});
global.window=dom.window; global.document=dom.window.document; global.FormData=dom.window.FormData;
global.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=deps('react-dom/client');
let auth={isLoaded:true,isSignedIn:false}, route='/sign-in', navigations=[], calls=[];
const signIn={status:'needs_identifier',password:async value=>{calls.push(['password',value]);return {error:null};}, sso:async value=>{calls.push(['sso',value]);return {error:null};},finalize:async ({navigate})=>{navigate({session:{}});return {error:null};}};
const signUp={...signIn,missingFields:[],unverifiedFields:['email_address'],verifications:{sendEmailCode:async()=>({error:null}),verifyEmailCode:async()=>{signUp.status='complete';return {error:null};}}};
const mocks={
 '@clerk/react':{useAuth:()=>auth,useSignIn:()=>({signIn}),useSignUp:()=>({signUp}),SignIn:()=>React.createElement('p',null,'challenge'),SignUp:()=>null,AuthenticateWithRedirectCallback:()=>null,RedirectToTasks:()=>null},
 'react-router-dom':{Link:({to,children,...rest})=>React.createElement('a',{href:to,...rest},children),Navigate:({to})=>{navigations.push(to);return null;},useNavigate:()=>to=>navigations.push(to),useLocation:()=>({pathname:route})},
 '@/components/common/Misc':{Logo:()=>React.createElement('span',null,'ServiçoJá')},
 '@/components/theme/ThemeToggle':{ThemeToggle:()=>null},
 'lucide-react':{Eye:()=>null,EyeOff:()=>null},'./AuthPages.css':{}
};
const code=deps('@babel/core').transformSync(fs.readFileSync(path.resolve(__dirname,'../frontend/src/pages/AuthPages.jsx'),'utf8'),{presets:[[deps.resolve('@babel/preset-react'),{runtime:'automatic'}]],plugins:[deps.resolve('@babel/plugin-transform-modules-commonjs')],configFile:false,babelrc:false}).code;
const output={exports:{}};
new Function('require','module','exports',code)(name=>mocks[name]||deps(name),output,output.exports);
let root;
async function render(name){root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(output.exports[name])));}
async function submit(){await React.act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
afterEach(async()=>{if(root)await React.act(async()=>root.unmount());root=null;calls=[];navigations=[];route='/sign-in';auth.isSignedIn=false;signIn.status='needs_identifier';});
test('login shows email and password together and Google option',async()=>{
 await render('SignInPage');assert.ok(document.querySelector('form input[type=email]'));assert.ok(document.querySelector('form input[type=password]'));
 assert.match(document.body.textContent,/Continuar com Google/);
});
test('successful password login goes through mandatory onboarding',async()=>{
 signIn.status='complete';await render('SignInPage');
 document.querySelector('#email').value='person@example.com';document.querySelector('#password').value='test-password';
 await submit();assert.equal(calls[0][0],'password');assert.deepEqual(navigations,['/onboarding']);
});
test('mismatched signup passwords never call Clerk',async()=>{
 route='/sign-up';await render('SignUpPage');document.querySelector('#password').value='different';document.querySelector('#confirmation').value='another';
 await submit();assert.equal(calls.length,0);assert.match(document.querySelector('[role=alert]').textContent,/iguais/);
});
test('Google also returns to onboarding',async()=>{
 await render('SignInPage');await React.act(async()=>document.querySelector('.access-google').click());
 assert.equal(calls[0][1].strategy,'oauth_google');assert.equal(calls[0][1].redirectUrl,'/onboarding');
 assert.equal(calls[0][1].redirectCallbackUrl,'/sso-callback');
});
test('incomplete password authentication is never finalized',async()=>{
 signIn.status='needs_second_factor';await render('SignInPage');await submit();
 assert.equal(navigations.length,0);assert.match(document.body.textContent,/challenge/);
});
test('signed-in visitor is sent to registration gate',async()=>{
 auth.isSignedIn=true;await render('SignInPage');assert.deepEqual(navigations,['/onboarding']);
});

test('recovery opens a dedicated email form instead of the old login',async()=>{
 route='/sign-in/recover';await render('SignInPage');
 assert.match(document.body.textContent,/Recuperar senha/);
 assert.ok(document.querySelector('#recovery-email'));
 assert.equal(document.querySelector('input[type=password]'),null);
});
test('recovery requires verified code before password submission',async()=>{
 route='/sign-in/recover';
 signIn.create=async()=>({error:null});
 signIn.resetPasswordEmailCode={sendCode:async()=>({error:null}),verifyCode:async()=>({error:{message:'Código inválido'}})};
 await render('SignInPage');document.querySelector('#recovery-email').value='test@example.com';await submit();
 assert.ok(document.querySelector('#recovery-code'));await submit();
 assert.equal(document.querySelector('input[type=password]'),null);assert.equal(navigations.length,0);
});
