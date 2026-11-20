// 스킵피티 — 화면과 게임 진행
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { local } from './store.js';
import {
  COLORS, CELLS, createGame, jumpsFrom, anyJump, movablePositions,
  applyJump, setsOf, totalOf, rankPlayers, coord,
} from './game.js';
import { chooseMove } from './ai.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LEVEL_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };

// ---------- 요소 ----------
const boardEl = $('#board');
const playersEl = $('#players');
const statusEl = $('#status');
const logEl = $('#log');
const hintEl = $('#hintline');
const turnCountEl = $('#turn-count');
const btnEnd = $('#btn-end');
const btnNew = $('#btn-new');
const btnTheme = $('#btn-theme');
const themeMark = $('#theme-mark');
const screenSetup = $('#screen-setup');
const screenGame = $('#screen-game');
const modal = $('#modal');
const modalTitle = $('#modal-title');
const modalBody = $('#modal-body');
const modalFoot = $('#modal-foot');

// ---------- 설정 ----------
const DEFAULT_SETTINGS = { mode: 'local', count: 2, names: ['', '', '', ''], aiCount: 1, level: 'normal', myName: '' };

function readSettings() {
  const saved = local.get('settings', null);
  const out = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  out.names = Array.isArray(out.names) ? out.names.slice(0, 4) : ['', '', '', ''];
  while (out.names.length < 4) out.names.push('');
  if (!['local', 'ai'].includes(out.mode)) out.mode = 'local';
  if (![2, 3, 4].includes(Number(out.count))) out.count = 2;
  if (![1, 2, 3].includes(Number(out.aiCount))) out.aiCount = 1;
  if (!LEVEL_NAME[out.level]) out.level = 'normal';
  out.count = Number(out.count);
  out.aiCount = Number(out.aiCount);
  return out;
}

let settings = readSettings();
const saveSettings = () => local.set('settings', settings);

// ---------- 상태 ----------
let state = null;
let busy = false;
let gameToken = 0;
let cellEls = [];

// ---------- 테마 ----------
function setTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  local.set('theme', t);
  themeMark.textContent = t === 'dark' ? '☀' : '◐';
  btnTheme.setAttribute('aria-label', t === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#101010' : '#f4efe1';
}

function initTheme() {
  const saved = local.get('theme', null);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'));
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', (e) => { if (!local.get('theme', null)) setTheme(e.matches ? 'dark' : 'light'); });
  }
}

// ---------- 보드 만들기 ----------
function buildBoard() {
  boardEl.innerHTML = '';
  cellEls = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < CELLS; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell empty';
    b.dataset.i = String(i);
    b.setAttribute('role', 'gridcell');
    b.innerHTML = '<span class="chip"><svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><use href="#glyph-0"></use></svg></span>';
    frag.appendChild(b);
    cellEls.push(b);
  }
  boardEl.appendChild(frag);
}

function buildHeroArt() {
  const art = $('#hero-art');
  if (!art) return;
  const pattern = [
    0, -1, 2, -1, 3,
    -1, 1, 4, 1, -1,
    3, 2, -1, 0, 2,
    -1, 4, 3, -1, 1,
    2, -1, 0, 4, -1,
  ];
  const target = new Set([1, 12, 13, 16, 21]);
  const frag = document.createDocumentFragment();
  pattern.forEach((v, i) => {
    const cell = document.createElement('span');
    cell.className = 'hcell' + (v < 0 ? ' h-empty' : '') + (target.has(i) ? ' h-target' : '');
    if (v >= 0) {
      cell.innerHTML = `<i class="hchip c${v}"><svg viewBox="0 0 10 10"><use href="#glyph-${v}"></use></svg></i>`;
    }
    frag.appendChild(cell);
  });
  art.appendChild(frag);
}

