// 「直近7日の動き」で、同じ日・同じサイズ・同じ置場への入庫をまとめる moveGroups_ のテスト（11/3「これ細かくいらない」）
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../noda-gumi-dashboard.jsx', 'utf8');
const a = src.indexOf('function moveGroups_('), b = src.indexOf('\nfunction ', a + 10);
const moveGroups_ = new Function(src.slice(a, b) + '; return moveGroups_;')();
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };
const R = (id, at, kind, size, qty, to, extra) => Object.assign({ id, at, kind, size, qty, from: '', to, name: 'y.ochiai', canceled: false }, extra || {});
const rows = [
  R('1', '2026-11-03 18:20', '入庫', '20kg', 28, '18 集会場'),
  R('2', '2026-11-03 18:20', '入庫', '20kg', 27, '18 集会場'),
  R('3', '2026-11-03 18:20', '入庫', '20kg', 19, '18 集会場', { name: '（自動：重量転記）' }),
  R('4', '2026-11-03 17:00', '移動', '20kg', 10, '1 駐車場', { from: '18 集会場' }),
  R('5', '2026-11-03 16:00', '入庫', '20kg', 72, '15 風呂場跡'),
  R('6', '2026-11-03 15:00', '入庫', '50kg', 100, '18 集会場'),
  R('7', '2026-11-02 20:25', '入庫', '20kg', 23, '18 集会場'),
  R('8', '2026-11-02 20:25', '入庫', '20kg', 27, '18 集会場', { canceled: true }),
];
const g = moveGroups_(rows);
chk('同じ日・同じ置場・同じサイズの入庫は1つ（3件）', g[0].rows.length === 3 && g[0].rows.reduce((s, r) => s + r.qty, 0) === 74, g[0]);
chk('移動はまとめない', g[1].rows.length === 1 && g[1].rows[0].kind === '移動');
chk('置場が違えば別', g[2].rows[0].to === '15 風呂場跡' && g[2].rows.length === 1);
chk('サイズが違えば別', g[3].rows[0].size === '50kg');
chk('日が違えば別', g[4].rows[0].at.slice(0, 10) === '2026-11-02' && g[4].rows.length === 1);
chk('取り消した行はまとめない', g[5].rows.length === 1 && g[5].rows[0].canceled);
chk('行は全部どこかに入る', g.reduce((s, x) => s + x.rows.length, 0) === rows.length);
chk('空でも落ちない', moveGroups_(null).length === 0);
console.log(pass + ' OK / ' + fail + ' FAIL'); if (fail) process.exit(1);
