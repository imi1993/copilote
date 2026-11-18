const $=s=>document.querySelector(s);const NM='non mentionné';let fs=22,transcript=[],sel=null;
const setFs=v=>{fs=Math.max(16,Math.min(48,v));document.documentElement.style.setProperty('--fs',fs+'px');chrome.storage.local.set({fs})};
chrome.storage.local.get(['fs'],r=>setFs(r.fs||22));chrome.storage.local.get(['theme'],r=>{document.documentElement.dataset.theme=r.theme||'glass'});$('#theme').onclick=()=>{const d=document.documentElement;const T=['light','glass','dark'];d.dataset.theme=T[(T.indexOf(d.dataset.theme)+1)%3];chrome.storage.local.set({theme:d.dataset.theme})};$('#fm').onclick=()=>setFs(fs-3);$('#fp').onclick=()=>setFs(fs+3);
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));for(const s of ['live','notes','lib','set'])$('#'+s).classList.toggle('hide',s!==b.dataset.t);if(b.dataset.t==='lib')renderList()});
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');

// ---- À dire + profil ----
const say=[];let si=-1;const bold=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
function showSay(){const x=say[si];if(!x)return;$('#say').classList.remove('hide');$('#sayEn').innerHTML=bold(x.en);$('#sayFr').textContent=x.fr;$('#sayN').textContent=(si+1)+' / '+say.length}
function pushSay(en,fr){say.push({en,fr});si=say.length-1;if(!$('#say').classList.contains('hide')||SAYAUTO)showSay()}
let SAYAUTO=false;
$('#sayP').onclick=()=>{if(si>0){si--;showSay()}};$('#sayN2').onclick=()=>{if(si<say.length-1){si++;showSay()}};$('#sayX').onclick=()=>{$('#say').classList.add('hide');SAYAUTO=false};
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if(e.key==='ArrowRight')$('#sayN2').click();if(e.key==='ArrowLeft')$('#sayP').click()});
const PF=['pf1','pf2','pf3','pf4'],PFL=['Parcours','Harmoniq AI','Offre','Ce que je cherche'];
function profileText(p){const l=PF.map((k,i)=>p[k]&&p[k].trim()?PFL[i]+' : '+p[k].trim():'').filter(Boolean);return l.length?l.join('\n'):'(profil vide)'}
function coachPrompt(t,prof){return `Tu es un coach de réunion pour une utilisatrice francophone qui comprend mal l'anglais. Phrase entendue (anglais) : "${t}".
PROFIL DE L'UTILISATRICE (seule source autorisée pour parler d'elle) :
${prof}
Réponds en 3 parties séparées par "||" :
1) explication simple en français, une phrase ;
2) si une réponse de l'utilisatrice est attendue : UNE seule phrase courte (10 mots max) en anglais très facile à lire à voix haute, avec 2 ou 3 mots clés entourés de ** ; sinon "-" ;
3) le sens de cette phrase en français, une ligne ; sinon "-".
Si on pose une question sur l'utilisatrice, utilise UNIQUEMENT le profil. Si l'information manque dans le profil, n'invente rien : partie 2 = "I **prefer** to **confirm** this and come back to you." et partie 3 = "Je préfère confirmer et revenir vers vous."`}

