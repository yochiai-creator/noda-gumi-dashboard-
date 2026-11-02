// 屋内の置場（ヤードマップと連動）のテスト（2026/11/02）
const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 400) : '')); } };
const sb = { Logger: { log() {} }, JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error,
  Utilities: { formatDate: () => '2026-11-02 15:00' } };
vm.createContext(sb);
['noda_yard_indoor.js', 'noda_yard_tab.js'].forEach((f) => vm.runInContext(fs.readFileSync(__dirname + '/../gas/' + f, 'utf8'), sb));

console.log('■ 区画の書き方');
chk('「1-19」「20-22,25」「17〜30」', sb.yardin_blocks_('1-19').length === 19 && JSON.stringify(sb.yardin_blocks_('20-22,25')) === '[20,21,22,25]' && sb.yardin_blocks_('17〜30').length === 14);
const map = sb.yardin_mappingFrom_([[23, '50k', '1-19'], [25, '50k', '20-22'], [20, '20ｋ', '17-30'], ['', '50k', '1'], [9, 'x', '1']]);
chk('★シートの行を読む（全角ｋも・置場番号やマップの無い行は飛ばす）', map.length === 3 && map[2].map === '20k' && map[2].blocks[0] === 17, map);

console.log('■ 本数を足す');
const raw = { '50k': [{ found: true, pos: 1, kind: 'fill', qty: 100 }, { found: true, pos: 2, kind: 'empty', qty: 0 }, { found: true, pos: 19, kind: 'fill', qty: 98 },
                     { found: true, pos: 20, kind: 'fill', qty: 100 }, { found: true, pos: 31, kind: 'fill', qty: 100 }],
              '20k': [{ found: true, pos: 17, kind: 'fill', qty: 50 }, { found: true, pos: 31, kind: 'fill', qty: 50 }] };
const sums = sb.yardin_sums_(map, raw);
chk('★埋まっている区画だけ足す（北製品倉庫 50kg 198本・2区画）', sums['23'].a50 === 198 && sums['23'].区画 === 2, sums['23']);
chk('★上小屋（20〜22）は北プラットホームに', sums['25'].a50 === 100);
chk('★20kの区画は20kgに（コンテナ倉庫 50本）', sums['20'].a20 === 50 && sums['20'].a50 === 0, sums['20']);
chk('割り当ての無い区画（50k 31）は数えない', !Object.keys(sums).some((k) => sums[k].a50 === 300));

console.log('■ 割り当てていない区画は「その他の区画」');
const oth = sb.yardin_other_(map, raw);
chk('★どの置場にも入っていない埋まった区画（50k 31 の100本）を数える', oth.a50 === 100 && oth.a20 === 50 && oth.区画 === 2, oth);

console.log('■ 屋内は野外の合計に入れない');
const rows = [{ no: '1', name: '駐車場', position: '南', a50: 100, m50: 600 }, { no: '23', name: '北製品倉庫', position: '屋内', a50: 198 }];
const locs = rows.map(sb.yardtab_shape_);
const t = sb.yardtab_totals_(locs);
chk('★屋内の印', locs[1].屋内 === true && locs[0].屋内 === false);
chk('★野外の合計は屋外だけ（100）・屋内は別（198・1か所）', t.合計 === 100 && t.a50 === 100 && t.置場数 === 1 && t.屋内合計 === 198 && t.屋内置場数 === 1, t);

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
