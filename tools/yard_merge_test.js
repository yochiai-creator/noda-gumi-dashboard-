// yard_mergeLiveBlocks_ だけを .jsx から取り出して直接動かす。
//
// ★ なぜ要るのか
//   「空きなのに出荷希望日が出る」不具合の修正が、リポジトリのソースから
//   一度失われていた（本番のHTMLにだけ入っていた）。静的データには
//   shipDate を持つ区画が無いので、画面を描くテストでは何も確かめられない。
//   関数を直接呼んで、null と undefined の扱いを固定する。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../noda-gumi-dashboard.jsx', 'utf8');
const i = src.indexOf('function yard_mergeLiveBlocks_');
if (i < 0) { console.log('★yard_mergeLiveBlocks_ が .jsx にありません'); process.exit(1); }
const j = src.indexOf('\n}\n', i) + 3;
const merge = new Function(src.slice(i, j) + '; return yard_mergeLiveBlocks_;')();

let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
  else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

const raw = { viewBox: '0 0 10 10', blocks: [
  { pos: 1, grp: 100, rng: '1〜50', cnt: 50, kind: 'fill', shipDate: '9月10日', orders: [] },
  { pos: 2, grp: null, rng: null, cnt: null, kind: 'empty', orders: [] },
] };

console.log('■ 出荷希望日');
{
  // GASが「空きなので出荷希望日は無い」と はっきり null を返した場合
  const m = merge(raw, { 1: { found: true, kind: 'empty', shipDate: null } });
  chk('★nullが返ったら静的の古い値に戻さない', m.blocks[0].shipDate === null, m.blocks[0].shipDate);
  chk('状態は空きになる', m.blocks[0].kind === 'empty', m.blocks[0].kind);
}
{
  // shipDate をそもそも返してこない場合は静的値を使う
  const m = merge(raw, { 1: { found: true, kind: 'fill' } });
  chk('返ってこなければ静的値のまま', m.blocks[0].shipDate === '9月10日', m.blocks[0].shipDate);
}
{
  const m = merge(raw, { 1: { found: true, shipDate: '9月20日' } });
  chk('値が返ればそれを使う', m.blocks[0].shipDate === '9月20日', m.blocks[0].shipDate);
}

console.log('■ そのほかの項目');
{
  const m = merge(raw, { 1: { groupNo: 999, rangeStart: 7, rangeEnd: 9, qty: 3, kind: 'fill', orders: [{ no: 'a' }] } });
  const b = m.blocks[0];
  chk('群番号を上書きする', b.grp === 999, b.grp);
  chk('容器番号の範囲を組み立てる', b.rng === '7〜9', b.rng);
  chk('本数を上書きする', b.cnt === 3, b.cnt);
  chk('依頼Noを上書きする', b.orders.length === 1, b.orders);
}
{
  const m = merge(raw, {});
  chk('ライブが空なら静的データのまま', m.blocks[0] === raw.blocks[0] && m.blocks[1] === raw.blocks[1]);
  chk('区画の数は変わらない', m.blocks.length === 2, m.blocks.length);
  chk('viewBoxはそのまま', m.viewBox === raw.viewBox, m.viewBox);
}
{
  // 0本・群番号0 が「値なし」に落ちないこと
  const m = merge(raw, { 1: { groupNo: 0, qty: 0 } });
  chk('0本を欠けとして扱わない', m.blocks[0].cnt === 0, m.blocks[0].cnt);
  chk('群番号0を欠けとして扱わない', m.blocks[0].grp === 0, m.blocks[0].grp);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
