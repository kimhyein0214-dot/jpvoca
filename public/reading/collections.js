/* Reviewed N1 medium reading collection; answer keys remain provisional. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = byId('collection-status');
  let mediumLoaded = false;
  let mediumPromise;
  let activeMedium = false;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pair = ([jp, ko], cls='jp') => `<div class="${cls}" lang="ja">${jp}</div><div class="tr">${escape(ko)}</div>`;
  const list = (title, rows) => `<div class="study-card"><h3>${title}</h3><ul class="study-list">${rows.map(row=>`<li>${escape(row)}</li>`).join('')}</ul></div>`;
  function render(data) {
    byId('medium-nav').innerHTML = data.map(p=>`<a class="chip" href="#m${p.id}">${String(p.id).padStart(2,'0')} ${escape(p.title)}</a>`).join('');
    byId('medium-passages').innerHTML = data.map(p => `<section id="m${p.id}" class="block"><div class="head"><div class="no">${String(p.id).padStart(2,'0')}</div><h2>${escape(p.title)}</h2></div><p class="source-ref">중문 (${p.id}) · 교재 ${p.page}–${p.page+1}쪽 · 제목·해석·학습 해설은 추가 작성</p><div class="source">${p.sentences.map((s,i)=>`<div class="sent${p.paragraphStarts.includes(i)?' paragraph-break':''}">${pair(s)}</div>`).join('')}${p.notes.map(n=>`<div class="sent note">${pair(n,'jp note-jp')}</div>`).join('')}</div><details class="study-box"><summary>어휘 · 동사 · 문형 · 독해 포인트</summary><div class="study-content"><p class="source-ref">아래는 학습용으로 추가 작성한 해설입니다.</p><div class="study-grid">${list('핵심 어휘',p.vocab)}${list('동사 · 복합동사',p.verbs)}${list('문형 · 표현',p.patterns)}</div><div class="reading-point"><strong>독해 포인트: </strong>${escape(p.point)}</div></div></details>${p.questions.map(q=>`<div class="question-wrap" id="mq${q.n}"><div class="question"><div class="qjp"><span>문항 ${q.n}. </span><span lang="ja">${q.text[0]}</span></div><div class="tr qtr">${escape(q.text[1])}</div><ol class="choices">${q.choices.map(c=>`<li>${pair(c,'choice-jp')}</li>`).join('')}</ol></div><details class="answer-box"><summary>잠정 추론 답안 보기 · 문항 ${q.n}</summary><div class="answer"><p><strong>${'①②③④'[q.answer-1]}</strong> · 잠정 추론 답안</p><p>공식 정답표가 제공되지 않아 확정된 정답이 아닙니다.</p><p>${escape(q.reason)}</p></div></details></div>`).join('')}</section>`).join('');
    mediumLoaded = true;
    if (window.JLPT_MEDIUM_INSTRUCTION) byId('medium-passages').insertAdjacentHTML('afterbegin',`<div class="block">${pair(window.JLPT_MEDIUM_INSTRUCTION)}</div>`);
  }
  function load() {
    if (!mediumPromise) mediumPromise = new Promise((resolve,reject)=> {
      const script = document.createElement('script');
      script.src = 'data/medium.js';
      script.onload = () => {
        try {
          const data = window.JLPT_MEDIUM;
          if (!Array.isArray(data) || data.length!==12 || data.some(p=>p.questions.length!==2 || p.questions.some(q=>q.choices.length!==4))) throw new Error('Invalid medium data');
          render(data); resolve();
        } catch(e) { reject(e); }
      };
      script.onerror = () => reject(new Error('Medium data unavailable'));
      document.head.append(script);
    });
    return mediumPromise;
  }
  async function select() {
    const hash = location.hash;
    const medium = hash==='#top' ? activeMedium : /^#(?:medium|m\d+|mq\d+)$/.test(hash);
    activeMedium = medium;
    byId('short-passages').hidden = medium;
    byId('short-nav').hidden = medium;
    byId('medium-passages').hidden = !medium;
    byId('medium-nav').hidden = !medium;
    for (const [id, selected] of [['short-link',!medium],['medium-link',medium]]) {
      if (selected) byId(id).setAttribute('aria-current','page'); else byId(id).removeAttribute('aria-current');
    }
    if (!medium) { status.textContent = '단문 12지문'; return; }
    status.textContent = '중문 데이터를 불러오는 중입니다.';
    try {
      if (!mediumLoaded) await load();
      if (!activeMedium) return;
      status.textContent = '중문 12지문 / 24문항 · 모든 답안은 잠정 추론이며 공식 정답표 확인이 필요합니다.';
      const target = byId(location.hash.slice(1));
      if (target) target.scrollIntoView();
    } catch(e) {
      if (activeMedium) status.textContent = '중문 자료를 불러오지 못했습니다. 새로고침하거나 단문을 선택해 주세요.';
    }
  }
  addEventListener('hashchange', select);
  select();
})();
