// 스킵피티 규칙 엔진 — 화면과 AI가 함께 씁니다.
export const SIZE = 10;
export const CELLS = SIZE * SIZE;

// 가운데 4칸 (4,4) (4,5) (5,4) (5,5) — 0부터 세는 좌표
export const CENTER = [44, 45, 54, 55];

export const COLORS = [
  { key: 'yellow', name: '노랑', hex: '#ffdc1a' },
  { key: 'red', name: '빨강', hex: '#ff614a' },
  { key: 'sky', name: '하늘', hex: '#0abbee' },
  { key: 'green', name: '초록', hex: '#02c245' },
  { key: 'purple', name: '보라', hex: '#7e65c1' },
];

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export const rowOf = (i) => (i / SIZE) | 0;
export const colOf = (i) => i % SIZE;
/** 사람이 읽는 좌표: 3행 2열 */
export const coord = (i) => `${rowOf(i) + 1}행 ${colOf(i) + 1}열`;

/** pos 칸의 칩이 지금 뛸 수 있는 합법 점프 목록 [{mid, land}] */
export function jumpsFrom(board, pos) {
  if (pos < 0 || board[pos] < 0) return [];
  const r = rowOf(pos);
  const c = colOf(pos);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (lr < 0 || lr >= SIZE || lc < 0 || lc >= SIZE) continue;
    const mid = mr * SIZE + mc;
    const land = lr * SIZE + lc;
    if (board[mid] >= 0 && board[land] < 0) out.push({ mid, land });
  }
  return out;
}

export function anyJump(board) {
  for (let i = 0; i < CELLS; i++) if (board[i] >= 0 && jumpsFrom(board, i).length) return true;
  return false;
}

export function movablePositions(board) {
  const out = [];
  for (let i = 0; i < CELLS; i++) if (board[i] >= 0 && jumpsFrom(board, i).length) out.push(i);
  return out;
}

export const setsOf = (counts) => Math.min(...counts);
export const totalOf = (counts) => counts.reduce((a, b) => a + b, 0);

/** 새 게임: 5색 × 20개를 무작위로 놓고 가운데 4칸을 비웁니다. */
export function createGame(playerConfigs) {
  const bag = [];
  for (let c = 0; c < COLORS.length; c++) for (let k = 0; k < 20; k++) bag.push(c);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = bag[i];
    bag[i] = bag[j];
    bag[j] = t;
  }
  const board = Int8Array.from(bag);
  for (const i of CENTER) board[i] = -1;

  return {
    board,
    players: playerConfigs.map((p) => ({
      name: p.name,
      isAI: Boolean(p.isAI),
      level: p.level || 'normal',
      counts: [0, 0, 0, 0, 0],
    })),
    turn: 0,
    activePos: -1, // 지금 뛰고 있는 칩
    jumps: 0, // 이번 차례에 뛴 횟수
    log: [],
    over: false,
    ranking: null,
  };
}

/**
 * 점프 실행: activePos 의 칩을 mv.land 로 옮기고 mv.mid 칩을 가져옵니다.
 * state 를 직접 바꾸고, 가져온 칩 색 번호를 돌려줍니다.
 */
export function applyJump(state, mv) {
  const from = state.activePos;
  const chip = state.board[from];
  const color = state.board[mv.mid];
  state.board[mv.mid] = -1;
  state.board[from] = -1;
  state.board[mv.land] = chip;
  state.players[state.turn].counts[color] += 1;
  state.activePos = mv.land;
  state.jumps += 1;
  state.log.unshift({ player: state.turn, color, from, to: mv.land, n: state.jumps });
  if (state.log.length > 60) state.log.length = 60;
  return color;
}

/** 세트 수 → 칩 수 → 공동 순위 */
export function rankPlayers(players) {
  const rows = players.map((p, i) => ({
    i,
    name: p.name,
    isAI: p.isAI,
    counts: p.counts.slice(),
    sets: setsOf(p.counts),
    total: totalOf(p.counts),
  }));
  rows.sort((a, b) => b.sets - a.sets || b.total - a.total || a.i - b.i);

  // 같은 순위(세트·칩 모두 같음) 묶기
  let place = 0;
  let prev = null;
  rows.forEach((r, idx) => {
    if (!prev || r.sets !== prev.sets || r.total !== prev.total) place = idx + 1;
    r.place = place;
    prev = r;
  });

  const top = rows[0];
  const winners = rows.filter((r) => r.sets === top.sets && r.total === top.total).map((r) => r.i);
  return { rows, winners };
}