// ---- anti-répétition : une phrase par ligne, rien de déjà affiché ----
const normS=s=>s.toLowerCase().replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();let seenS=[];
const EN_W=new Set("the and to of is you i that it in we for on a be have with this are was not but they at what so can will do if my your me he she there just about all one would an from or as by how when which their out up know like get go been has had were them its our more no yes okay thank thanks please hello hi well now here want need see think going said".split(' '));
const FR_W=new Set("le la les des est que pour une un du de et pas dans qui sur avec ce cette sont nous vous je il elle ils au aux mais ou donc ne plus par comme bien oui bonjour merci très faire fait être avoir c'est j'ai".split(' '));
function isEnglish(t){const w=t.toLowerCase().replace(/[.,!?;:"]/g,' ').split(/\s+/).filter(Boolean);if(w.length<4)return !/[éèêàçùâîôû]/i.test(t);let en=0,fr=0;for(const x of w){if(EN_W.has(x))en++;if(FR_W.has(x))fr++}
 if(/[éèêàçùâîôû]/i.test(t)&&fr>=en)return false;return en/w.length>=0.18&&en>fr}
function freshParts(t){if(!isEnglish(t))return [];let x=t.replace(/\s+/g,' ').trim(),p;do{p=x;x=x.replace(/(\b[^.!?]{10,}?[.!?]?)\s+\1/gi,'$1')}while(x!==p);
 for(const y of [...seenS].sort((a,b)=>b.length-a.length)){const r=new RegExp(y.split(' ').map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join("[^a-z0-9']+"),'i');x=x.replace(r,' ')}x=x.replace(/\s+/g,' ').trim();
 const out=[];for(let s of (x.match(/[^.!?]+[.!?]*/g)||[x])){s=s.trim();const n=normS(s);if(n.length<4)continue;
  if(seenS.some(y=>y===n||y.includes(n)))continue;seenS.push(n);if(seenS.length>60)seenS.shift();out.push(s)}return out}
let noteFr=false;

let MODE='meeting';const MODEL_L=()=>MODE==='video'?'Mode : Vidéo / formation':'Mode : Réunion';
const MEET_INTRO="${intro()}";
const VID_INTRO="Tu es un assistant pédagogique. À partir de la transcription (anglais) d'une vidéo ou formation et des notes, rédige en français un résumé de formation. Utilise le même JSON : participants = intervenants cités ; ordre_du_jour = plan de la formation ; sujets = notions clés expliquées simplement ; decisions = liste vide ; conclusions = à retenir ; actions = à réviser ou à faire ; a_confirmer = points à vérifier ; resume = résumé en 5 lignes.";
const intro=()=>MODE==='video'?VID_INTRO:MEET_INTRO;
const VID_COACH=(t)=>`Tu es un assistant qui explique en direct une vidéo ou une formation en anglais à une francophone qui comprend mal l'anglais. Phrase entendue (anglais) : "${t}". Réponds par UNE explication en français, simple et fidèle, en 1 ou 2 phrases ; explique brièvement les termes techniques. N'invente rien.`;
let modeManual=false;chrome.storage.local.get(['mode'],r=>{if(r.mode){MODE=r.mode;modeManual=true}document.body.dataset.mode=MODE;$('#modeT').textContent=MODEL_L()});
$('#modeT').onclick=()=>{MODE=MODE==='video'?'meeting':'video';modeManual=true;chrome.storage.local.set({mode:MODE});document.body.dataset.mode=MODE;$('#modeT').textContent=MODEL_L()};
let isPaused=false;$('#pause').onclick=()=>chrome.runtime.sendMessage({to:'offscreen',type:isPaused?'resume':'pause'}).catch(()=>{});
// états
const STATES={starting:['Démarrage…',''],loading:['Préparation du moteur de transcription…',''],listening:['En écoute','on'],stopped:['Écoute arrêtée',''],paused:['EN PAUSE : cliquez sur « Reprendre l\'écoute »','warnp'],error:['Problème','err']};
function setState(m){lastM=m;isPaused=m.state==='paused';$('#pause').classList.toggle('paused',isPaused);$('#pause').textContent=isPaused?'▶ Reprendre l\'écoute':'⏸ Mettre en pause';if(m.state==='starting'&&!modeManual&&m.platform){MODE=m.platform==='Onglet'?'video':'meeting';document.body.dataset.mode=MODE;$('#modeT').textContent=MODEL_L()}curState=m.state;if(m.state==='loading'&&!loadingSince)loadingSince=Date.now();if(m.state!=='loading')loadingSince=0;const [t,c]=STATES[m.state]||['',''];let txt=t;if(m.platform)txt+=' ('+m.platform+')';if(m.detail)txt+=' : '+m.detail;if(m.error)txt+=' : '+m.error+'. Recliquez sur l\'icône du copilote pour réessayer.';$('#st').textContent=txt;$('#dot').className='dot '+c}
// état persistant + niveau sonore + messages explicites
let lastM=null,curState='',busyNow=false,quietMs=0,loadingSince=0;
function paint(){const st=document.querySelector('.state');let warn='';
 if(curState==='listening'&&quietMs>15000)warn="Aucun son détecté dans cet onglet depuis 15 secondes. Le copilote entend le son de l'ONGLET (les autres participants, une vidéo), pas votre micro. Si vous êtes seule dans la réunion, lancez une vidéo anglaise dans un onglet et cliquez sur l'icône du copilote DANS cet onglet.";
 else if(curState==='loading'&&loadingSince&&Date.now()-loadingSince>180000)warn='Le moteur met plus de 3 minutes à se charger. Vérifiez la connexion, puis fermez et recliquez sur l\'icône.';
 else if(curState==='listening'&&busyNow)warn='Transcription en cours…';
 if(warn){$('#st').textContent=warn}else if(lastM){setState(lastM)}st.classList.toggle('warn',!!warn&&curState==='listening'&&quietMs>15000);st.classList.toggle('err2',curState==='error')}
setInterval(paint,2000);
chrome.storage.session.get('st').then(({st})=>{if(st&&st.state){setState(st);curState=st.state;if(st.state==='loading'&&!loadingSince)loadingSince=st.at}});
// IA (Gemini, clé facultative)

const GAPI='https://generativelanguage.googleapis.com/v1beta/';let AI_ERR='';
const cleanKey=v=>String(v||'').replace(/[\s"'`]+/g,'');
async function pickModel(key){try{const r=await fetch(GAPI+'models?pageSize=200&key='+encodeURIComponent(key));const j=await r.json();if(!r.ok){AI_ERR=r.status+' '+(j.error&&j.error.message||'');return null}
 const c=(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name.replace('models/','')).map(n=>{const x=n.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/);return x?{n,v:parseFloat(x[1]),l:!!x[2]}:null}).filter(Boolean).sort((a,b)=>b.v-a.v||a.l-b.l);
 return c.length?c[0].n:((j.models||[]).some(m=>m.name==='models/gemini-flash-latest')?'gemini-flash-latest':null)}catch(e){AI_ERR='réseau : '+e.message;return null}}
async function gemini(prompt,key,model,cache,saveModel){AI_ERR='';if(!key)return null;
 for(let t=0;t<2;t++){let m=model||cache;if(!m){m=await pickModel(key);if(!m){AI_ERR=AI_ERR||'aucun modèle Gemini disponible pour cette clé';return null}saveModel(m);cache=m}
  try{const r=await fetch(GAPI+'models/'+m+':generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});const j=await r.json();
   if(r.ok){const x=j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts&&j.candidates[0].content.parts[0]&&j.candidates[0].content.parts[0].text;if(x)return x;AI_ERR='réponse vide (contenu bloqué ?)';return null}
   AI_ERR=r.status+' '+(j.error&&j.error.message||'');if((r.status===404||r.status===400)&&!model&&t===0){cache='';saveModel('');continue}return null}catch(e){AI_ERR='réseau : '+e.message;return null}}return null}
async function ai(prompt){const {key,model,gmodel}=await chrome.storage.local.get(['key','model','gmodel']);const r=await gemini(prompt,cleanKey(key),(model||'').trim(),gmodel||'',m=>chrome.storage.local.set({gmodel:m}));if(!r&&key&&AI_ERR)errAi();return r}
let errShown='';function errAi(){if(errShown===AI_ERR)return;errShown=AI_ERR;$('#fr').insertAdjacentHTML('beforeend','<p class="line mut">Google a refusé la demande IA : '+esc(AI_ERR)+'</p>')}
async function onText(raw){const parts=freshParts(raw);if(!parts.length)return;const t=parts.join(' ');transcript.push({t,at:Date.now()});if($('#en').classList.contains('mut'))$('#en').innerHTML='',$('#en').classList.remove('mut');
 for(const p of parts)$('#en').insertAdjacentHTML('beforeend',`<p class="line en">${esc(p)}</p>`);
 {const {key}=await chrome.storage.local.get('key');if(!key&&!noteFr){noteFr=true;$('#fr').innerHTML='<p class="line mut">Explication en français : ajoutez une clé IA gratuite dans Réglages pour l\'activer. Le texte anglais s\'affiche déjà.</p>'}}
 const {profiles={},pfActive='pro'}=await chrome.storage.local.get(['profiles','pfActive']);const a=await ai(MODE==='video'?VID_COACH(t):coachPrompt(t,profileText(profiles[pfActive]||{})));
 if(!a)return;const [x,y,z]=a.split('||').map(q=>q.trim());$('#fr').insertAdjacentHTML('beforeend',`<p class="line fr">${esc(x)}</p>`);if(y&&y!=='-'){$('#rep').innerHTML=`<div class="reply">${bold(y)}<small>${esc(z&&z!=='-'?z:'')}</small></div>`;pushSay(y,z&&z!=='-'?z:'')}}
chrome.runtime.onMessage.addListener(m=>{if(m.to!=='panel')return;if(m.type==='level'){$('#lvlB').style.width=Math.min(100,Math.round(m.v*900))+'%';quietMs=m.quiet||0;paint();return}if(m.type==='busy'){busyNow=m.on;paint();return}if(m.type==='state')setState(m);if(m.type==='text')onText(m.text)});
$('#sum').onclick=async()=>{const since=Date.now()-5*60000;const txt=transcript.filter(x=>x.at>=since).map(x=>x.t).join(' ');if(!txt){$('#fr').insertAdjacentHTML('beforeend','<p class="line mut">Rien à résumer pour l\'instant.</p>');return}
 const r=await ai(`Résume en français, en 4 puces courtes maximum, sans rien inventer : ${txt}`);$('#fr').insertAdjacentHTML('beforeend',`<div class="card"><h2>Résumé (5 dernières minutes)</h2>${r?esc(r).replace(/\n/g,'<br>'):'<span class="mut">Clé IA nécessaire (Réglages).</span>'}</div>`)};
// compte rendu
const ul=l=>l&&l.length?'<ul>'+l.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':`<p class="nm">${NM}</p>`;
function renderCR(m){const c=m.cr;const d=new Date(m.date);return `<article class="cr"><h1>${m.mode==='video'?'Résumé de la vidéo / formation':'Compte rendu de réunion'}</h1><div class="meta"><div><b>Réunion</b><br>${esc(m.title)}</div><div><b>Date</b><br>${d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} ${d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div></div>
<h2>Participants</h2>${ul(c.participants)}<h2>Ordre du jour</h2>${ul(c.ordre_du_jour)}<h2>Résumé exécutif</h2><p>${esc(c.resume||NM)}</p>
<h2>Sujets abordés</h2>${(c.sujets&&c.sujets.length)?c.sujets.map(x=>`<h3>${esc(x.titre)}</h3>${ul(x.points)}`).join(''):`<p class="nm">${NM}</p>`}
<h2>Décisions</h2>${ul(c.decisions)}<h2>Conclusions</h2>${ul(c.conclusions)}
<h2>Plan d'actions</h2>${(c.actions&&c.actions.length)?`<table><tr><th>Action</th><th>Responsable</th><th>Délai</th></tr>${c.actions.map(x=>`<tr><td>${esc(x.action)}</td><td>${esc(x.responsable||NM)}</td><td>${esc(x.delai||NM)}</td></tr>`).join('')}</table>`:`<p class="nm">${NM}</p>`}
<h2>Points à confirmer</h2>${ul(c.a_confirmer)}<p class="foot">Généré à partir de la transcription et des notes ; à relire avant diffusion.</p></article>`}
$('#end').onclick=async()=>{chrome.runtime.sendMessage({to:'bg',type:'stop'});const text=transcript.map(x=>x.t).join(' ');const title=$('#title').value||'Réunion sans titre';const notes=$('#nt').value;
 const raw=await ai(`Tu es secrétaire de séance expert. À partir de la transcription (anglais) et des notes ci-dessous, rédige en français un compte rendu professionnel. Réponds UNIQUEMENT par un JSON valide : {"participants":[""],"ordre_du_jour":[""],"sujets":[{"titre":"","points":[""]}],"decisions":[""],"conclusions":[""],"actions":[{"action":"","responsable":"","delai":""}],"a_confirmer":[""],"resume":""}. Phrases courtes, aucune invention ; si une information n'est pas dite, écris "non mentionné" ou laisse la liste vide.\n\nNotes : ${notes}\n\nTranscription : ${text}`);
 let cr=null;try{cr=JSON.parse((raw||'').replace(/^```json|```$/g,'').trim())}catch(e){}
 if(!cr)cr={resume:text?NM+' (compte rendu automatique indisponible : ajoutez une clé IA dans Réglages)':NM,participants:[],ordre_du_jour:[],sujets:[{titre:'Notes de séance',points:notes?notes.split('\n').filter(Boolean):[NM]}],decisions:[],conclusions:[],actions:[],a_confirmer:[]};
 const {meetings=[]}=await chrome.storage.local.get('meetings');const m={id:Date.now(),title,date:new Date().toISOString(),text,notes,cr,mode:MODE};meetings.unshift(m);await chrome.storage.local.set({meetings});sel=m.id;transcript=[];
 seenS=[];noteFr=false;$('#en').className='mut';$('#en').textContent="En attente de l'audio…";$('#fr').innerHTML='';$('#rep').innerHTML='';document.querySelector('[data-t=lib]').click()};
async function renderList(){const {meetings=[]}=await chrome.storage.local.get('meetings');const q=$('#q').value.toLowerCase();const a=meetings.filter(m=>(m.title+JSON.stringify(m.cr)+m.text).toLowerCase().includes(q));
 $('#list').innerHTML=a.map(m=>`<div class="item" data-id="${m.id}"><b>${esc(m.title)}</b><br><span class="mut">${new Date(m.date).toLocaleString('fr-FR')}</span></div>`).join('')||'<p class="mut">Aucun compte rendu.</p>';
 const show=id=>{const m=meetings.find(x=>x.id==id);if(!m)return;$('#detail').innerHTML=renderCR(m)+'<div class="noprint" style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="p" id="pdf">PDF / Imprimer</button><button id="doc">Word (.doc)</button><button id="del">Supprimer</button></div>';
  $('#pdf').onclick=()=>print();$('#doc').onclick=()=>{const css='body{font-family:Calibri,Arial}h2{color:#1f2a44;border-bottom:1px solid #999}td,th{border:1px solid #999;padding:4px 8px}';const b=new Blob(['<html><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderCR(m)+'</body></html>'],{type:'application/msword'});const l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=m.title+'.doc';l.click()};
  $('#del').onclick=async()=>{if(confirm('Supprimer ?')){await chrome.storage.local.set({meetings:meetings.filter(x=>x.id!=id)});$('#detail').innerHTML='';renderList()}}};
 document.querySelectorAll('.item').forEach(e=>e.onclick=()=>show(e.dataset.id));if(sel)show(sel)}
$('#q').oninput=renderList;
chrome.storage.local.get(['key','model'],r=>{if(r.model)$('#model').value=r.model;if(r.key)$('#saved').textContent='Clé enregistrée (…'+String(r.key).slice(-4)+').'});
$('#save').onclick=async()=>{const o={model:$('#model').value.trim()};const k=cleanKey($('#key').value);if($('#key').value&&!k){$('#saved').textContent='Clé vide.';return}if(k){o.key=k;o.gmodel=''}await chrome.storage.local.set(o);$('#key').value='';$('#saved').textContent=k?(k.startsWith('AIza')?'Clé enregistrée (…'+k.slice(-4)+'). Cliquez sur « Tester la clé ».':'Enregistrée, mais elle ne commence pas par « AIza » : vérifiez la clé. Cliquez sur « Tester la clé ».'):'Modèle enregistré.'};
$('#testKey').onclick=async()=>{const {key,model,gmodel}=await chrome.storage.local.get(['key','model','gmodel']);if(!key){$('#saved').textContent='Aucune clé enregistrée.';return}$('#saved').textContent='Test en cours…';const r=await gemini('Réponds uniquement par : OK',cleanKey(key),(model||'').trim(),gmodel||'',m=>chrome.storage.local.set({gmodel:m}));const g=(await chrome.storage.local.get('gmodel')).gmodel;$('#saved').textContent=r?('✅ Clé acceptée. Modèle utilisé : '+((model||'').trim()||g)):('❌ Google répond : '+AI_ERR)};

$('#sayB').onclick=()=>{SAYAUTO=true;if(say.length)showSay();else{$('#say').classList.remove('hide');$('#sayEn').textContent="En attente d'une question…";$('#sayFr').textContent='';$('#sayN').textContent=''}};
let PA='pro';const lab=()=>PA==='pro'?'Pro':'Perso';
async function pfShow(){const {profiles={}}=await chrome.storage.local.get('profiles');const p=profiles[PA]||{};for(const k of PF)$('#'+k).value=p[k]||'';$('#pfA').classList.toggle('on',PA==='pro');$('#pfB').classList.toggle('on',PA==='perso');$('#pfOk').textContent='';$('#pfAct').textContent='Profil actif : '+lab();$('#pfT').textContent='Profil : '+lab()}
async function pfSet(v){PA=v;await chrome.storage.local.set({pfActive:v});pfShow()}
chrome.storage.local.get('pfActive',r=>{PA=r.pfActive||'pro';pfShow()});
$('#pfA').onclick=()=>pfSet('pro');$('#pfB').onclick=()=>pfSet('perso');$('#pfT').onclick=()=>pfSet(PA==='pro'?'perso':'pro');
$('#pfSave').onclick=async()=>{const {profiles={}}=await chrome.storage.local.get('profiles');const o={};for(const k of PF)o[k]=$('#'+k).value;profiles[PA]=o;await chrome.storage.local.set({profiles});$('#pfOk').textContent='Enregistré ('+lab()+', dans ce navigateur).'};

const setGa=v=>{document.documentElement.style.setProperty('--ga',v/100);$('#ga').value=v;$('#gav').textContent=v+' %'};chrome.storage.local.get('ga',r=>setGa(r.ga||50));$('#ga').oninput=e=>{setGa(+e.target.value);chrome.storage.local.set({ga:+e.target.value})};
