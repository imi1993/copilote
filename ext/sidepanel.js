const $=s=>document.querySelector(s);const NM='non mentionné';let fs=22,transcript=[],sel=null;
const setFs=v=>{fs=Math.max(16,Math.min(48,v));document.documentElement.style.setProperty('--fs',fs+'px');chrome.storage.local.set({fs})};
chrome.storage.local.get(['fs'],r=>setFs(r.fs||22));chrome.storage.local.get(['theme'],r=>{document.documentElement.dataset.theme=r.theme||'light'});$('#theme').onclick=()=>{const d=document.documentElement;d.dataset.theme=d.dataset.theme==='light'?'dark':'light';chrome.storage.local.set({theme:d.dataset.theme})};$('#fm').onclick=()=>setFs(fs-3);$('#fp').onclick=()=>setFs(fs+3);
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));for(const s of ['live','notes','lib','set'])$('#'+s).classList.toggle('hide',s!==b.dataset.t);if(b.dataset.t==='lib')renderList()});
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
// états
const STATES={starting:['Démarrage…',''],loading:['Préparation du moteur de transcription…',''],listening:['En écoute','on'],stopped:['Écoute arrêtée',''],error:['Problème','err']};
function setState(m){const [t,c]=STATES[m.state]||['',''];let txt=t;if(m.platform)txt+=' ('+m.platform+')';if(m.detail)txt+=' : '+m.detail;if(m.error)txt+=' : '+m.error+'. Recliquez sur l\'icône du copilote pour réessayer.';$('#st').textContent=txt;$('#dot').className='dot '+c}
// IA (Gemini, clé facultative)
async function ai(prompt){const {key,model}=await chrome.storage.local.get(['key','model']);if(!key)return null;
 try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model||'gemini-2.0-flash'}:generateContent?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});const j=await r.json();return j.candidates?.[0]?.content?.parts?.[0]?.text||null}catch(e){return null}}
async function onText(t){transcript.push({t,at:Date.now()});if($('#en').classList.contains('mut'))$('#en').innerHTML='',$('#en').classList.remove('mut');
 $('#en').insertAdjacentHTML('beforeend',`<p class="line en">${esc(t)}</p>`);
 const a=await ai(`Tu es un coach de réunion. Phrase entendue (anglais) : "${t}". Réponds en 2 parties séparées par "||" : 1) explication simple en français (une ou deux phrases) ; 2) si une réponse est attendue de l'utilisatrice, une phrase courte en anglais très simple suivie de son sens en français entre parenthèses, sinon laisse vide. N'invente rien.`);
 if(!a)return;const [x,y]=a.split('||');$('#fr').insertAdjacentHTML('beforeend',`<p class="line fr">${esc(x.trim())}</p>`);if(y&&y.trim())$('#rep').innerHTML=`<div class="reply">${esc(y.trim())}</div>`}
chrome.runtime.onMessage.addListener(m=>{if(m.to!=='panel')return;if(m.type==='state')setState(m);if(m.type==='text')onText(m.text)});
$('#sum').onclick=async()=>{const since=Date.now()-5*60000;const txt=transcript.filter(x=>x.at>=since).map(x=>x.t).join(' ');if(!txt){$('#fr').insertAdjacentHTML('beforeend','<p class="line mut">Rien à résumer pour l\'instant.</p>');return}
 const r=await ai(`Résume en français, en 4 puces courtes maximum, sans rien inventer : ${txt}`);$('#fr').insertAdjacentHTML('beforeend',`<div class="card"><h2>Résumé (5 dernières minutes)</h2>${r?esc(r).replace(/\n/g,'<br>'):'<span class="mut">Clé IA nécessaire (Réglages).</span>'}</div>`)};
