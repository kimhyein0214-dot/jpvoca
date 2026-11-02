const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'.tools/reading-qa/node_modules/playwright'));
const base='http://127.0.0.1:8765/jpvoca/reading/';
(async()=>{
 const original=cp.execFileSync('git',['show','origin/main:public/reading/index.html'],{cwd:root,encoding:'utf8'});
 const current=fs.readFileSync(path.join(root,'public/reading/index.html'),'utf8');
 const sections=s=>[...s.matchAll(/<section id="p\d+"[\s\S]*?<\/section>/g)].map(m=>m[0].replace(/\r\n/g,'\n'));
 assert.equal(sections(original).length,12);assert.deepEqual(sections(current),sections(original));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);assert.equal(await page.locator('#short-passages section').count(),12);
 assert(await page.locator('#short-passages').isVisible());
 await page.click('#medium-link');await page.waitForSelector('#m12');
 assert.equal(await page.locator('#medium-passages section').count(),12);
 assert.equal(await page.locator('#medium-passages .question').count(),24);
 assert.equal(await page.locator('#medium-passages .choices li').count(),96);
 assert.equal(await page.locator('#medium-passages .note').count(),16);
 assert.equal(await page.locator('#medium-passages .source sup').count(),16);
 assert.equal(await page.locator('#medium-nav a').count(),12);
 for(let i=1;i<=12;i++){
   const raw=JSON.parse(fs.readFileSync(path.join(root,`.private-source/${String(i).padStart(2,'0')}.json`),'utf8'));
   const read=async selector=>page.locator(selector).evaluateAll(els=>els.map(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('rt,sup').forEach(x=>x.remove());return copy.textContent;}));
   assert.deepEqual(await read(`#m${i} .source .sent:not(.note) .jp`),raw.sentences.map(x=>x[0]));
   assert.deepEqual(await read(`#m${i} .note .jp`),raw.notes.map(x=>x[0]));
   assert.deepEqual(await read(`#m${i} .qjp [lang=ja]`),raw.questions.map(q=>q.text[0]));
   assert.deepEqual(await read(`#m${i} .choice-jp`),raw.questions.flatMap(q=>q.choices.map(c=>c[0])));
   assert.equal(await page.locator(`#m${i} .source .tr`).count(),raw.sentences.length+raw.notes.length);
   await page.click(`#medium-nav a[href="#m${i}"]`);assert.equal(await page.locator(`#m${i}`).count(),1);
 }
 assert.equal(await page.locator('#medium-passages .answer-box[open]').count(),0);
 await page.click('#showAllAnswers');assert.equal(await page.locator('#medium-passages .answer-box[open]').count(),24);
 assert.equal(await page.locator('#short-passages .answer-box[open]').count(),0);
 await page.click('#hideAllAnswers');assert.equal(await page.locator('#medium-passages .answer-box[open]').count(),0);
 await page.click('#mq1 summary');assert(await page.locator('#mq1 .answer').isVisible());
 assert((await page.locator('#mq1 .answer').textContent()).includes('공식 정답표'));
 await page.click('#translationToggle');assert(!(await page.locator('#m1 .tr').first().isVisible()));
 await page.click('#furiganaToggle');assert.equal(await page.locator('#m1 rt').first().evaluate(e=>getComputedStyle(e).visibility),'hidden');
 await page.click('#themeToggle');assert(await page.locator('body').evaluate(e=>e.classList.contains('dark')));
 await page.click('#fontUp');assert.equal(await page.locator('#sizeLabel').textContent(),'글자 110%');
 await page.reload();await page.waitForSelector('#m12');
 assert.equal(await page.locator('#furiganaToggle').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#translationToggle').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#sizeLabel').textContent(),'글자 110%');
 await page.click('.to-top');assert(await page.locator('#medium-passages').isVisible());
 await page.click('#short-link');await page.locator('#short-passages').waitFor({state:'visible'});assert(await page.locator('#short-passages').isVisible());
 for(let i=1;i<=12;i++){await page.click(`#short-nav a[href="#p${i}"]`);assert.equal(await page.locator(`#p${i}`).count(),1);}
 await page.click('#showAllAnswers');assert.equal(await page.locator('#short-passages .answer-box[open]').count(),12);
 await page.click('#hideAllAnswers');
 await page.click('#translationToggle');await page.click('#furiganaToggle');
 await page.click('#medium-link');
 await page.click('#themeToggle');
 for(const width of [320,375,390,768,1280]){
   await page.setViewportSize({width,height:844});
   for(const scale of [1,1.4]){
     await page.evaluate(s=>{localStorage.setItem('jlpt_font_scale',String(s));},scale);await page.reload();await page.waitForSelector('#m12');
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Horizontal overflow at ${width}/${scale}`);
   }
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'#m1');await page.waitForSelector('#m12');
 await page.evaluate(()=>{localStorage.setItem('jlpt_font_scale','1');});await page.reload();await page.waitForSelector('#m12');
 if(await page.locator('body').evaluate(e=>e.classList.contains('dark')))await page.click('#themeToggle');
 await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(245, 247, 251)');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'.private-source/mobile-light.png')});
 await page.locator('#m1 .source').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'.private-source/mobile-source.png')});
 await page.click('#themeToggle');await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(17, 20, 26)');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'.private-source/mobile-dark.png')});
 await page.locator('#mq1').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'.private-source/mobile-question-dark.png')});
 await page.goto(base+'#m12');await page.waitForSelector('#m12');assert(await page.locator('#medium-passages').isVisible());
 await page.route('**/data/medium.js',route=>route.abort());
 await page.goto(base+'?missing-data=1#medium');
 await page.waitForFunction(()=>document.getElementById('collection-status').textContent.includes('미리보기에서만 제공'));
 await page.click('#short-link');await page.locator('#short-passages').waitFor({state:'visible'});
 assert.equal(await page.locator('#short-passages section').count(),12);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: 12 short sections unchanged; 12 medium/24 questions/96 choices/16 notes; all JP rendered exactly from transcription; links, controls, persistence, scoped answers, deep links, 320–1280px and 140% text; no page errors.');
})().catch(e=>{console.error(e);process.exit(1);});
