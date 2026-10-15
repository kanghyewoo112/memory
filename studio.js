(() => {
'use strict';
const $ = id => document.getElementById(id);
const app = $('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* =========================================================
   저장소 (IndexedDB · 내 기기에만 저장)
   ========================================================= */
const DB = 'maeumseorap';
let dbp = null;
function idb(){
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function dbGet(k){
  try { const db = await idb(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); }
  catch(e){ return null; }
}
async function dbSet(k, v){
  try { const db = await idb(); await new Promise(res => { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); }
  catch(e){ toast('이 브라우저에서는 저장이 되지 않습니다. 백업 파일로 보관해 주세요.'); }
}
let state = { drawers: [], current: null };
let saveTimer;
function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(() => dbSet('state', state), 250); }

function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* =========================================================
   마음서랍 지침 상수
   ========================================================= */
const OPENING_QS = [
  '어린 시절 살던 집을 떠올리면 가장 먼저 무엇이 보이나요?',
  '어머니를 생각하면 가장 먼저 떠오르는 모습은 무엇인가요?',
  '학교 다닐 때 가장 자주 지나던 길은 어디였나요?',
  '처음 월급을 받았던 날을 기억하시나요?',
  '평생 잊히지 않는 식사가 하나 있다면 언제인가요?',
  '다시 한번 가보고 싶은 장소가 있나요?'
];
const TOPICS = ['아버지의 자전거','첫 월급','엄마의 도시락','처음 서울에 올라온 날','우리 가족의 첫 번째 집','군대 가던 날',
  '처음 아이를 안았던 순간','아내를 처음 만난 날','남편을 처음 만난 날','매일 다니던 공장길','할머니의 부엌','문을 닫던 마지막 영업일'];

const QUESTIONS = [
  { k:'memory', label:'사건', q: d => `${d.opening}\n\n떠오르는 대로, 평소 말하듯 편하게 들려주세요.` },
  { k:'who', label:'함께 있던 사람', q: () => '그 장면에서 가장 먼저 떠오르는 사람이 누구인가요?\n혼자였다면 “나 혼자”라고 하셔도 돼요.' },
  { k:'doing', label:'그 사람의 행동', q: d => `${d.answers.who.trim()} — 그분은 그때 무엇을 하고 있었나요?`,
    cond: d => d.status.who === 'answered' && !/혼자|없어|없었/.test(d.answers.who) },
  { k:'place', label:'장소', q: () => '그곳은 어디였나요?' },
  { k:'when', label:'시기', q: () => '그때 몇 살쯤이었나요? 어느 계절이었는지도 기억나시면 알려 주세요.\n정확하지 않으면 “아마 ~쯤”이라고 하셔도 괜찮아요.' },
  { k:'scene', label:'가장 기억나는 장면', q: () => '그 장면에서 지금도 가장 또렷하게 보이는 것은 무엇인가요?' },
  { k:'sense', label:'감각', q: () => '그때 기억나는 소리나 냄새, 온도 같은 게 있나요?' },
  { k:'words', label:'기억나는 말', type:'words', q: () => '그때 누군가 실제로 했던 말이 기억나시나요?\n정확히 기억나는지, 대략적인 내용만 기억나는지 먼저 골라 주세요.' },
  { k:'now', label:'지금 하는 말', skip:'특별히 없어요', q: () => '지금 이 기억을 떠올리면, 어떤 말이 먼저 나오세요?' },
  { k:'ending', label:'마지막 장면', q: () => '이 이야기를 어떤 장면이나 말로 끝내고 싶으세요?\n교훈보다는, 지금도 떠오르는 장면 하나면 충분해요.' },
  { k:'exclude', label:'빼고 싶은 부분', skip:'없어요', q: () => '혹시 이 이야기에서 빼고 싶은 부분이 있나요? 이유는 묻지 않을게요.' }
];
const QMAP = Object.fromEntries(QUESTIONS.map(q => [q.k, q]));

const SEGS = [
  { name:'기억을 여는 장면', t:'0–8초',  sec:8,  why:'사진 한 장, 물건 하나, 한 문장으로 시작', color:'var(--wood-lt)' },
  { name:'그때의 상황',     t:'8–20초', sec:12, why:'언제, 어디였는지 최소한만',             color:'var(--sage)' },
  { name:'가장 중요한 기억', t:'20–42초',sec:22, why:'사람의 행동, 말, 그 장면',              color:'var(--wood)' },
  { name:'지금의 나',       t:'42–52초',sec:10, why:'직접 하신 말이 있을 때만',              color:'var(--brass)' },
  { name:'마지막 장면',     t:'52–60초',sec:8,  why:'교훈 대신 장면이나 그때의 말로',         color:'var(--wood-dk)' }
];
const STEPS = [
  ['기억 고르기','한 서랍, 한 기억'], ['기억 인터뷰','질문은 하나씩'], ['사진 확인','있는 만큼만'],
  ['대본·녹음','내 말, 내 목소리'], ['검증','다섯 편집자'], ['완성','1분 자서전']
];

const BANNED = ['돌이켜보면','지금의 나를 만들','지금의 저를 만들','인생의 소중한 교훈','새로운 시작이었','운명처럼','전환점',
  '결코 잊을 수 없','가슴 한편','세월이 흘렀지만','그때는 몰랐','이제야 알 것 같','모든 순간이 소중','소중한 교훈'];
const EMOTION = ['슬펐','슬픔','기뻤','기쁨','행복','그리움','그리웠','서러','벅차','뭉클','감동','외로','두려','설레','눈물',
  '미안했','고마웠','자랑스러','쓸쓸','허전','속상','억울','감격'];
const LITERARY = ['찬란','아련','고즈넉','하염없이','유산','여정','아로새','켜켜이','영원히','소중한 추억','깊은 울림','따스한 햇살','형언','밀려왔','먹먹','숭고','위대한'];
const HEDGE = /쯤|것 같|아마|무렵|즈음|정도|인가|던가/;
const STOP = new Set('그때 그리 그래 그런 그날 그거 그게 그건 그냥 그분 저는 제가 나는 내가 우리 정말 아마 이런 있었 있어 있던 없었 했어 했던 했다 같아 같은 정확 기억 나지 않지 이야 생각 지금 너무 아주 많이 이거 저거 거기 여기 이제 다시 하고 하는 해서 했죠 이었 였어 였던 것이 것은 것을 마다 때는 때문'.split(' '));
const SPS = 5.5; // 내레이션 1초당 글자 수(공백 제외) 추정치

/* =========================================================
   서랍 데이터
   ========================================================= */
function newDrawer(){
  return { id: 'd' + Date.now().toString(36), title:'', oneLine:'', opening:'', topic:'',
    answers:{}, status:{}, whenCert:'mem', wordsMode:null, qi:-1, chat:[], interviewDone:false,
    photos:[], segments:null, gold:null, goldNote:'', passed:false, step:0, created:new Date().toISOString() };
}
const cur = () => state.drawers.find(d => d.id === state.current);
const ok = (d, k) => d.status[k] === 'answered' && (d.answers[k] || '').trim() !== '';

/* ---------- 텍스트 유틸 ---------- */
const sentences = t => ((t || '').replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*["”’']?/g) || []).map(s => s.trim()).filter(Boolean);
const fin = t => { t = (t || '').trim(); return !t ? '' : (/[.!?…"”’]$/.test(t) ? t : t + '.'); };
const secs = t => (t || '').replace(/\s/g, '').length / SPS;
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const snip = (t, n = 22) => { t = (t || '').trim().replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n) + '…' : t; };
const stems = t => ((t || '').match(/[가-힣A-Za-z0-9]{2,}/g) || []).map(w => w.slice(0, 2)).filter(s => !STOP.has(s));
const norm = t => (t || '').replace(/[\s.,!?…"“”'‘’~-]/g, '');

function sourceText(d){
  const parts = Object.keys(d.answers).filter(k => ok(d, k)).map(k => d.answers[k]);
  d.photos.forEach(p => parts.push(p.who, p.where, p.when, p.by, p.memory));
  parts.push(d.title, d.oneLine);
  return parts.filter(Boolean).join(' \n ');
}

/* =========================================================
   대본 엮기 — 들려주신 말만 사용 (BLACK)
   ========================================================= */
function buildSegments(d){
  const A = d.answers;
  const mem = sentences(A.memory);
  let open = '', ctx = [], core = [], now = '', end = '';
  if (ok(d,'scene')) open = fin(A.scene); else if (mem.length) open = mem.shift();
  if (ok(d,'when')) ctx.push(fin(A.when));
  if (ok(d,'place')) ctx.push(fin(A.place));
  core.push(...mem);
  if (ok(d,'doing')) core.push(fin(A.doing));
  if (ok(d,'sense')) core.push(fin(A.sense));
  let wordsLine = '';
  if (ok(d,'words')) {
    const w = A.words.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').replace(/[.。]$/, '');
    if (d.wordsMode === 'exact') wordsLine = `“${w}”`;
    else wordsLine = HEDGE.test(w) ? `정확한 말은 기억나지 않지만, ${fin(w)}` : `정확한 말은 기억나지 않지만, ${w}, 그런 이야기였던 것 같아요.`;
  }
  if (ok(d,'now')) now = fin(A.now);
  if (ok(d,'ending')) end = fin(A.ending);
  if (wordsLine) { if (end) core.push(wordsLine); else end = wordsLine; }
  if (!end && core.length > 1) end = core.pop();

  const texts = [open, ctx.join(' '), core.join(' '), now, end];
  const order = [0, 4, 2, 1, 3]; // 실제 사진 우선 배치 순서
  const mats = Array(5).fill('rep');
  let pi = 0;
  order.forEach(i => { if (texts[i] && pi < d.photos.length) mats[i] = d.photos[pi++].id; });
  d.segments = texts.map((text, i) => ({
    text, material: mats[i], audio:null, audioDur:0,
    cert: (i === 1 && d.whenCert === 'est') ? 'est' : 'mem',
    rep: repFor(d, i)
  }));
  if (!d.title) d.title = d.topic || '';
  if (!d.oneLine && ok(d,'memory')) d.oneLine = snip(sentences(A.memory)[0] || A.memory, 60);
}

function repFor(d, i){
  const A = d.answers, has = k => ok(d, k);
  const grounded = ['who','place','when','scene','sense','doing'].filter(has).map(k => `${QMAP[k].label}: ${snip(A[k], 30)}`);
  const personPhoto = d.photos.some(p => (p.who || '').trim());
  return {
    era: has('when') ? A.when.trim() + (d.whenCert === 'est' ? ' (추정)' : '') : '말씀하지 않음',
    place: has('place') ? A.place.trim() : '말씀하지 않음',
    people: has('who') ? A.who.trim() : '말씀하지 않음',
    action: (i === 0 && has('scene')) ? A.scene.trim() : has('doing') ? A.doing.trim() : '말씀하지 않음',
    grounded: grounded.join(' / ') || '없음',
    unknown: '옷 색깔, 날씨, 건물 형태, 얼굴 생김새 등 말씀하지 않은 것은 정하지 않음',
    mood: '들려주신 장면 범위 안에서, 과장 없이 차분하게',
    camera: personPhoto ? '실제 사진 속 외모(얼굴형·연령대·머리 모양·안경)를 유지, 중간 거리' : '얼굴 대신 뒷모습·손·사물·공간 중심의 먼 거리',
    ref: d.photos.length ? '있음 — 사진 확인 단계의 사진 참고' : '없음'
  };
}
function repPrompt(r){
  return `[기억의 시각적 재현 — 실제 기록 사진 아님]
시대: ${r.era}
장소: ${r.place}
등장인물: ${r.people}
행동: ${r.action}
기억에 근거한 요소: ${r.grounded}
기억에 없는 요소(임의로 확정하지 말 것): ${r.unknown}
분위기: ${r.mood}
카메라 거리: ${r.camera}
실제 사진 참고: ${r.ref}
스타일: 다큐멘터리 톤, 자연광, 과장된 연출 없음`;
}

/* 필요한 자료 (⑥) */
function neededMaterials(d){
  const A = d.answers, out = [];
  if (ok(d,'who') && !/혼자/.test(A.who)) out.push(`${snip(A.who, 20)} — 그 시절 사진`);
  if (ok(d,'place')) out.push(`${snip(A.place, 20)} — 당시 사진, 또는 지금 같은 장소 사진`);
  if (ok(d,'when') && /살|학년|어릴|어린/.test(A.when)) out.push('그 무렵 본인 사진');
  if (ok(d,'scene')) out.push(`이야기 속 물건이나 장면 — “${snip(A.scene, 18)}”`);
  out.push('가족사진');
  return out;
}

/* =========================================================
   검증 — RED · SILVER · BLUE (규칙 기반 자동 점검) + GOLD (사람)
   ========================================================= */
function review(d){
  const segs = (d.segments || []).map((s, i) => ({ ...s, i })).filter(s => s.text.trim());
  const src = sourceText(d), srcN = norm(src), srcStems = new Set(stems(src));
  const all = segs.map(s => s.text).join(' ');
  const R = { items:[], ded:0, fatal:false }, S = { items:[], ded:0, fatal:false }, B = { items:[], ded:0, fatal:false };
  const add = (X, i, msg, ded, fatal, quote) => { X.items.push({ seg:i, msg, fatal:!!fatal, quote }); X.ded += ded; if (fatal) X.fatal = true; };

  // ---- RED: 기억과 결과물이 같은가 ----
  segs.forEach(s => {
    (s.text.match(/\d+/g) || []).forEach(n => { if (!src.includes(n)) add(R, s.i, `“${n}” — 이 날짜·숫자는 사용자가 직접 말한 기억에 없습니다.`, 3, true); });
    const qre = /[“"]([^”"]+)[”"]/g; let m;
    while ((m = qre.exec(s.text))) {
      if (d.wordsMode !== 'exact' || !srcN.includes(norm(m[1])))
        add(R, s.i, '사용자가 정확히 기억한다고 하지 않은 직접 인용입니다.', 3, true, m[1]);
    }
    EMOTION.forEach(w => { if (s.text.includes(w) && !src.includes(w)) add(R, s.i, `“${w}…” — 이 감정은 사용자가 표현하지 않았습니다.`, 3, true); });
    const st = stems(s.text);
    if (st.length >= 4) {
      const novel = st.filter(x => !srcStems.has(x));
      const ratio = novel.length / st.length;
      if (ratio > 0.6) add(R, s.i, '이 내용은 사용자가 직접 말한 기억에 없습니다. 들려주신 말로 다시 써 주세요.', 3, true);
      else if (ratio > 0.35) add(R, s.i, '들려주신 기억에 없는 낱말이 많습니다. 새로 덧붙인 내용이 없는지 확인해 주세요.', 1, false);
    }
    if (s.material === 'rep' && /이 사진|사진 속|사진을 보면/.test(s.text)) add(R, s.i, '이 장면은 기억과 AI 재현을 구분해야 합니다. 재현 장면을 ‘사진’이라고 말하고 있습니다.', 2, true);
  });
  if (d.whenCert === 'est') {
    const ctx = segs.find(s => s.i === 1);
    if (ctx && !HEDGE.test(ctx.text)) add(R, 1, '기억이 불확실한 시기를 사실처럼 단정하고 있습니다. “쯤”, “것 같다”를 살려 주세요.', 1.2, false);
  }
  if (ok(d,'exclude'))
    R.items.push({ seg:-1, msg:`빼 달라고 하신 부분이 대본에 남아 있지 않은지 확인해 주세요: “${snip(d.answers.exclude, 40)}”`, info:true });

  // ---- SILVER: 1분 안에 하나의 기억이 전해지는가 ----
  const total = segs.reduce((a, s) => a + (s.audio ? s.audioDur : secs(s.text)), 0);
  if (!segs.length) add(S, -1, '대본이 비어 있습니다.', 10, true);
  if (total > 80) add(S, -1, `약 ${Math.round(total)}초입니다. 1분을 크게 넘어 기억의 밀도가 떨어집니다.`, 2);
  else if (total > 66) add(S, -1, `약 ${Math.round(total)}초입니다. 1분을 조금 넘습니다. 과도한 설명을 덜어 주세요.`, 0.8);
  else if (total < 30 && segs.length) add(S, -1, `약 ${Math.round(total)}초로 짧습니다. 중요한 장면에 시간을 더 주어도 좋습니다.`, 0.4);
  if (segs.length && !segs.find(s => s.i === 0)) add(S, 0, '첫 장면이 비어 있어, 무엇에 관한 이야기인지 바로 알기 어렵습니다.', 1.5);
  if (segs.length && !segs.find(s => s.i === 2)) add(S, 2, '가장 중요한 기억 구간이 비어 있습니다.', 2);
  const last = segs[segs.length - 1];
  if (last) {
    const lastS = sentences(last.text).pop() || '';
    if (BANNED.some(b => lastS.includes(b) && !src.includes(b))) add(S, last.i, '마지막이 억지 교훈으로 끝납니다. 구체적인 장면이나 실제 하신 말로 끝내 주세요.', 2, false, lastS);
  }
  const years = new Set((all.match(/(19|20)\d{2}/g) || []));
  if (years.size > 1) add(S, -1, '한 영상에 여러 시기가 섞여 있습니다. 한 서랍에는 한 기억만 담아 주세요.', 1);
  const seen = new Set();
  segs.forEach(s => sentences(s.text).forEach(t => { const k = norm(t); if (k.length > 6 && seen.has(k)) add(S, s.i, '같은 문장이 반복됩니다.', 0.5, false, t); seen.add(k); }));
  segs.forEach(s => {
    if (!s.audio && secs(s.text) > SEGS[s.i].sec * 1.5) add(S, s.i, `${SEGS[s.i].t} 구간에 비해 문장이 깁니다.`, 0.3);
    BANNED.forEach(b => { if (s.text.includes(b) && !src.includes(b)) add(S, s.i, `“${b}” — 사용자가 하지 않은 상투적인 자서전 문장입니다.`, 1); });
  });

  // ---- BLUE: 소리 내어 읽었을 때 그 사람 목소리인가 ----
  let longCnt = 0;
  segs.forEach(s => sentences(s.text).forEach(t => { if (t.replace(/\s/g,'').length > 55 && longCnt < 4) { longCnt++; add(B, s.i, '한 문장이 길어 숨 쉬며 읽기 어렵습니다. 끊어 읽을 곳을 만들어 주세요.', 0.4, false, snip(t, 40)); } }));
  const endType = t => { t = t.replace(/[.!?…"”’'\s]+$/, ''); if (/(니다|니까)$/.test(t)) return '합쇼체(-습니다)'; if (/요$/.test(t)) return '해요체(-요)'; if (/(다|지|네|어|아|야|군|구나|더라|거든)$/.test(t)) return '해체(-다/-어)'; return null; };
  const count = arr => { const c = {}; arr.forEach(x => { if (x) c[x] = (c[x] || 0) + 1; }); return c; };
  const nc = count(sentences(all).map(endType)), nTot = Object.values(nc).reduce((a, b) => a + b, 0);
  const sc = count(sentences(src).map(endType)), sTot = Object.values(sc).reduce((a, b) => a + b, 0);
  const dom = (c, tot) => { const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e && tot ? { t:e[0], r:e[1] / tot } : null; };
  const nd = dom(nc, nTot), sd = dom(sc, sTot);
  if (nTot >= 4 && Object.values(nc).filter(v => v / nTot >= 0.25).length > 1) add(B, -1, '말투가 끝까지 같지 않습니다. 이 한 문장에서 목소리가 달라집니다.', 1);
  if (nd && sd && sTot >= 3 && nd.t !== sd.t && nd.r >= 0.7 && sd.r >= 0.6) add(B, -1, `평소 말투(${sd.t})와 다른 문체(${nd.t})로 바뀌었습니다.`, 3, true);
  segs.forEach(s => LITERARY.forEach(w => { if (s.text.includes(w) && !src.includes(w)) add(B, s.i, `“${w}” — 이 문장은 사용자가 아니라 작가가 말하는 것처럼 들립니다.`, 0.8); }));
  segs.forEach(s => { if (/(이|가) 밀려|가슴이|마음이 아팠/.test(s.text) && !/(가슴|마음|밀려)/.test(src)) add(B, s.i, '여기에서는 감정을 설명하지 않아도 장면만으로 충분합니다.', 1); });

  const score = X => { let v = Math.max(0, 10 - X.ded); if (X.fatal) v = Math.min(v, 5); return Math.round(v * 10) / 10; };
  const res = { red: score(R), silver: score(S), blue: score(B), R, S, B, total };
  res.fatal = R.fatal || S.fatal || B.fatal;
  res.scoresOk = res.red >= 9.7 && res.silver >= 9.7 && res.blue >= 9.7 && !res.fatal;
  res.goldOk = d.gold === 'again' || d.gold === 'family';
  res.pass = res.scoresOk && res.goldOk;
  return res;
}
const GOLD = { again:'다시 보고 싶다', family:'가족에게 보여주고 싶다', stop:'여기까지 본다' };

/* =========================================================
   화면 그리기
   ========================================================= */
function render(){
  stopListening();
  const d = cur();
  $('openPlayer').hidden = !(d && d.segments && d.segments.some(s => s.text.trim()));
  if (!d) { renderHome(); window.scrollTo({ top: 0 }); return; }
  app.innerHTML = stepper(d) + `<div id="stepBody"></div>`;
  [stepPick, stepInterview, stepPhotos, stepScript, stepReview, stepDone][d.step](d, $('stepBody'));
  window.scrollTo({ top: 0 });
}
function stepper(d){
  return `<div class="stepper">${STEPS.map((s, i) =>
    `<button data-step="${i}" class="${i === d.step ? 'on' : ''} ${i < d.step ? 'done' : ''}"><b>${i + 1}. ${s[0]}</b>${s[1]}</button>`).join('')}</div>`;
}
function stepNav(prevLabel, nextLabel, nextDisabled){
  return `<div class="step-nav">
    ${prevLabel ? `<button class="btn" data-act="prev">← ${prevLabel}</button>` : '<span></span>'}
    ${nextLabel ? `<button class="btn primary" data-act="next" ${nextDisabled ? 'disabled' : ''}>${nextLabel} →</button>` : ''}
  </div>`;
}

/* ---------- 서랍장 ---------- */
function renderHome(){
  const list = [...state.drawers].sort((a, b) => b.created.localeCompare(a.created));
  app.innerHTML = `
    <section class="home-hero">
      <span class="kick">MY DRAWERS</span>
      <h1 class="page-title">내 서랍장</h1>
      <p class="page-lead">기억 하나가 서랍 하나가 됩니다. 인생은 여러 개의 서랍으로 나누어, 한 장면씩 천천히 담아 주세요.</p>
      <button class="btn primary" data-act="new">＋ 새 서랍 열기</button>
    </section>
    <div class="cabinet-grid">
      <button class="drawer-card new" data-act="new"><div><span style="font-size:30px">＋</span><b>새 서랍 열기</b>기억 하나를 담아요</div></button>
      ${list.map(d => `
        <div class="drawer-card" data-open="${d.id}" role="button" tabindex="0">
          <h3>${esc(d.title || d.topic || '이름 없는 서랍')}</h3>
          <p>${esc(d.oneLine || (d.opening ? snip(d.opening, 40) : '아직 비어 있어요'))}</p>
          <div class="meta"><span>${d.created.slice(0, 10).replace(/-/g, '.')} · ${STEPS[d.step][0]} ${d.passed ? '<span class="pass-badge">완성</span>' : ''}</span>
          <button class="del" data-del="${d.id}" aria-label="서랍 삭제">삭제</button></div>
        </div>`).join('')}
    </div>
    <div class="callout" style="margin-top:28px"><span>🔒</span><div>작성하신 기억과 사진, 녹음은 이 기기의 브라우저 안에만 저장됩니다. 다른 기기로 옮기거나 보관하려면 각 서랍의 ‘완성’ 단계에서 백업 파일을 내려받아 주세요.
      <div class="row" style="margin-top:10px"><label class="btn sm">백업 파일 불러오기<input type="file" accept="application/json" id="importJson" hidden></label></div></div></div>`;
}

/* ---------- 1. 기억 고르기 ---------- */
function stepPick(d, el){
  el.innerHTML = `
    <h1 class="page-title">어떤 기억을 서랍에 담을까요?</h1>
    <p class="page-lead">처음부터 “인생을 이야기해 주세요”라고 묻지 않습니다. 사건보다 장면에서 시작해요. 마음이 가는 질문 하나를 골라 주세요.</p>
    <div class="open-qs">${OPENING_QS.map(q => `<button class="open-q ${d.opening === q ? 'on' : ''}" data-open-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="callout"><span>💡</span><div><b>한 서랍에는 한 기억만 담습니다.</b> “나의 70년 인생”보다 “아버지의 자전거”처럼 작고 구체적인 기억이 좋은 1분이 됩니다.</div></div>
    <h3 class="serif" style="margin:0 0 10px">담고 싶은 기억이 이미 있다면</h3>
    <div class="chips">${TOPICS.map(t => `<button class="chip ${d.topic === t ? 'on' : ''}" data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <label class="fld" style="margin-top:20px">직접 적기 — 떠오르는 기억을 짧게
      <input type="text" id="customOpen" placeholder="예: 할머니가 끓여 주시던 수제비" value="${esc(d.customText || '')}"></label>
    ${d.qi >= 0 ? '<p class="note">인터뷰를 이미 시작했습니다. 시작 질문을 바꿔도 지금까지 답한 내용은 그대로 남습니다.</p>' : ''}
    ${stepNav(null, d.qi >= 0 ? '인터뷰로 돌아가기' : '이 기억으로 인터뷰 시작', !d.opening)}`;
}

/* ---------- 2. 인터뷰 ---------- */
function curQ(d){ return d.qi >= 0 && d.qi < QUESTIONS.length ? QUESTIONS[d.qi] : null; }
function askNext(d){
  d.qi++;
  while (d.qi < QUESTIONS.length && QUESTIONS[d.qi].cond && !QUESTIONS[d.qi].cond(d)) d.qi++;
  if (d.qi < QUESTIONS.length) d.chat.push({ r:'ai', t: QUESTIONS[d.qi].q(d) });
  else if (!d.interviewDone) {
    d.interviewDone = true;
    d.chat.push({ r:'ai', t:'고맙습니다. 여기까지 들려주신 말만으로 1분 대본을 엮겠습니다.\n오른쪽 ‘핵심 기억 정리’를 확인하시고, 사진이 있다면 다음 단계에서 꺼내 주세요.' });
  }
}
function ack(d, k, kind, text){
  if (kind === 'unknown') return k === 'exclude' ? '네, 알겠습니다.' : '괜찮습니다. 기억나는 부분만 남기겠습니다.';
  if (kind === 'excluded') return '알겠습니다. 이 부분은 남기지 않겠습니다.';
  if (k === 'when' && d.whenCert === 'est') return '확실하지 않은 부분은 단정하지 않고 ‘추정’으로 표시해 두겠습니다.';
  if (k === 'words') return d.wordsMode === 'exact' ? '그 말은 들려주신 그대로 인용하겠습니다.' : '정확한 말이 아니니 대사처럼 꾸미지 않고, 그런 이야기였던 것 같다고만 남기겠습니다.';
  if (k === 'exclude') return '알겠습니다. 그 부분은 대본에 넣지 않겠습니다.';
  const s = snip(text);
  if (k === 'who') return `${s}. 이 이야기에 그분이 계시는군요.`;
  if (k === 'sense') return `“${s}” — 그 감각, 그대로 적어 두었습니다.`;
  const pool = [`“${s}” — 말씀하신 표현 그대로 적어 두었습니다.`, `“${s}”, 그대로 남겨 두겠습니다.`, `적어 두었습니다. “${s}”`];
  return pool[d.chat.length % 3];
}
function answer(d, text, kind){
  const q = curQ(d); if (!q) return;
  text = (text || '').trim();
  if (kind === 'answered' && !text) return toast('기억나는 만큼만 적어 주셔도 괜찮아요.');
  if (q.type === 'words' && kind === 'answered' && !['exact','rough'].includes(d.wordsMode)) return toast('정확히 기억나는지, 대략적인 내용인지 먼저 골라 주세요.');
  if (q.k === 'exclude' && kind === 'answered' && /^(없|아니)/.test(text)) kind = 'unknown';
  d.answers[q.k] = kind === 'answered' ? text : '';
  d.status[q.k] = kind;
  if (q.k === 'when') d.whenCert = kind === 'answered' && HEDGE.test(text) ? 'est' : 'mem';
  if (q.k === 'words' && kind !== 'answered') d.wordsMode = 'none';
  const shown = kind === 'answered' ? text : kind === 'excluded' ? '이 부분은 남기지 않을래요' : (q.skip || '기억이 안 나요');
  d.chat.push({ r:'me', t: shown, dim: kind !== 'answered' });
  d.chat.push({ r:'ai', t: ack(d, q.k, kind, text), ack:true });
  askNext(d); save();
  renderInterview(d);
}
function stepInterview(d, el){
  if (d.qi < 0) {
    d.chat.push({ r:'ai', t:'안녕하세요, 마음서랍입니다.\n질문은 한 번에 하나씩 드릴게요. 기억나지 않는 건 “기억이 안 나요”를 눌러 주시면 됩니다. 남기고 싶지 않은 부분도 이유는 묻지 않아요.' });
    askNext(d); save();
  }
  el.innerHTML = `
    <h1 class="page-title">기억 인터뷰</h1>
    <p class="page-lead">평소 말씀하시듯 편하게 답해 주세요. 맞춤법보다 말투가 중요합니다. 🎙️ 버튼을 누르면 말로 답할 수도 있어요.</p>
    <div class="interview">
      <div class="chat"><div class="chat-log" id="log"></div><div class="chat-in" id="chatIn"></div></div>
      <aside class="panel summary" id="summary"></aside>
    </div>
    ${stepNav('기억 고르기', '사진 확인으로', false)}`;
  renderInterview(d);
}
function renderInterview(d){
  const log = $('log'); if (!log) return;
  log.innerHTML = d.chat.map(m => m.r === 'ai'
    ? `<div class="msg ai">${m.ack ? '' : '<span class="who">BLACK · 기억 편집자</span>'}${esc(m.t)}</div>`
    : `<div class="msg me ${m.dim ? 'dim' : ''}">${esc(m.t)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  const q = curQ(d), box = $('chatIn');
  if (!q) {
    box.innerHTML = `<div class="row"><span class="muted" style="font-size:14px">인터뷰가 끝났습니다. 답을 고치려면 오른쪽 정리에서 ‘고치기’를 누르세요.</span><span class="spacer"></span><button class="btn primary sm" data-act="next">사진 확인으로 →</button></div>`;
  } else {
    box.innerHTML = `
      ${q.type === 'words' ? `<div class="opt-row">
        <button class="chip ${d.wordsMode === 'exact' ? 'on' : ''}" data-words="exact">정확히 기억나요</button>
        <button class="chip ${d.wordsMode === 'rough' ? 'on' : ''}" data-words="rough">대략적인 내용만요</button></div>` : ''}
      <textarea id="ansIn" placeholder="${q.type === 'words' && d.wordsMode === 'exact' ? '기억나는 그대로 적어 주세요' : '여기에 적거나, 🎙️을 눌러 말씀해 주세요 (Enter로 보내기)'}"></textarea>
      <div class="row">
        <button class="btn sm mic" id="micBtn" title="말로 답하기">🎙️ 말로 답하기</button>
        <button class="btn sm ghost" data-ans="unknown">${q.skip || '기억이 안 나요'}</button>
        <button class="btn sm ghost" data-ans="excluded">이 부분은 남기지 않을래요</button>
        <span class="spacer"></span>
        <button class="btn sm primary" data-ans="answered">보내기</button>
      </div>`;
    const ta = $('ansIn');
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); stopListening(); answer(d, ta.value, 'answered'); } });
    setTimeout(() => ta.focus({ preventScroll:true }), 30);
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) $('micBtn').hidden = true;
  }
  renderSummary(d);
}
function renderSummary(d){
  const box = $('summary'); if (!box) return;
  const A = d.answers;
  const row = (k, label, extra = '') => {
    const st = d.status[k];
    const v = st === 'answered' ? `<span>${esc(A[k])}</span>` : st === 'unknown' ? `<span class="none">${k === 'exclude' || k === 'now' ? '없음' : '기억나지 않음 — 비워 둡니다'}</span>` : st === 'excluded' ? '<span class="none">남기지 않기로 함</span>' : '<span class="none">아직 묻지 않음</span>';
    return `<li data-k="${k}"><b>${label} ${extra}${st ? `<button class="edit" data-edit="${k}">고치기</button>` : ''}</b>${v}</li>`;
  };
  const uncertain = [];
  if (d.whenCert === 'est') uncertain.push('시기 (추정)');
  if (d.wordsMode === 'rough') uncertain.push('기억나는 말 (대략)');
  QUESTIONS.forEach(q => { if (d.status[q.k] === 'unknown' && q.k !== 'exclude' && q.k !== 'now') uncertain.push(q.label); });
  box.innerHTML = `
    <h3>핵심 기억 정리</h3>
    <p class="note">들려주신 말만 그대로 모읍니다. 빈칸은 AI가 채우지 않습니다.</p>
    <ul class="sum-list">
      <li><b>주인공</b><span>나</span></li>
      ${row('who','함께 있던 사람')}
      ${row('doing','그 사람의 행동')}
      ${row('place','장소')}
      ${row('when','시기', d.status.when === 'answered' ? `<span class="tag ${d.whenCert === 'est' ? 'est' : 'mem'}">${d.whenCert === 'est' ? '추정' : '기억'}</span>` : '')}
      ${row('memory','사건')}
      ${row('scene','가장 기억나는 장면')}
      ${row('words','기억나는 말', d.status.words === 'answered' ? `<span class="tag ${d.wordsMode === 'exact' ? 'mem' : 'est'}">${d.wordsMode === 'exact' ? '정확' : '대략'}</span>` : '')}
      ${row('sense','기억나는 감각')}
      ${row('now','지금 하는 말')}
      ${row('ending','마지막 장면')}
      ${row('exclude','빼고 싶은 부분')}
      <li><b>불확실한 정보</b><span class="${uncertain.length ? '' : 'none'}">${uncertain.length ? esc(uncertain.join(', ')) : '없음'}</span></li>
    </ul>`;
}

/* ---------- 3. 사진 ---------- */
function stepPhotos(d, el){
  el.innerHTML = `
    <h1 class="page-title">남아 있는 사진이 있나요?</h1>
    <p class="page-lead">실제 사진이 있으면 실제 사진을 먼저 씁니다. 사진만 보고 관계나 상황을 짐작하지 않으니, <b>아는 만큼만</b> 적어 주세요. 모르는 칸은 비워 두셔도 됩니다.</p>
    <label class="drop" id="drop"><b>📷 사진을 끌어다 놓거나 눌러서 고르세요</b><span class="muted">여러 장 가능 · 사진이 없어도 괜찮습니다 — 없는 장면은 ‘재현’으로 설계합니다</span>
      <input type="file" id="photoIn" accept="image/*" multiple hidden></label>
    <div class="photo-grid">${d.photos.map(p => `
      <div class="photo-card" data-pid="${p.id}">
        <img src="${p.data}" alt="">
        <div class="f">
          <label class="fld">사진 속 인물<input type="text" data-pf="who" value="${esc(p.who)}" placeholder="예: 우리 아버지, 나"></label>
          <div class="two">
            <label class="fld">장소<input type="text" data-pf="where" value="${esc(p.where)}" placeholder="모르면 비워 두세요"></label>
            <label class="fld">대략적인 시기<input type="text" data-pf="when" value="${esc(p.when)}" placeholder="예: 70년대쯤"></label>
          </div>
          <label class="fld">찍은 사람<input type="text" data-pf="by" value="${esc(p.by)}"></label>
          <label class="fld">이 사진과 연결된 기억 · 전후에 있었던 일<textarea data-pf="memory" rows="2">${esc(p.memory)}</textarea></label>
          <div class="row"><span class="spacer"></span><button class="btn sm ghost" data-delphoto="${p.id}">사진 빼기</button></div>
        </div>
      </div>`).join('')}</div>
    ${d.segments && d.photos.some(p => !d.segments.some(s => s.material === p.id)) ? '<p class="note">새로 올린 사진은 ‘대본·녹음’ 단계의 각 구간 ‘화면’에서 고를 수 있습니다.</p>' : ''}
    ${stepNav('기억 인터뷰', d.segments ? '대본으로' : '들려주신 말로 대본 엮기', false)}`;
  const drop = $('drop');
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addPhotos(d, e.dataTransfer.files));
  $('photoIn').addEventListener('change', e => addPhotos(d, e.target.files));
}
async function addPhotos(d, files){
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const data = await shrink(f, 1400); if (!data) continue;
    d.photos.push({ id:'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), data, who:'', where:'', when:'', by:'', memory:'' });
  }
  save(); render();
}
function shrink(file, max){
  return new Promise(res => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(''); };
    img.src = url;
  });
}

/* ---------- 4. 대본·녹음 ---------- */
function stepScript(d, el){
  if (!d.segments) buildSegments(d);
  const A = d.answers;
  const photoOpts = sel => `<option value="rep" ${sel === 'rep' ? 'selected' : ''}>AI 재현 장면</option>` +
    d.photos.map((p, i) => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>실제 사진 ${i + 1}${p.who ? ' · ' + esc(snip(p.who, 10)) : ''}</option>`).join('');
  el.innerHTML = `
    <h1 class="page-title">1분 대본과 내 목소리</h1>
    <p class="page-lead">들려주신 말을 그대로 옮겨 다섯 구간에 놓았습니다. 소리 내어 읽으며 자연스럽게 다듬어 주세요. <b>새로운 사실이나 감정은 넣지 않습니다.</b></p>
    <div class="meta-fields">
      <label class="fld">① 제목 — 짧고 구체적으로<input type="text" id="inTitle" value="${esc(d.title)}" placeholder="예: 아버지의 자전거"></label>
      <label class="fld">② 기억 한 줄<input type="text" id="inOne" value="${esc(d.oneLine)}" placeholder="이 영상이 어떤 기억인지 한 문장으로"></label>
    </div>
    <div class="total" id="totalBox"></div>
    ${ok(d,'exclude') ? `<div class="callout"><span>✂️</span><div><b>빼 달라고 하신 부분</b> — “${esc(A.exclude)}”<br>대본에 남아 있지 않은지 확인해 주세요.</div></div>` : ''}
    <div class="script">
      <div>${d.segments.map((s, i) => `
        <section class="seg ${s.text.trim() ? '' : 'off'}" style="--sc:${SEGS[i].color}" data-seg="${i}">
          <div class="seg-h"><span class="t">${SEGS[i].t}</span><h4>${SEGS[i].name}</h4><span class="why">${SEGS[i].why}</span>
            <span class="spacer"></span>
            ${s.material === 'rep' ? '<span class="tag rep">재현</span>' : '<span class="tag mem">실제 사진</span>'}
            <button class="tag ${s.cert}" data-cert="${i}" style="border:0;cursor:pointer" title="눌러서 기억/추정 바꾸기">${s.cert === 'est' ? '추정' : '기억'}</button></div>
          <textarea data-text="${i}" placeholder="${i === 3 ? '직접 하신 말이 있을 때만 씁니다. 비워 두면 이 구간은 건너뜁니다.' : '이 구간은 비어 있습니다. 들려주신 말 중에서 옮겨 주세요.'}">${esc(s.text)}</textarea>
          <div class="bot">
            <span class="dur" data-dur="${i}"></span>
            <label class="muted">화면 <select data-mat="${i}">${photoOpts(s.material)}</select></label>
            <span class="spacer"></span>
            ${s.audio ? `<audio controls src="${s.audio}"></audio><button class="btn sm ghost" data-delrec="${i}">녹음 지우기</button>` : ''}
            <button class="btn sm rec ${recIdx === i ? 'on' : ''}" data-rec="${i}">${recIdx === i ? '■ 녹음 멈추기' : (s.audio ? '🎙️ 다시 녹음' : '🎙️ 내 목소리로 녹음')}</button>
          </div>
          ${s.material === 'rep' && s.text.trim() ? `
          <details class="rep-box"><summary>⑤ AI 장면 재현 설명 — 들려주신 정보만 확정합니다</summary>
            <div class="rep-grid">
              ${[['era','시대'],['place','장소'],['people','등장인물'],['action','행동'],['grounded','기억에 근거한 요소'],['unknown','기억에 없는 요소'],['mood','분위기'],['camera','카메라 거리'],['ref','실제 사진 참고 여부']]
                .map(([k, l]) => `<label class="fld">${l}<input type="text" data-rep="${i}" data-rk="${k}" value="${esc(s.rep[k])}"></label>`).join('')}
            </div>
            <div class="prompt-box" id="prompt${i}">${esc(repPrompt(s.rep))}</div>
            <div class="row" style="margin-top:8px"><button class="btn sm" data-copy="${i}">재현 프롬프트 복사</button></div>
          </details>` : ''}
        </section>`).join('')}
        <div class="row"><button class="btn sm ghost" data-act="rebuild">↺ 들려주신 말로 다시 엮기</button><span class="note" style="margin:0">직접 고친 문장과 녹음은 사라집니다.</span></div>
      </div>
      <aside class="panel src">
        <h3>원래 하신 말</h3>
        <p class="note">대본은 이 말들 안에서만 씁니다.</p>
        <dl>${QUESTIONS.filter(q => ok(d, q.k) && q.k !== 'exclude').map(q => `<dt>${q.label}</dt><dd>${esc(A[q.k])}</dd>`).join('') || '<dd class="muted">인터뷰 답이 없습니다.</dd>'}</dl>
      </aside>
    </div>
    ${stepNav('사진 확인', '검증 받기', false)}`;
  updateDurations(d);
}
function updateDurations(d){
  let total = 0;
  d.segments.forEach((s, i) => {
    const t = s.audio ? s.audioDur : secs(s.text); total += s.text.trim() ? t : 0;
    const el = document.querySelector(`[data-dur="${i}"]`); if (!el) return;
    if (!s.text.trim()) { el.textContent = '건너뜀'; el.className = 'dur'; return; }
    const over = t > SEGS[i].sec * 1.5;
    el.textContent = `${s.audio ? '녹음 ' : '약 '}${Math.round(t)}초 / ${SEGS[i].sec}초`;
    el.className = 'dur ' + (over ? 'over' : 'ok');
  });
  const box = $('totalBox'); if (!box) return;
  const over = total > 66;
  box.innerHTML = `<b class="serif">전체 약 ${Math.round(total)}초</b><div class="meter"><i class="${over ? 'over' : ''}" style="width:${Math.min(100, total / 60 * 100)}%"></i></div><span class="note" style="margin:0">${over ? '1분을 넘습니다. 설명을 조금 덜어 주세요.' : total < 30 ? '조금 짧아요. 중요한 장면에 시간을 더 주어도 좋아요.' : '1분 안에 잘 들어옵니다.'}</span>`;
}

/* 녹음 */
let rec = null, recIdx = -1, recStart = 0;
async function toggleRec(d, i){
  if (rec) { rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast('이 브라우저에서는 녹음을 지원하지 않습니다.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const chunks = [];
    rec = new MediaRecorder(stream); recIdx = i; recStart = Date.now();
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const seg = d.segments[recIdx];
      seg.audio = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      seg.audioDur = (Date.now() - recStart) / 1000;
      rec = null; recIdx = -1; save(); render(); toast('내 목소리가 저장되었습니다.');
    };
    rec.start(); render();
  } catch(e) { rec = null; recIdx = -1; toast('마이크를 사용할 수 없습니다. 브라우저의 마이크 권한을 확인해 주세요.'); }
}

/* ---------- 5. 검증 ---------- */
function stepReview(d, el){
  if (!d.segments) buildSegments(d);
  const r = review(d);
  d.passed = r.pass; save();
  const card = (X, key, name, role, color, score) => `
    <article class="rv" style="--rc:${color}">
      <div class="rv-h"><span class="rn">${key}</span><span class="sc ${score < 9.7 ? 'fail' : ''}">${score.toFixed(1)}<small> / 10</small></span></div>
      <h4>${name} <span class="muted" style="font-size:13px;font-family:var(--sans)">${role}</span></h4>
      <ul>${X.items.length ? X.items.map(it => `<li class="${it.fatal ? 'fatal' : ''}">${it.fatal ? '⛔ ' : it.info ? 'ℹ️ ' : ''}${esc(it.msg)}${it.quote ? `<q>“${esc(it.quote)}”</q>` : ''}${it.seg >= 0 ? ` <a data-goto="${it.seg}">${SEGS[it.seg].t} 고치기</a>` : ''}</li>`).join('') : ''}
        ${X.items.every(it => it.info) ? `<li class="good">✓ ${key === 'RED' ? '기억과 결과물이 같습니다.' : key === 'SILVER' ? '1분 안에 하나의 기억이 자연스럽게 전해집니다.' : '실제 사람이 자기 이야기를 하는 것처럼 들립니다.'}</li>` : ''}</ul>
    </article>`;
  const why = [];
  if (r.fatal) why.push('기억과 다른 내용(⛔)이 있습니다');
  if (!r.fatal && !r.scoresOk) why.push('9.7점에 못 미친 편집자가 있습니다');
  if (!r.goldOk) why.push(d.gold === 'stop' ? 'GOLD가 “여기까지 본다”를 골랐습니다' : 'GOLD의 반응이 아직 없습니다');
  el.innerHTML = `
    <h1 class="page-title">다섯 편집자의 검증</h1>
    <p class="page-lead">RED·SILVER·BLUE는 대본을 들려주신 기억과 한 줄씩 대조하는 자동 점검입니다. GOLD는 사람이 합니다 — 가족이나 본인이 처음 보는 마음으로 골라 주세요.</p>
    <div class="verdict ${r.pass ? 'pass' : 'fail'}"><span class="big">${r.pass ? '🗝️' : '✍️'}</span>
      <div><b>${r.pass ? '합격 — 서랍에 담을 준비가 되었습니다' : '조금 더 다듬어 볼까요'}</b>${r.pass ? `RED·SILVER·BLUE 모두 9.7점 이상, GOLD는 “${GOLD[d.gold]}”를 골랐습니다.` : esc(why.join(' · ')) + '. 합격 기준: RED·SILVER·BLUE 모두 9.7점 이상, 절대 조건 위반 없음, GOLD “다시 보고 싶다” 또는 “가족에게 보여주고 싶다”.'}</div></div>
    <div class="review">
      ${card(r.R, 'RED', '기억 검증자', '기억과 결과물이 같은가', 'var(--c-red)', r.red)}
      ${card(r.S, 'SILVER', '구성 편집자', '1분 안에 하나의 기억', 'var(--c-silver)', r.silver)}
      ${card(r.B, 'BLUE', '감정 편집자', '그 사람의 목소리인가', 'var(--c-blue)', r.blue)}
    </div>
    <article class="rv gold" style="--rc:var(--c-gold)">
      <div class="rv-h"><span class="rn">GOLD</span><span class="sc">${d.gold === 'stop' ? '✋' : d.gold ? '♡' : '—'}</span></div>
      <h4>가족의 눈 <span class="muted" style="font-size:13px;font-family:var(--sans)">분석하지 않고, 느낌으로만</span></h4>
      <p class="note" style="margin-top:0">먼저 1분 미리보기를 처음 보는 마음으로 끝까지 보세요. 그리고 가장 가까운 반응 하나를 고르세요.</p>
      <div class="row" style="margin-top:10px"><button class="btn primary sm" data-act="play">▶ 1분 미리보기</button></div>
      <div class="gold-opts">${Object.entries(GOLD).map(([k, v]) => `<button class="chip ${d.gold === k ? 'on' : ''}" data-gold="${k}">${v}</button>`).join('')}</div>
      <label class="fld" style="margin-top:14px">느낌 한마디 (선택)<input type="text" id="goldNote" value="${esc(d.goldNote)}" placeholder="예: 이 사진 나오니까 확 와닿는다 / 여기는 조금 만든 이야기 같다"></label>
    </article>
    ${stepNav('대본 고치기', r.pass ? '완성본 보기' : '그래도 완성본 보기', false)}`;
}

/* ---------- 6. 완성 ---------- */
function stepDone(d, el){
  if (!d.segments) buildSegments(d);
  const r = review(d);
  const segs = d.segments.map((s, i) => ({ ...s, i })).filter(s => s.text.trim());
  const pidx = id => d.photos.findIndex(p => p.id === id) + 1;
  el.innerHTML = `
    ${r.pass ? '' : `<div class="callout no-print"><span>✍️</span><div>아직 검증을 통과하지 않았습니다. 가족에게 건네기 전에 <a href="#" data-goto-step="4">검증</a>을 다시 확인해 주세요.</div></div>`}
    <div class="row no-print" style="margin-bottom:16px">
      <button class="btn primary" data-act="play">▶ 1분 미리보기</button>
      <button class="btn" data-act="md">제작 의뢰서 내려받기</button>
      <button class="btn" data-act="json">백업 파일 내려받기</button>
      <button class="btn ghost" data-act="print">인쇄</button>
    </div>
    <article class="doc" id="doc">
      <p class="eyebrow">마음서랍 · 1분 자서전 ${r.pass ? '· <span style="color:var(--sage)">검증 통과</span>' : ''}</p>
      <h2>① ${esc(d.title || '제목 없음')}</h2>
      <p class="one">② ${esc(d.oneLine || '')}</p>

      <h3>③ 1분 내레이션</h3>
      <div class="narr">${esc(segs.map(s => s.text).join('\n\n'))}</div>

      <h3>④ 장면 구성표</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>시간</th><th>화면</th><th>내레이션</th><th>자료</th></tr></thead>
        <tbody>${segs.map(s => `<tr><td>${SEGS[s.i].t}</td><td>${SEGS[s.i].name}</td><td class="n">${esc(s.text)}</td>
          <td>${s.material === 'rep' ? '<span class="tag rep">AI 재현</span>' : `실제 사진 ${pidx(s.material)}`} ${s.cert === 'est' ? '<span class="tag est">추정</span>' : ''}${s.audio ? '<br><small class="muted">본인 목소리 녹음</small>' : ''}</td></tr>`).join('')}</tbody>
      </table></div>

      <h3>⑤ AI 장면 재현 설명</h3>
      ${segs.filter(s => s.material === 'rep').map(s => `<div class="repd"><b>${SEGS[s.i].t} · ${SEGS[s.i].name}</b><br>
        시대: ${esc(s.rep.era)} · 장소: ${esc(s.rep.place)} · 등장인물: ${esc(s.rep.people)}<br>
        행동: ${esc(s.rep.action)}<br>기억에 근거한 요소: ${esc(s.rep.grounded)}<br>기억에 없는 요소: ${esc(s.rep.unknown)}<br>
        분위기: ${esc(s.rep.mood)} · 카메라 거리: ${esc(s.rep.camera)} · 실제 사진 참고: ${esc(s.rep.ref)}</div>`).join('') || '<p class="muted">재현이 필요한 장면이 없습니다. 모든 장면에 실제 사진을 씁니다.</p>'}

      <h3>⑥ 있으면 좋은 자료</h3>
      <ul>${neededMaterials(d).map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <p class="note">자료가 없어도 이야기는 멈추지 않습니다.</p>

      <h3>검증</h3>
      <p>RED ${r.red.toFixed(1)} · SILVER ${r.silver.toFixed(1)} · BLUE ${r.blue.toFixed(1)} · GOLD ${d.gold ? `“${GOLD[d.gold]}”` : '—'}${d.goldNote ? ` — ${esc(d.goldNote)}` : ''}</p>
    </article>
    ${stepNav('검증', null)}`;
}

function buildMarkdown(d){
  const r = review(d);
  const segs = d.segments.map((s, i) => ({ ...s, i })).filter(s => s.text.trim());
  const pidx = id => d.photos.findIndex(p => p.id === id) + 1;
  const cell = t => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return `# 마음서랍 1분 자서전 제작 의뢰서

## ① 제목
${d.title || '(제목 없음)'}

## ② 기억 한 줄
${d.oneLine || ''}

## ③ 1분 내레이션
${segs.map(s => s.text).join('\n\n')}

## ④ 장면 구성표
| 시간 | 화면 | 내레이션 | 자료 |
|---|---|---|---|
${segs.map(s => `| ${SEGS[s.i].t} | ${SEGS[s.i].name} | ${cell(s.text)} | ${s.material === 'rep' ? 'AI 재현' : '실제 사진 ' + pidx(s.material)}${s.cert === 'est' ? ' [추정]' : ''}${s.audio ? ' · 본인 녹음' : ''} |`).join('\n')}

## ⑤ AI 장면 재현 설명
${segs.filter(s => s.material === 'rep').map(s => `### ${SEGS[s.i].t} · ${SEGS[s.i].name}\n${repPrompt(s.rep)}`).join('\n\n') || '재현이 필요한 장면 없음'}

## ⑥ 필요한 자료
${neededMaterials(d).map(m => '- ' + m).join('\n')}

## 핵심 기억 정리 (사용자 원문)
${QUESTIONS.map(q => `- ${q.label}: ${d.status[q.k] === 'answered' ? d.answers[q.k] : d.status[q.k] === 'unknown' ? '(기억나지 않음)' : d.status[q.k] === 'excluded' ? '(남기지 않기로 함)' : '-'}`).join('\n')}
- 시기 확실성: ${d.whenCert === 'est' ? '[추정]' : '[기억]'}
- 기억나는 말: ${d.wordsMode === 'exact' ? '정확히 기억' : d.wordsMode === 'rough' ? '대략적인 내용' : '기억나지 않음'}

## 검증
- RED ${r.red.toFixed(1)} / SILVER ${r.silver.toFixed(1)} / BLUE ${r.blue.toFixed(1)}
- GOLD: ${d.gold ? GOLD[d.gold] : '-'}${d.goldNote ? ' — ' + d.goldNote : ''}
- 결과: ${r.pass ? '합격' : '수정 필요'}
${[...r.R.items, ...r.S.items, ...r.B.items].map(it => `- ${it.fatal ? '[절대 조건] ' : ''}${it.msg}`).join('\n')}
`;
}
function download(name, text, type){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileName = d => (d.title || '마음서랍').replace(/[\\/:*?"<>|]/g, '').trim() || '마음서랍';

/* =========================================================
   음성 입력 (말로 답하기)
   ========================================================= */
let recog = null;
function stopListening(){
  if (recog) { try { recog.stop(); } catch(e){} recog = null; }
  const btn = $('micBtn'); if (btn) { btn.classList.remove('on'); btn.textContent = '🎙️ 말로 답하기'; }
}
function toggleListen(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('micBtn'), ta = $('ansIn');
  if (!SR || !ta) return;
  if (recog) return stopListening();
  recog = new SR(); recog.lang = 'ko-KR'; recog.interimResults = true; recog.continuous = true;
  const base = ta.value ? ta.value.trim() + ' ' : '';
  recog.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; ta.value = base + t; };
  recog.onend = () => { recog = null; const b = $('micBtn'); if (b) { b.classList.remove('on'); b.textContent = '🎙️ 말로 답하기'; } };
  recog.onerror = () => toast('음성을 알아듣지 못했어요. 다시 시도하거나 글로 적어 주세요.');
  recog.start(); btn.classList.add('on'); btn.textContent = '■ 그만 듣기';
}

/* =========================================================
   1분 미리보기 플레이어
   ========================================================= */
const P = { items:[], idx:0, token:0, playing:false, audio:null, tick:null, base:0, t0:0 };
function plBuild(d){
  const items = [{ kind:'title', dur:3.5 }];
  d.segments.forEach((s, i) => { if (s.text.trim()) items.push({ kind:'seg', i, dur: s.audio ? (s.audioDur || secs(s.text)) : Math.max(3, secs(s.text)) }); });
  return items;
}
function openPlayer(){
  const d = cur(); if (!d || !d.segments) return;
  plStop();
  P.items = plBuild(d); P.idx = 0;
  $('plSegs').innerHTML = P.items.map(it => `<i style="flex:${it.dur}"><b></b></i>`).join('');
  $('player').hidden = false; $('plTime').textContent = '0:00';
  plVisual(d, P.items[0]); plSub(''); plUi(false);
}
function closePlayer(){ plStop(); $('player').hidden = true; }
function plStop(){
  P.token++; P.playing = false;
  if (P.audio) { P.audio.pause(); P.audio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  clearInterval(P.tick);
}
function plUi(playing){
  $('plPlay').textContent = playing ? '❚❚ 일시정지' : '▶ 재생';
  $('plBig').hidden = playing;
}
function plSub(t){ $('plSub').innerHTML = t ? `<span>${esc(t)}</span>` : ''; }
function plVisual(d, it){
  const bg = $('plBg'), tag = $('plTag'), tc = $('plTitle');
  if (it.kind === 'title') {
    const firstPhoto = d.photos[0];
    tc.innerHTML = `<div><b>${esc(d.title || '마음서랍')}</b><span>${esc(d.oneLine || '')}</span></div>`; tc.classList.add('show');
    tag.className = 'tag pl-tag'; tag.textContent = '';
    bg.innerHTML = '';
    if (firstPhoto) { bg.className = 'pl-bg'; bg.style.backgroundImage = `url(${firstPhoto.data})`; }
    else { bg.className = 'pl-bg rep'; bg.style.backgroundImage = ''; }
    return;
  }
  tc.classList.remove('show');
  const s = d.segments[it.i];
  const photo = d.photos.find(p => p.id === s.material);
  if (photo) {
    bg.className = 'pl-bg'; bg.innerHTML = ''; bg.style.backgroundImage = `url(${photo.data})`;
    void bg.offsetWidth; bg.classList.add('kb');
  } else {
    bg.className = 'pl-bg rep'; bg.style.backgroundImage = '';
    const r = s.rep;
    const bits = [r.place, r.people, r.action].filter(x => x && x !== '말씀하지 않음').map(x => esc(snip(x, 34)));
    bg.innerHTML = `<div class="rep-card"><small>AI 재현 예정 장면 · 실제 기록 아님</small>${bits.join('<br>') || esc(SEGS[it.i].name)}</div>`;
  }
  const tags = [photo ? ['mem','실제 사진'] : ['rep','재현']];
  if (s.cert === 'est') tags.push(['est','추정']);
  tag.className = 'tag pl-tag ' + tags[0][0]; tag.textContent = tags.map(t => t[1]).join(' · ');
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function speak(t, rate = 0.95){
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; u.rate = rate;
    const v = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
    const pick = v.find(x => /natural|online|google/i.test(x.name)) || v[0]; if (pick) u.voice = pick;
    const guard = setTimeout(res, secs(t) * 1000 / rate + 4000);
    u.onend = u.onerror = () => { clearTimeout(guard); res(); };
    speechSynthesis.speak(u);
  });
}
function plBar(){
  const bars = $('plSegs').children;
  P.items.forEach((it, k) => { const b = bars[k].firstElementChild; b.style.transition = 'none'; b.style.width = k < P.idx ? '100%' : '0%'; });
  const b = bars[P.idx] && bars[P.idx].firstElementChild;
  if (b) { void b.offsetWidth; b.style.transition = `width ${P.items[P.idx].dur}s linear`; b.style.width = '100%'; }
}
async function plRun(){
  const d = cur(); if (!d) return;
  const my = ++P.token; P.playing = true; plUi(true);
  P.base = P.items.slice(0, P.idx).reduce((a, it) => a + it.dur, 0);
  for (; P.idx < P.items.length; P.idx++) {
    if (my !== P.token) return;
    const it = P.items[P.idx];
    P.t0 = Date.now(); plBar(); plVisual(d, it);
    clearInterval(P.tick);
    P.tick = setInterval(() => { $('plTime').textContent = fmt(P.base + (Date.now() - P.t0) / 1000); }, 250);
    if (it.kind === 'title') { plSub(''); await wait(it.dur * 1000); }
    else await plSeg(d.segments[it.i], my, it.dur);
    if (my !== P.token) return;
    P.base += it.dur;
  }
  clearInterval(P.tick); P.playing = false; plUi(false); P.idx = 0;
  plSub('— 마음서랍 —');
}
async function plSeg(s, my, dur){
  const ss = sentences(s.text);
  const chars = ss.reduce((a, t) => a + t.length, 0) || 1;
  if (s.audio) {
    const a = new Audio(s.audio); P.audio = a;
    const ended = new Promise(r => { a.onended = r; a.onerror = r; });
    a.play().catch(() => {});
    for (const t of ss) { if (my !== P.token) return; plSub(t); await wait(dur * 1000 * t.length / chars); }
    await Promise.race([ended, wait(1500)]);
  } else if ($('plTts').checked && 'speechSynthesis' in window) {
    for (const t of ss) { if (my !== P.token) return; plSub(t); await speak(t); }
  } else {
    for (const t of ss) { if (my !== P.token) return; plSub(t); await wait(Math.max(1800, secs(t) * 1000)); }
  }
}

/* =========================================================
   이벤트
   ========================================================= */
function go(d, step){ d.step = Math.max(0, Math.min(5, step)); save(); render(); }

app.addEventListener('click', e => {
  const t = e.target.closest('button, a, [data-open]'); if (!t) return;
  const d = cur(), ds = t.dataset;

  if (ds.act === 'new') { const n = newDrawer(); state.drawers.push(n); state.current = n.id; save(); return render(); }
  if (ds.del) { e.stopPropagation(); if (confirm('이 서랍을 지울까요? 담아 둔 기억과 사진, 녹음이 모두 사라지고 되돌릴 수 없습니다.')) { state.drawers = state.drawers.filter(x => x.id !== ds.del); save(); render(); } return; }
  if (ds.open) { state.current = ds.open; save(); return render(); }
  if (!d) return;

  if (ds.step !== undefined) return go(d, +ds.step);
  if (ds.act === 'prev') return go(d, d.step - 1);
  if (ds.act === 'next') { if (d.step === 2 && !d.segments) buildSegments(d); return go(d, d.step + 1); }
  if (ds.openQ) { d.opening = ds.openQ; d.topic = ''; d.customText = ''; save(); return render(); }
  if (ds.topic) { d.topic = ds.topic; d.customText = ''; if (!d.title) d.title = ds.topic; d.opening = `“${ds.topic}”을(를) 떠올리면, 가장 먼저 보이는 장면은 무엇인가요?`; save(); return render(); }
  if (ds.words) { d.wordsMode = ds.words; save(); return renderInterview(d); }
  if (ds.ans) { const ta = $('ansIn'); const v = ta ? ta.value : ''; stopListening(); return answer(d, v, ds.ans); }
  if (t.id === 'micBtn') return toggleListen();
  if (ds.edit) {
    const li = t.closest('li'), k = ds.edit;
    li.innerHTML = `<b>${QMAP[k].label}</b><textarea rows="3">${esc(d.answers[k] || '')}</textarea>
      <div class="row" style="margin-top:6px"><button class="btn sm primary" data-save-edit="${k}">저장</button><button class="btn sm ghost" data-unknown-edit="${k}">기억 안 남</button></div>`;
    li.querySelector('textarea').focus(); return;
  }
  if (ds.saveEdit || ds.unknownEdit) {
    const k = ds.saveEdit || ds.unknownEdit, v = ds.saveEdit ? t.closest('li').querySelector('textarea').value.trim() : '';
    d.answers[k] = v; d.status[k] = v ? 'answered' : 'unknown';
    if (k === 'when') d.whenCert = v && HEDGE.test(v) ? 'est' : 'mem';
    save(); renderSummary(d);
    if (d.segments) toast('대본에 반영하려면 ‘대본·녹음’에서 ‘다시 엮기’를 눌러 주세요.');
    return;
  }
  if (ds.delphoto) { d.photos = d.photos.filter(p => p.id !== ds.delphoto); (d.segments || []).forEach(s => { if (s.material === ds.delphoto) s.material = 'rep'; }); save(); return render(); }
  if (ds.cert !== undefined) { const s = d.segments[+ds.cert]; s.cert = s.cert === 'est' ? 'mem' : 'est'; save(); return render(); }
  if (ds.rec !== undefined) return toggleRec(d, +ds.rec);
  if (ds.delrec !== undefined) { const s = d.segments[+ds.delrec]; s.audio = null; s.audioDur = 0; save(); return render(); }
  if (ds.copy !== undefined) { (navigator.clipboard ? navigator.clipboard.writeText(repPrompt(d.segments[+ds.copy].rep)) : Promise.reject()).then(() => toast('재현 프롬프트를 복사했습니다.'), () => toast('복사하지 못했습니다. 직접 선택해 복사해 주세요.')); return; }
  if (ds.act === 'rebuild') { if (confirm('들려주신 말로 대본을 다시 엮을까요? 직접 고친 문장과 녹음이 사라집니다.')) { d.segments = null; buildSegments(d); save(); render(); } return; }
  if (ds.goto !== undefined) { d.step = 3; save(); render(); setTimeout(() => { const s = document.querySelector(`[data-seg="${ds.goto}"]`); if (s) { s.scrollIntoView({ behavior:'smooth', block:'center' }); s.querySelector('textarea').focus({ preventScroll:true }); } }, 60); return; }
  if (ds.gotoStep) { e.preventDefault(); return go(d, +ds.gotoStep); }
  if (ds.gold) { d.gold = ds.gold; save(); return render(); }
  if (ds.act === 'play') return openPlayer();
  if (ds.act === 'md') return download(`${fileName(d)}_제작의뢰서.md`, buildMarkdown(d), 'text/markdown;charset=utf-8');
  if (ds.act === 'json') return download(`${fileName(d)}_마음서랍백업.json`, JSON.stringify({ app:'maeumseorap', v:1, drawer:d }), 'application/json');
  if (ds.act === 'print') return window.print();
});
app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.open) { e.preventDefault(); e.target.click(); } });

app.addEventListener('input', e => {
  const d = cur(); if (!d) return; const t = e.target, ds = t.dataset;
  if (t.id === 'customOpen') {
    const v = t.value.trim(); d.customText = t.value; d.topic = '';
    d.opening = v ? `“${v}” — 그 기억을 떠올리면, 가장 먼저 보이는 장면은 무엇인가요?` : '';
    document.querySelectorAll('.open-q.on, .chip.on').forEach(b => b.classList.remove('on'));
    const nb = document.querySelector('[data-act="next"]'); if (nb) nb.disabled = !d.opening;
    return save();
  }
  if (t.id === 'inTitle') { d.title = t.value; return save(); }
  if (t.id === 'inOne') { d.oneLine = t.value; return save(); }
  if (t.id === 'goldNote') { d.goldNote = t.value; return save(); }
  if (ds.pf) { const p = d.photos.find(x => x.id === t.closest('[data-pid]').dataset.pid); p[ds.pf] = t.value; return save(); }
  if (ds.text !== undefined) {
    const s = d.segments[+ds.text]; s.text = t.value;
    t.closest('.seg').classList.toggle('off', !t.value.trim());
    updateDurations(d); return save();
  }
  if (ds.rep !== undefined) { const s = d.segments[+ds.rep]; s.rep[ds.rk] = t.value; const pb = $('prompt' + ds.rep); if (pb) pb.textContent = repPrompt(s.rep); return save(); }
});
app.addEventListener('change', async e => {
  const d = cur(), t = e.target;
  if (t.id === 'importJson') {
    const f = t.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== 'maeumseorap' || !j.drawer) throw 0;
      const dr = j.drawer; dr.id = 'd' + Date.now().toString(36);
      state.drawers.push(dr); save(); render(); toast('서랍을 불러왔습니다.');
    } catch(_) { toast('마음서랍 백업 파일이 아닙니다.'); }
    return;
  }
  if (d && t.dataset.mat !== undefined) {
    const i = +t.dataset.mat, s = d.segments[i]; s.material = t.value;
    if (t.value === 'rep') s.rep = repFor(d, i);
    save(); render();
  }
});

$('goHome').onclick = () => { closePlayer(); if (rec) rec.stop(); state.current = null; save(); render(); };
$('openPlayer').onclick = openPlayer;
$('plPlay').onclick = () => { if (P.playing) { plStop(); plUi(false); } else plRun(); };
$('plBig').onclick = () => plRun();
$('plRestart').onclick = () => { plStop(); P.idx = 0; plRun(); };
$('plClose').onclick = closePlayer;
$('player').addEventListener('click', e => { if (e.target.id === 'player') closePlayer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('player').hidden) closePlayer(); });
if ('speechSynthesis' in window) speechSynthesis.getVoices();

/* ---------- 시작 ---------- */
(async () => {
  const s = await dbGet('state');
  if (s && Array.isArray(s.drawers)) state = s;
  if (new URLSearchParams(location.search).has('new')) { const n = newDrawer(); state.drawers.push(n); state.current = n.id; save(); history.replaceState(null, '', location.pathname); }
  render();
})();
})();