// compte rendu
const ul=l=>l&&l.length?'<ul>'+l.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':`<p class="nm">${NM}</p>`;
function renderCR(m){const c=m.cr;const d=new Date(m.date);return `<article class="cr"><h1>Compte rendu de réunion</h1><div class="meta"><div><b>Réunion</b><br>${esc(m.title)}</div><div><b>Date</b><br>${d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} ${d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div></div>
<h2>Participants</h2>${ul(c.participants)}<h2>Ordre du jour</h2>${ul(c.ordre_du_jour)}<h2>Résumé exécutif</h2><p>${esc(c.resume||NM)}</p>
<h2>Sujets abordés</h2>${(c.sujets&&c.sujets.length)?c.sujets.map(x=>`<h3>${esc(x.titre)}</h3>${ul(x.points)}`).join(''):`<p class="nm">${NM}</p>`}
<h2>Décisions</h2>${ul(c.decisions)}<h2>Conclusions</h2>${ul(c.conclusions)}
<h2>Plan d'actions</h2>${(c.actions&&c.actions.length)?`<table><tr><th>Action</th><th>Responsable</th><th>Délai</th></tr>${c.actions.map(x=>`<tr><td>${esc(x.action)}</td><td>${esc(x.responsable||NM)}</td><td>${esc(x.delai||NM)}</td></tr>`).join('')}</table>`:`<p class="nm">${NM}</p>`}
<h2>Points à confirmer</h2>${ul(c.a_confirmer)}<p class="foot">Généré à partir de la transcription et des notes ; à relire avant diffusion.</p></article>`}
$('#end').onclick=async()=>{chrome.runtime.sendMessage({to:'bg',type:'stop'});const text=transcript.map(x=>x.t).join(' ');const title=$('#title').value||'Réunion sans titre';const notes=$('#nt').value;
 const raw=await ai(`Tu es secrétaire de séance expert. À partir de la transcription (anglais) et des notes ci-dessous, rédige en français un compte rendu professionnel. Réponds UNIQUEMENT par un JSON valide : {"participants":[""],"ordre_du_jour":[""],"sujets":[{"titre":"","points":[""]}],"decisions":[""],"conclusions":[""],"actions":[{"action":"","responsable":"","delai":""}],"a_confirmer":[""],"resume":""}. Phrases courtes, aucune invention ; si une information n'est pas dite, écris "non mentionné" ou laisse la liste vide.\n\nNotes : ${notes}\n\nTranscription : ${text}`);
 let cr=null;try{cr=JSON.parse((raw||'').replace(/^```json|```$/g,'').trim())}catch(e){}
 if(!cr)cr={resume:text?NM+' (compte rendu automatique indisponible : ajoutez une clé IA dans Réglages)':NM,participants:[],ordre_du_jour:[],sujets:[{titre:'Notes de séance',points:notes?notes.split('\n').filter(Boolean):[NM]}],decisions:[],conclusions:[],actions:[],a_confirmer:[]};
 const {meetings=[]}=await chrome.storage.local.get('meetings');const m={id:Date.now(),title,date:new Date().toISOString(),text,notes,cr};meetings.unshift(m);await chrome.storage.local.set({meetings});sel=m.id;transcript=[];
 $('#en').className='mut';$('#en').textContent="En attente de l'audio…";$('#fr').innerHTML='';$('#rep').innerHTML='';document.querySelector('[data-t=lib]').click()};
async function renderList(){const {meetings=[]}=await chrome.storage.local.get('meetings');const q=$('#q').value.toLowerCase();const a=meetings.filter(m=>(m.title+JSON.stringify(m.cr)+m.text).toLowerCase().includes(q));
 $('#list').innerHTML=a.map(m=>`<div class="item" data-id="${m.id}"><b>${esc(m.title)}</b><br><span class="mut">${new Date(m.date).toLocaleString('fr-FR')}</span></div>`).join('')||'<p class="mut">Aucun compte rendu.</p>';
 const show=id=>{const m=meetings.find(x=>x.id==id);if(!m)return;$('#detail').innerHTML=renderCR(m)+'<div class="noprint" style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="p" id="pdf">PDF / Imprimer</button><button id="doc">Word (.doc)</button><button id="del">Supprimer</button></div>';
  $('#pdf').onclick=()=>print();$('#doc').onclick=()=>{const css='body{font-family:Calibri,Arial}h2{color:#1f2a44;border-bottom:1px solid #999}td,th{border:1px solid #999;padding:4px 8px}';const b=new Blob(['<html><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+renderCR(m)+'</body></html>'],{type:'application/msword'});const l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=m.title+'.doc';l.click()};
  $('#del').onclick=async()=>{if(confirm('Supprimer ?')){await chrome.storage.local.set({meetings:meetings.filter(x=>x.id!=id)});$('#detail').innerHTML='';renderList()}}};
 document.querySelectorAll('.item').forEach(e=>e.onclick=()=>show(e.dataset.id));if(sel)show(sel)}
$('#q').oninput=renderList;
chrome.storage.local.get(['key','model'],r=>{if(r.model)$('#model').value=r.model;if(r.key)$('#saved').textContent='Clé enregistrée.'});
$('#save').onclick=async()=>{const o={model:$('#model').value.trim()};if($('#key').value)o.key=$('#key').value.trim();await chrome.storage.local.set(o);$('#key').value='';$('#saved').textContent='Enregistré.'};