// ---------- 설정 화면 ----------
function renderSetup() {
  $$('#mode-seg .seg-btn').forEach((b) => {
    const on = b.dataset.mode === settings.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('#block-local').hidden = settings.mode !== 'local';
  $('#block-ai').hidden = settings.mode !== 'ai';
  $$('#count-pills .pill').forEach((b) => b.classList.toggle('on', Number(b.dataset.count) === settings.count));
  $$('#ai-pills .pill').forEach((b) => b.classList.toggle('on', Number(b.dataset.count) === settings.aiCount));
  $$('#level-pills .pill').forEach((b) => b.classList.toggle('on', b.dataset.level === settings.level));
  $('#my-name').value = settings.myName || '';

  const names = $('#local-names');
  names.innerHTML = '';
  for (let i = 0; i < settings.count; i++) {
    const row = document.createElement('label');
    row.className = 'name-row';
    row.innerHTML = `<span class="swatch p${i + 1}">P${i + 1}</span>`
      + `<input class="input" data-i="${i}" maxlength="10" autocomplete="off" placeholder="플레이어 ${i + 1}" value="${esc(settings.names[i] || '')}">`;
    names.appendChild(row);
  }
}

function toSetup() {
  gameToken += 1;
  state = null;
  busy = false;
  closeModal();
  screenGame.hidden = true;
  screenSetup.hidden = false;
  btnNew.hidden = true;
  renderSetup();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- 게임 시작 ----------
function startGame() {
  const cfg = [];
  if (settings.mode === 'local') {
    for (let i = 0; i < settings.count; i++) {
      cfg.push({ name: (settings.names[i] || '').trim().slice(0, 10) || `플레이어 ${i + 1}` });
    }
  } else {
    cfg.push({ name: (settings.myName || '').trim().slice(0, 10) || '나' });
    for (let i = 0; i < settings.aiCount; i++) {
      cfg.push({ name: `AI ${i + 1}`, isAI: true, level: settings.level });
    }
  }
  saveSettings();

  gameToken += 1;
  state = createGame(cfg);
  busy = false;
  screenSetup.hidden = true;
  screenGame.hidden = false;
  btnNew.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  paint();

  if (!anyJump(state.board)) finishGame();
  else if (state.players[0].isAI) aiTurn();
}

// ---------- 그리기 ----------
function chipHref(el, v) {
  el.querySelector('use').setAttribute('href', `#glyph-${v}`);
}

function paint() {
  if (!state) return;
  const turnPlayer = state.players[state.turn];
  const humanTurn = !turnPlayer.isAI;

  const targets = new Set();
  if (!state.over && state.activePos >= 0) {
    for (const mv of jumpsFrom(state.board, state.activePos)) targets.add(mv.land);
  }

  const movable = new Set();
  if (!state.over && humanTurn && !busy && state.jumps === 0) {
    for (const p of movablePositions(state.board)) movable.add(p);
  }

  for (let i = 0; i < CELLS; i++) {
    const el = cellEls[i];
    const v = state.board[i];
    const cls = ['cell'];
    if (v >= 0) {
      cls.push('has');
      if (el.dataset.v !== String(v)) {
        el.dataset.v = String(v);
        el.querySelector('.chip').className = 'chip c' + v;
        chipHref(el, v);
      }
    } else {
      cls.push('empty');
      delete el.dataset.v;
    }
    if (i === state.activePos) cls.push('sel');
    if (targets.has(i)) cls.push('target');
    if (movable.has(i) && i !== state.activePos) cls.push('movable');
    if (targets.has(i) && state.players[state.turn].isAI) cls.push('ai-target');
    el.className = cls.join(' ');

    const label = v >= 0
      ? `${coord(i)} ${COLORS[v].name} 칩${i === state.activePos ? ', 고른 칩' : ''}${movable.has(i) ? ', 뛸 수 있음' : ''}`
      : `${coord(i)} 빈칸${targets.has(i) ? ', 착지 가능' : ''}`;
    el.setAttribute('aria-label', label);
  }

  // 플레이어 카드
  playersEl.innerHTML = state.players.map((p, i) => {
    const sets = setsOf(p.counts);
    const total = totalOf(p.counts);
    const counts = p.counts.map((n, c) => (
      `<span class="cnt${n ? '' : ' zero'}" title="${COLORS[c].name} ${n}개">`
      + `<i class="mini c${c}"></i><b>${n}</b></span>`
    )).join('');
    const on = i === state.turn && !state.over;
    return `<article class="pcard${on ? ' on' : ''}${p.isAI ? ' ai' : ''}" data-p="${i}">
      <div class="phead">
        <span class="pbadge">P${i + 1}</span>
        <b class="pname">${esc(p.name)}</b>
        ${p.isAI ? `<span class="lvl">${LEVEL_NAME[p.level] || ''}</span>` : ''}
        ${on ? '<span class="turn">차례</span>' : ''}
      </div>
      <div class="pscore">
        <span class="sets"><b>${sets}</b><small>세트</small></span>
        <span class="total">칩 ${total}</span>
      </div>
      <div class="counts">${counts}</div>
    </article>`;
  }).join('');

  // 최근 점프
  if (!state.log.length) {
    logEl.innerHTML = '<li class="empty-log">아직 점프가 없어요</li>';
  } else {
    logEl.innerHTML = state.log.slice(0, 7).map((l) => {
      const name = state.players[l.player]?.name ?? `P${l.player + 1}`;
      return `<li><i class="dot c${l.color}"></i>`
        + `<b>${esc(name)}</b><span>${COLORS[l.color].name} +1</span>`
        + `<em>${coord(l.from)}→${coord(l.to)}</em></li>`;
    }).join('');
  }

  // 상태줄
  if (state.over) {
    statusEl.textContent = '게임이 끝났습니다';
    statusEl.className = 'status over';
  } else {
    statusEl.className = 'status' + (humanTurn ? '' : ' ai');
    if (!humanTurn) {
      statusEl.textContent = `${turnPlayer.name} 차례${busy ? ' · 점프 중…' : ''}`;
    } else if (state.jumps > 0) {
      statusEl.textContent = `${turnPlayer.name} · ${state.jumps}번 점프 — 계속 뛰거나 턴을 마치세요`;
    } else if (state.activePos >= 0) {
      statusEl.textContent = `${turnPlayer.name} · 칩을 골랐어요 — 점선 원을 누르세요`;
    } else {
      const n = movablePositions(state.board).length;
      statusEl.textContent = `${turnPlayer.name} 차례 — 뛸 수 있는 칩 ${n}개 중 하나를 고르세요`;
    }
  }

  // 턴 마치기
  const canEnd = !state.over && humanTurn && !busy && state.jumps > 0;
  btnEnd.disabled = !canEnd;
  btnEnd.textContent = state.jumps > 0 ? `턴 마치기 · ${state.jumps}점프` : '턴 마치기';

  // 힌트줄
  if (state.over) hintEl.textContent = '새 게임을 눌러 다시 시작할 수 있어요';
  else if (!humanTurn) hintEl.textContent = 'AI가 점프 경로를 한 칸씩 보여 줍니다';
  else if (state.activePos >= 0) hintEl.textContent = '점선 원을 누르면 그 칸으로 점프해요';
  else hintEl.textContent = '점이 찍힌 칩이 지금 뛸 수 있어요';

  turnCountEl.textContent = `${state.players.length}명 · ${state.log.length}점프`;
}

function flashCell(i, cls = 'burst') {
  const el = cellEls[i];
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 460);
}

// ---------- 사람 차례 ----------
function onCellClick(i) {
  if (!state || state.over || busy) return;
  const p = state.players[state.turn];
  if (p.isAI) return;

  const from = state.activePos;
  if (from >= 0 && state.board[i] < 0) {
    const mv = jumpsFrom(state.board, from).find((m) => m.land === i);
    if (mv) { doJump(mv); return; }
  }

  if (state.board[i] >= 0) {
    if (state.jumps > 0) {
      hintEl.textContent = '이번 차례에는 움직인 칩으로만 이어서 뛸 수 있어요';
      return;
    }
    if (!jumpsFrom(state.board, i).length) {
      const el = cellEls[i];
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 420);
      hintEl.textContent = '이 칩은 지금 뛸 수 없어요. 점이 찍힌 칩을 골라 보세요';
      return;
    }
    state.activePos = i;
    paint();
    hintEl.textContent = '점선 원을 누르면 그 칸으로 점프해요';
    return;
  }

  // 빈칸을 눌렀을 때
  if (from >= 0) hintEl.textContent = '점선으로 표시된 칸으로만 착지할 수 있어요';
}

function doJump(mv) {
  const mid = mv.mid;
  applyJump(state, mv);
  paint();
  flashCell(mid);

  if (!anyJump(state.board)) { finishGame(); return; }

  if (!jumpsFrom(state.board, state.activePos).length) {
    busy = true;
    paint();
    hintEl.textContent = '더 뛸 칸이 없어 차례를 넘깁니다';
    const token = gameToken;
    setTimeout(() => {
      if (token !== gameToken) return;
      busy = false;
      endTurn();
    }, 520);
    return;
  }
  paint();
}

// ---------- 차례 넘기기 ----------
function endTurn() {
  if (!state || state.over) return;
  state.activePos = -1;
  state.jumps = 0;
  state.turn = (state.turn + 1) % state.players.length;
  if (!anyJump(state.board)) { finishGame(); return; }
  paint();
  if (state.players[state.turn].isAI) aiTurn();
}

// ---------- AI 차례 ----------
async function aiTurn() {
  if (!state || state.over) return;
  const token = gameToken;
  const p = state.players[state.turn];
  if (!p || !p.isAI) return;

  busy = true;
  paint();
  await sleep(380);
  if (token !== gameToken || !state || state.over) { busy = false; return; }

  const plan = chooseMove(state, p.level);
  if (!plan) { busy = false; endTurn(); return; }

  state.activePos = plan.pos;
  paint();
  await sleep(300);

  for (const mv of plan.chain) {
    if (token !== gameToken || !state || state.over) { busy = false; return; }
    const legal = jumpsFrom(state.board, state.activePos).find((m) => m.land === mv.land);
    if (!legal) break;
    const mid = legal.mid;
    applyJump(state, legal);
    paint();
    flashCell(mid, 'ai-hit');
    if (!anyJump(state.board)) { busy = false; finishGame(); return; }
    await sleep(350);
  }

  if (token !== gameToken || !state) { busy = false; return; }
  if (state.over) { busy = false; return; }
  busy = false;
  await sleep(220);
  if (token !== gameToken || !state) return;
  endTurn();
}

// ---------- 게임 끝 ----------
function finishGame() {
  if (!state || state.over) return;
  state.over = true;
  state.ranking = rankPlayers(state.players);
  busy = false;
  paint();
  const token = gameToken;
  setTimeout(() => { if (token === gameToken) showGameOver(); }, 460);
}

function showGameOver() {
  if (!state || !state.ranking) return;
  const { rows, winners } = state.ranking;
  const names = winners.map((i) => state.players[i].name);
  const headline = names.length > 1 ? `공동 우승 — ${names.map(esc).join(', ')}` : `${esc(names[0])} 우승!`;

  const table = `<table class="rank">
    <thead><tr><th>순위</th><th>이름</th><th>세트</th><th>칩</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="${winners.includes(r.i) ? 'win' : ''}">
      <td>${r.place}</td><td>${esc(r.name)}</td><td><b>${r.sets}</b></td><td>${r.total}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  openModal({
    title: '게임 끝',
    body: `<p class="over-sub">보드에 더 뛸 곳이 없어 게임이 끝났습니다. 남은 칩은 아무도 갖지 않아요.</p>
      <div class="over-winner">🏆 ${headline}</div>
      <p class="over-rule">세트 수 → 칩 수 순으로 겨루고, 둘 다 같으면 공동 우승입니다.</p>
      ${table}`,
    actions: [
      { label: '새 게임', primary: true, onClick: toSetup },
      { label: '보드 다시 보기', onClick: () => {} },
    ],
  });
}

// ---------- 모달 ----------
function openModal({ title, body, actions = [] }) {
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modalFoot.innerHTML = '';
  const list = actions.length ? actions : [{ label: '닫기', primary: true }];
  for (const a of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (a.primary ? ' primary' : '');
    b.textContent = a.label;
    b.addEventListener('click', () => {
      closeModal();
      a.onClick?.();
    });
    modalFoot.appendChild(b);
  }
  modal.hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => (modalFoot.querySelector('button') || modal.querySelector('.icon-btn'))?.focus(), 30);
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

const RULES_HTML = `
  <section class="rule">
    <h3>1 · 준비</h3>
    <p>10×10 판에 5가지 색 칩을 20개씩, 모두 100개를 무작위로 놓습니다. 그리고 정가운데 4칸
    <b>(4,4) (4,5) (5,4) (5,5)</b>을 비운 채로 시작해요. 가운데를 향해 첫 점프를 하게 됩니다.</p>
  </section>
  <section class="rule">
    <h3>2 · 점프</h3>
    <p>보드 위 <b>어떤 칩이든</b> 골라, 상하좌우로 이웃한 칩 <b>하나를 뛰어넘어</b> 바로 뒤의 빈칸에 착지합니다.
    뛰어넘은 칩은 내 것이 됩니다. 대각선으로는 뛸 수 없어요.</p>
    <p class="rule-note">고른 칩에서 뛸 수 있는 칸은 <span class="inline-target"></span> 점선 원으로 표시됩니다. 점선 원을 누르면 점프!</p>
  </section>
  <section class="rule">
    <h3>3 · 연속 점프</h3>
    <p>방금 움직인 칩으로 더 뛸 수 있으면 <b>방향을 바꿔가며</b> 계속 뛸 수 있습니다.
    더 뛰고 싶지 않으면 <b>턴 마치기</b>를 누르세요. 더 뛸 칸이 없으면 자동으로 차례가 넘어갑니다.</p>
  </section>
  <section class="rule">
    <h3>4 · 끝과 점수</h3>
    <p>보드에 <b>합법 점프가 하나도 없으면 즉시 게임이 끝납니다.</b> 남은 칩은 아무도 갖지 않아요.</p>
    <p>5가지 색 칩을 <b>하나씩 모으면 세트 1개</b>. 세트가 많은 사람이 이기고, 세트가 같으면 <b>칩이 많은 사람</b>,
    그것도 같으면 <b>공동 우승</b>입니다.</p>
  </section>
  <section class="rule">
    <h3>조작</h3>
    <ul class="rule-list">
      <li>이름은 설정 화면에서 바꿀 수 있어요 (로컬 2~4인, AI 1~3명).</li>
      <li>AI는 실제 점프 경로를 한 단계씩 보여 주며 둡니다.</li>
      <li>오른쪽 위 <b>◐</b>로 어두운 화면, <b>새 게임</b>으로 처음부터 다시.</li>
    </ul>
  </section>
`;

function showRules() {
  openModal({ title: '스킵피티 규칙', body: RULES_HTML, actions: [{ label: '알겠어요', primary: true }] });
}

// ---------- 이벤트 ----------
boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.cell');
  if (btn) onCellClick(Number(btn.dataset.i));
});

btnEnd.addEventListener('click', () => {
  if (!state || busy || state.over) return;
  if (state.jumps > 0) endTurn();
});

$('#mode-seg').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  settings.mode = b.dataset.mode;
  saveSettings();
  renderSetup();
});

$('#count-pills').addEventListener('click', (e) => {
  const b = e.target.closest('.pill');
  if (!b) return;
  settings.count = Number(b.dataset.count);
  saveSettings();
  renderSetup();
});

$('#ai-pills').addEventListener('click', (e) => {
  const b = e.target.closest('.pill');
  if (!b) return;
  settings.aiCount = Number(b.dataset.count);
  saveSettings();
  renderSetup();
});

$('#level-pills').addEventListener('click', (e) => {
  const b = e.target.closest('.pill');
  if (!b) return;
  settings.level = b.dataset.level;
  saveSettings();
  renderSetup();
});

$('#local-names').addEventListener('input', (e) => {
  const i = e.target.dataset.i;
  if (i === undefined) return;
  settings.names[Number(i)] = e.target.value.slice(0, 10);
  saveSettings();
});

$('#my-name').addEventListener('input', (e) => {
  settings.myName = e.target.value.slice(0, 10);
  saveSettings();
});

$('#btn-start').addEventListener('click', startGame);

btnNew.addEventListener('click', () => {
  if (state && !state.over && !window.confirm('진행 중인 게임을 그만두고 설정 화면으로 돌아갈까요?')) return;
  toSetup();
});

$('#btn-rules').addEventListener('click', showRules);
$('#btn-rules-2').addEventListener('click', showRules);

btnTheme.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

// 시작
initTheme();
buildBoard();
buildHeroArt();
renderSetup();
