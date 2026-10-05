// A small, safe spreadsheet engine for the canvas `sheet` block. No eval:
// formulas are tokenized and parsed by hand. Supports numbers, cell refs
// (B2), ranges (B2:B7) inside SUM / AVERAGE / MIN / MAX / COUNT, + - * /,
// unary minus and parentheses. Errors render as "#ERR"; cycles as "#CYCLE".

const FUNCS = {
  SUM: (xs) => xs.reduce((a, b) => a + b, 0),
  AVERAGE: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
  MIN: (xs) => (xs.length ? Math.min(...xs) : 0),
  MAX: (xs) => (xs.length ? Math.max(...xs) : 0),
  COUNT: (xs) => xs.length,
};

const colIndex = (letters) => letters.toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
export const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z]+\d+(?::[A-Za-z]+\d+)?)|([A-Za-z]+)(?=\()|([+\-*/(),]))/y;
  let m;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(at))) break; throw new Error('token'); }
    if (m[1]) out.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2]) out.push({ t: 'ref', v: m[2].toUpperCase() });
    else if (m[3]) out.push({ t: 'fn', v: m[3].toUpperCase() });
    else out.push({ t: 'op', v: m[4] });
  }
  return out;
}

export function createSheet(columns, rows) {
  const grid = rows.map((r) => r.slice());
  const cache = new Map();
  const visiting = new Set();

  const raw = (r, c) => (grid[r] ? grid[r][c] : undefined);

  function cellValue(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) throw new Error('ref');
    return value(parseInt(m[2], 10) - 1, colIndex(m[1]));
  }

  function rangeValues(a, b) {
    const ma = /^([A-Z]+)(\d+)$/.exec(a), mb = /^([A-Z]+)(\d+)$/.exec(b);
    const [c1, c2] = [colIndex(ma[1]), colIndex(mb[1])].sort((x, y) => x - y);
    const [r1, r2] = [parseInt(ma[2], 10) - 1, parseInt(mb[2], 10) - 1].sort((x, y) => x - y);
    const out = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = value(r, c); if (typeof v === 'number') out.push(v); }
    return out;
  }

  function evaluate(formula) {
    const toks = tokenize(formula.slice(1));
    let i = 0;
    const peek = () => toks[i];
    const take = () => toks[i++];
    const num = (v) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('nan'); return v; };

    function primary() {
      const t = take();
      if (!t) throw new Error('eof');
      if (t.t === 'num') return t.v;
      if (t.t === 'op' && t.v === '-') return -primary();
      if (t.t === 'op' && t.v === '(') { const v = expr(); if (take()?.v !== ')') throw new Error('paren'); return v; }
      if (t.t === 'ref') {
        if (t.v.includes(':')) throw new Error('range outside function');
        const v = cellValue(t.v);
        return v === '' || v == null ? 0 : num(v);
      }
      if (t.t === 'fn') {
        const fn = FUNCS[t.v];
        if (!fn || take()?.v !== '(') throw new Error('fn');
        const vals = [];
        while (peek() && peek().v !== ')') {
          const a = peek();
          if (a.t === 'ref' && a.v.includes(':')) { take(); vals.push(...rangeValues(...a.v.split(':'))); }
          else vals.push(num(expr()));
          if (peek()?.v === ',') take();
        }
        if (take()?.v !== ')') throw new Error('paren');
        return fn(vals);
      }
      throw new Error('unexpected');
    }
    function term() { let v = primary(); while (peek() && (peek().v === '*' || peek().v === '/')) { const op = take().v; const r = primary(); v = op === '*' ? v * r : v / r; } return v; }
    function expr() { let v = term(); while (peek() && (peek().v === '+' || peek().v === '-')) { const op = take().v; const r = term(); v = op === '+' ? v + r : v - r; } return v; }

    const v = expr();
    if (i !== toks.length) throw new Error('trailing');
    return num(v);
  }

  function value(r, c) {
    const key = `${r},${c}`;
    if (cache.has(key)) return cache.get(key);
    const x = raw(r, c);
    if (typeof x !== 'string' || !x.startsWith('=')) return x ?? '';
    if (visiting.has(key)) return '#CYCLE';
    visiting.add(key);
    let v;
    try { v = evaluate(x); } catch (_) { v = '#ERR'; }
    visiting.delete(key);
    if (typeof v === 'string' && v.startsWith('#')) { cache.set(key, v); return v; }
    cache.set(key, v);
    return v;
  }

  return {
    columns,
    rows: grid.length,
    raw,
    value,
    set(r, c, v) { grid[r][c] = v; cache.clear(); },
  };
}

export function formatCell(v) {
  if (typeof v !== 'number') return v ?? '';
  const abs = Math.abs(v);
  return abs >= 1000 ? Math.round(v).toLocaleString('en-GB') : Number.isInteger(v) ? String(v) : v.toFixed(2);
}
