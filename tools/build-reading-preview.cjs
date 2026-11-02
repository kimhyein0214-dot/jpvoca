/* Generates checked-in reading assets and the local QA preview from reviewed source data. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const kuromoji=require(path.join(root,'.tools/reading-qa/node_modules/kuromoji'));
const paragraphs=[[0,2,8,12],[0,3,6,9,11],[0,2,5,8,11],[0,2,4,11],[0,5,10],[0,6,16],[0,2,7,10,12],[0,5,8],[0,3,7,10],[0,2,8,11],[0,4,8,12],[0,5,10]];
const emphasis={1:['その意義'],2:['読書は脳をストレスから解放してくれる'],4:['それ'],7:['文化を味わい尽くす'],8:['健康志向ブームがさらに高まりを見せている'],9:['こういった作品の捉え方の違い'],10:['こうした欠点'],11:['これが困難なことにもなり得る'],12:['個人の意識改革とは異なる']};
const refs={1:[['解体',1],['工程',2],['有害物質',3]],2:[['高揚感',1],['加齢',2]],4:[['賜物',1]],5:[['様変わり',1]],6:[['旨味',1]],8:[['パンデミック',1],['打ちひしがれる',2],['未曾有',3],['快眠',4],['根幹',5]],9:[['十人十色',1]],12:[['念じようとも',1],['縮図',2]]};
const overrides={'賜物':'たまもの','旨味':'うまみ','未曾有':'みぞう','十人十色':'じゅうにんといろ','億劫':'おっくう','共存':'きょうそん','鑑みれ':'かんがみれ','亡き':'なき','念じよう':'ねんじよう','繋がる':'つながる','繋がり':'つながり','繋げる':'つなげる','繋ぐ':'つなぐ','直ぐ':'すぐ','統べる':'すべる','上り詰め':'のぼりつめ','耐え凌ぎ':'たえしのぎ','熟し':'じゅくし'};
Object.assign(overrides,{'長けれ':'ながけれ','月頃':'がつごろ','観':'み','日本':'にほん'});
const fixed={'十人十色':'じゅうにんといろ','一人一人':'ひとりひとり','加齢':'かれい','一時の':'いっときの','年を':'としを','年と':'としと','年には':'ねんには','4月頃':'しがつごろ','屋根の下':'やねのした','分解した後':'ぶんかいしたあと','旅先の市場':'たびさきのいちば','少子高齢化':'しょうしこうれいか','既存':'きそん'};
const fixedPattern=new RegExp('('+Object.keys(fixed).sort((a,b)=>b.length-a.length).join('|')+')','g');
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
kuromoji.builder({dicPath:path.join(root,'.tools/reading-qa/node_modules/kuromoji/dict')}).build((error,tokenizer)=>{
 if(error) throw error;
 const readings=new Map(),unknown=new Set();
 function ruby(text){
   return text.split(fixedPattern).filter(Boolean).map(part=>{
     if(fixed[part]){readings.set(part,fixed[part]);return `<ruby>${escape(part)}<rt>${fixed[part]}</rt></ruby>`;}
     return tokenRuby(part);
   }).join('');
 }
 function tokenRuby(text){
   const tokens=tokenizer.tokenize(text);
   assert.equal(tokens.map(t=>t.surface_form).join(''),text,'Tokenizer changed source');
   return tokens.map(t=>{
     const word=t.surface_form;
     if(!/[一-龯々]/.test(word)) return escape(word);
     const reading=overrides[word]||hira(t.reading||'');
     if(!reading||reading==='*'){unknown.add(word);return escape(word);}
     readings.set(word,reading);
     return `<ruby>${escape(word)}<rt>${escape(reading)}</rt></ruby>`;
   }).join('');
 }
 const data=[];
 for(let i=1;i<=12;i++){
   const p=JSON.parse(fs.readFileSync(path.join(root,`data/reading/medium/${String(i).padStart(2,'0')}.json`),'utf8'));
   assert.equal(p.id,i);assert.equal(p.page,388+2*i);assert.equal(p.questions.length,2);
   p.paragraphStarts=paragraphs[i-1];
   const used=new Set();
   const original=JSON.parse(JSON.stringify(p));
   function markup(text,annotate=false){
     const events=new Map();
     const add=(pos,value)=>events.set(pos,(events.get(pos)||'')+value);
     if(annotate) for(const term of emphasis[i]||[]){
       if(i===4&&!text.includes('それを行える医師'))continue;
       const pos=text.indexOf(term);
       if(pos>=0){add(pos,'<u>');add(pos+term.length,'</u>');}
     }
     if(annotate) for(const [term,n] of refs[i]||[]){
       if(!used.has(term)&&text.includes(term)){
         add(text.indexOf(term)+term.length,`<sup aria-label="주석 ${n}">（注${(refs[i]||[]).length===1?'':n}）</sup>`);
         used.add(term);
       }
     }
     let html='',cursor=0;
     for(const [pos,event] of [...events].sort((a,b)=>a[0]-b[0])){html+=ruby(text.slice(cursor,pos))+event;cursor=pos;}
     return html+ruby(text.slice(cursor));
   }
   p.sentences=p.sentences.map(([jp,ko])=>[markup(jp,true),ko]);
   p.notes=p.notes.map(([jp,ko])=>[ruby(jp),ko]);
   p.questions.forEach(q=>{assert.equal(q.choices.length,4);assert(q.answer>=1&&q.answer<=4);q.text=[ruby(q.text[0]),q.text[1]];q.choices=q.choices.map(([jp,ko])=>[ruby(jp),ko]);});
   for(const [k,rows] of [['sentences',p.sentences],['notes',p.notes]]) rows.forEach(([jp,ko],j)=>{assert(ko);const plain=jp.replace(/<rt>.*?<\/rt>/g,'').replace(/<sup[^>]*>.*?<\/sup>/g,'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");assert.equal(plain,original[k][j][0]);});
   data.push(p);
 }
 const preview=path.join(root,'.private-preview/jpvoca/reading');
 fs.mkdirSync(path.join(preview,'data'),{recursive:true});
 for(const file of ['index.html','collections.js'])fs.copyFileSync(path.join(root,'public/reading',file),path.join(preview,file));
 const instruction=JSON.parse(fs.readFileSync(path.join(root,'data/reading/medium/instruction.json'),'utf8'));
 instruction[0]=ruby(instruction[0]);
 const asset='window.JLPT_MEDIUM_INSTRUCTION = '+JSON.stringify(instruction)+';\nwindow.JLPT_MEDIUM = '+JSON.stringify(data)+';\n';
 fs.writeFileSync(path.join(preview,'data/medium.js'),asset);
 fs.mkdirSync(path.join(root,'public/reading/data'),{recursive:true});
 fs.writeFileSync(path.join(root,'public/reading/data/medium.js'),asset);
 fs.mkdirSync(path.join(root,'.private-source'),{recursive:true});
 fs.writeFileSync(path.join(root,'.private-source/readings.tsv'),[...readings].sort((a,b)=>a[0].localeCompare(b[0],'ja')).map(x=>x.join('\t')).join('\n'));
 fs.writeFileSync(path.join(root,'.private-source/unknown-readings.json'),JSON.stringify([...unknown]));
 console.log(JSON.stringify({passages:data.length,questions:data.flatMap(p=>p.questions).length,choices:data.flatMap(p=>p.questions).flatMap(q=>q.choices).length,notes:data.reduce((n,p)=>n+p.notes.length,0),readings:readings.size,unknown:[...unknown],preview}));
});
