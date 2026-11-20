// 스킵피티 AI — 사람과 같은 규칙으로 한 칩을 골라 연속 점프를 계획합니다.
import { CELLS, jumpsFrom } from './game.js';

// 세트 완성이 가장 값지고, 그다음이 다음 세트에 필요한 색, 마지막이 칩 개수(동점 처리)
const W_SET = 1000;
const W_NEXT = 60;
const W_CHIP = 5;

function scoreOf(counts) {
  let min = counts[0];
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const c = counts[i];
    total += c;
    if (c < min) min = c;
  }
  let next = 0;
  for (let i = 0; i < 5; i++) if (counts[i] > min) next++;
  return min * W_SET + next * W_NEXT + total * W_CHIP;
}

/**
 * start 칸의 칩 하나로 만들 수 있는 가장 좋은 연속 점프 경로.
 * board(Int8Array 사본)와 counts(배열 사본)는 잠깐 바꿨다가 되돌립니다.
 */
function bestChain(board, start, counts, limit) {
  const chip = board[start];
  let nodes = 0;
  let bestGain = 0;
  let bestPath = [];
  const path = [];

  const walk = (pos, gain) => {
    if (path.length >= limit.depth) return;
    const moves = jumpsFrom(board, pos);
    if (!moves.length) return;

    // 이번에 가져올 색의 값이 큰 순서로 살펴보면 좋은 경로를 먼저 찾습니다
    const before = scoreOf(counts);
    const order = moves.map((mv) => {
      const col = board[mv.mid];
      counts[col]++;
      const d = scoreOf(counts) - before;
      counts[col]--;
      return { mv, d };
    });
    order.sort((a, b) => b.d - a.d);

    for (const { mv, d } of order) {
      if (++nodes > limit.budget) return;
      const col = board[mv.mid];
      board[mv.mid] = -1;
      board[pos] = -1;
      board[mv.land] = chip;
      counts[col]++;
      path.push({ mid: mv.mid, land: mv.land });

      const g = gain + d;
      if (g > bestGain) {
        bestGain = g;
        bestPath = path.slice();
      }
      walk(mv.land, g);

      path.pop();
      counts[col]--;
      board[mv.land] = -1;
      board[pos] = chip;
      board[mv.mid] = col;
    }
  };

  walk(start, 0);
  return { gain: bestGain, path: bestPath };
}

const LEVELS = {
  easy: { depth: 2, budget: 90, noise: 0.75, random: 0.45 },
  normal: { depth: 6, budget: 420, noise: 0.06, random: 0 },
  hard: { depth: 12, budget: 900, noise: 0, random: 0, lookAhead: true },
};

function opponentBestGain(board, counts, depth, budget) {
  let best = 0;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] < 0 || !jumpsFrom(board, i).length) continue;
    const res = bestChain(board.slice(), i, counts.slice(), { depth, budget });
    if (res.gain > best) best = res.gain;
  }
  return best;
}

function simulateChain(board, start, chain) {
  const b = board.slice();
  let pos = start;
  const chip = b[pos];
  for (const mv of chain) {
    const col = b[mv.mid];
    if (b[mv.mid] < 0 || b[mv.land] >= 0) return null; // 안전 확인
    b[mv.mid] = -1;
    b[pos] = -1;
    b[mv.land] = chip;
    pos = mv.land;
  }
  return b;
}

/**
 * 지금 차례인 플레이어의 한 수를 고릅니다.
 * @returns {{pos:number, chain:{mid:number, land:number}[], gain:number}|null}
 */
export function chooseMove(state, levelName = 'normal') {
  const lv = LEVELS[levelName] || LEVELS.normal;
  const board = state.board;
  const counts = state.players[state.turn].counts.slice();

  const cands = [];
  for (let i = 0; i < CELLS; i++) {
    if (board[i] < 0 || !jumpsFrom(board, i).length) continue;
    const res = bestChain(board.slice(), i, counts.slice(), lv);
    if (res.path.length) cands.push({ pos: i, chain: res.path, gain: res.gain });
  }
  if (!cands.length) return null;

  if (lv.random && Math.random() < lv.random) {
    return cands[(Math.random() * cands.length) | 0];
  }

  cands.sort((a, b) => b.gain - a.gain);

  if (lv.noise) {
    // 쉬움/보통: 상위 후보 중에서 조금 흔들어 고릅니다 (너무 기계적이지 않게)
    const window = lv.noise > 0.5 ? cands.length : Math.min(2, cands.length);
    const pick = cands[(Math.random() * window) | 0];
    if (Math.random() > lv.noise) return cands[0];
    return pick;
  }

  if (lv.lookAhead) {
    const nextIdx = (state.turn + 1) % state.players.length;
    const nextCounts = state.players[nextIdx].counts.slice();
    let best = cands[0];
    let bestVal = -Infinity;
    for (const c of cands.slice(0, 3)) {
      const after = simulateChain(board, c.pos, c.chain);
      const opp = after ? opponentBestGain(after, nextCounts, 3, 140) : 0;
      // 상대에게 크게 내주는 수는 조금 피합니다
      const val = c.gain - opp * 0.4 + Math.random() * 3;
      if (val > bestVal) {
        bestVal = val;
        best = c;
      }
    }
    return best;
  }

  return cands[0];
}
