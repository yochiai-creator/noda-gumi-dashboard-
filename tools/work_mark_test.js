// マークの写真照合（noda_work_mark.js）のテスト。AI（Gemini）とDriveは偽物。
// ★ 一致なら記録・違う／読めないなら記録しない・写真と判定は必ず残す・キーが無ければ止める、を押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';
// work_test.js の道具（偽のシート・指図書の行・sb）をそのまま使う
const src = fs.readFileSync(__dirname + '/work_test.js', 'utf8');
const head = src.slice(0, src.indexOf("const it0 = "));
const T = new Function('require', '__dirname', 'process', head + '; return { sb, ROWS, ENTRIES, chk, get pass() { return pass; }, get fail() { return fail; } };')(require, __dirname, process);

function msb(opt) {
  const o = opt || {};
  const s = T.sb({ actRows: T.ROWS, entries: T.ENTRIES, pastDays: 0 });
  const props = Object.assign({}, o.props || {});
  s.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) };
  s.Session = { getActiveUser: () => ({ getEmail: () => o.me || 'y.ochiai@nodagumi40.com' }), getEffectiveUser: () => ({ getEmail: () => 'y.ochiai@nodagumi40.com' }) };
  const files = [];
  const folder = { getId: () => 'PHOTOS', createFile: (b) => { files.push(b); return { getId: () => 'PH' + files.length }; }, getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder };
  s.DriveApp = {
    getFileById: (id) => ({ getBlob: () => ({ getBytes: () => [1, 2, 3] }), getParents: () => ({ hasNext: () => true, next: () => folder }) }),
    getFolderById: () => folder, getRootFolder: () => folder,
  };
  s.__yard.getId = () => 'YARD';
  const fmt0 = s.Utilities.formatDate;
  s.Utilities.formatDate = (d, tz, f) => (f === 'yyyyMMdd_HHmmss' ? '20261028_120000' : fmt0(d, tz, f));
  s.Utilities.base64Encode = () => 'UERG';
  s.Utilities.base64Decode = () => [0];
  s.Utilities.newBlob = (bytes, mime, name) => ({ mime, name });
  const calls = [];
  s.UrlFetchApp = { fetch: (url, opt) => {
    calls.push({ url, body: JSON.parse(opt.payload), headers: opt.headers });
    const r = (o.replies || [])[calls.length - 1] || { code: 200, json: o.ai };
    return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.code === 200 ? { candidates: [{ content: { parts: [{ text: JSON.stringify(r.json) }] } }] } : { error: { status: 'X', message: 'busy' } }) };
  } };
  vm.runInContext(fs.readFileSync(__dirname + '/../gas_paused/noda_work_mark.js', 'utf8'), s);
  s.addWorkStaff('野田 太郎', '出荷');
  s.__files = files; s.__calls = calls; s.__props = props;
  return s;
}
const chk = T.chk;
const K = '26-60846-0(1)';
const it = (d, k) => d.days.reduce((a, g) => a.concat(g.items), []).find((o) => o.key === k);
const OK = { result: '一致', photoShop: 'ENERGY LIFE PARTNER', docShop: 'ENERGY LIFE PARTNER', photoTel: '086-279-0053', docTel: '086-279-0053', logo: '合う', reason: '商店名・電話・ロゴが同じ' };

console.log('■ キー');
{
  const s = msb({});
  let threw = null; try { s.checkMarkPhoto({ key: K, name: '野田 太郎', image: 'AAAA' }); } catch (e) { threw = e.message; }
  chk('★キーが無ければ止める（何をすればよいか書く）', /GEMINI_API_KEY/.test(threw || ''), threw);
  chk('キーが無ければ写真も保存しない（撮り直しになるので）', s.__files.length === 0);
  chk('持ち主は画面からキーを入れられる', s.setMarkAiKey('AIzaSyD-abcdefghijklmnopqrstuv').hasKey === true && s.__props.GEMINI_API_KEY === 'AIzaSyD-abcdefghijklmnopqrstuv');
  const s2 = msb({ me: 'genba@nodagumi40.com' });
  threw = null; try { s2.setMarkAiKey('AIzaSyD-abcdefghijklmnopqrstuv'); } catch (e) { threw = e.message; }
  chk('★持ち主でなければキーを入れられない', /持ち主/.test(threw || ''), threw);
  chk('状態：持ち主でない人には入れる欄を出さない', s2.getMarkAiStatus().canSetKey === false);
}

console.log('■ 一致ならマークを記録する');
{
  const s = msb({ props: { GEMINI_API_KEY: 'k' }, ai: OK });
  const r = s.checkMarkPhoto({ key: K, name: '野田 太郎', image: 'data:image/jpeg;base64,AAAA', mime: 'image/jpeg' });
  chk('★判定は一致', r.verdict.result === '一致', r.verdict);
  chk('★写真を保存する（指図書と日時の名前）', s.__files.length === 1 && /^26-60846-0\(1\)_マーク_\d{8}_\d{6}\.jpg$/.test(s.__files[0].name), s.__files.map((f) => f.name));
  chk('★マークを記録した（押した人・写真の印）', r.recorded && it(r.progress, K).mark && it(r.progress, K).mark.by === '野田 太郎', r.recorded);
  const log = s.__yard.sheets['作業記録'].rows;
  chk('作業記録のメモに写真照合と写真ID', /写真照合:一致 写真:PH1/.test(log[1][8]), log[1]);
  const ml = s.__yard.sheets['マーク照合'].rows;
  chk('★マーク照合シートに判定を残す（商店名・電話・ロゴ・理由・写真・モデル）', ml.length === 2 && ml[1][3] === '一致' && ml[1][4] === 'ENERGY LIFE PARTNER' && ml[1][10] === 'PH1' && ml[1][11] === 'gemini-3.6-flash', ml[1]);
  const c = s.__calls[0];
  chk('★AIには指図書PDFと写真の2つを渡す', c.body.contents[0].parts[0].inline_data.mime_type === 'application/pdf' && c.body.contents[0].parts[1].inline_data.mime_type === 'image/jpeg' && c.body.contents[0].parts[1].inline_data.data === 'AAAA');
  chk('キーはヘッダーで渡す（URLに載せない）', c.headers['x-goog-api-key'] === 'k' && !/key=/.test(c.url));
  chk('答えの形を指定する（JSON・判定は3つから）', c.body.generationConfig.responseMimeType === 'application/json' && c.body.generationConfig.responseSchema.properties.result.enum.join() === '一致,違う,読めない');
}

console.log('■ 違う・読めないは記録しない');
{
  const s = msb({ props: { GEMINI_API_KEY: 'k' }, ai: Object.assign({}, OK, { result: '違う', photoShop: 'ENERGY LIFE', reason: '商店名が足りない' }) });
  const r = s.checkMarkPhoto({ key: K, name: '野田 太郎', image: 'AAAA' });
  chk('★違うなら記録しない（写真と判定は残す）', r.verdict.result === '違う' && !r.recorded && !s.__yard.sheets['作業記録'] || (s.__yard.sheets['作業記録'].rows.length === 1), r);
  chk('写真は残す', s.__files.length === 1 && s.__yard.sheets['マーク照合'].rows[1][3] === '違う');
}

console.log('■ AIの言い間違いの保険（純関数）');
{
  const s = msb({});
  const v1 = s.wmark_normalize_(Object.assign({}, OK, { photoTel: '086-279-0054' }));
  chk('★電話番号の数字が違うのに一致 → 違う', v1.result === '違う' && /電話番号が違います/.test(v1.reason), v1);
  const v2 = s.wmark_normalize_(Object.assign({}, OK, { logo: '違う' }));
  chk('★ロゴが違うのに一致 → 違う', v2.result === '違う', v2);
  const v3 = s.wmark_normalize_({ result: 'OK', logo: 'x' });
  chk('知らない答えは「読めない」', v3.result === '読めない' && v3.logo === 'わからない', v3);
  const v4 = s.wmark_normalize_(Object.assign({}, OK, { photoTel: '(086)279-0053' }));
  chk('電話の書き方の違い（かっこ・ハイフン）は同じ', v4.result === '一致', v4);
}

console.log('■ 混雑なら予備のモデル・ダメなら理由');
{
  const s = msb({ props: { GEMINI_API_KEY: 'k' }, replies: [{ code: 503 }, { code: 200, json: OK }] });
  const r = s.checkMarkPhoto({ key: K, name: '野田 太郎', image: 'AAAA' });
  chk('★503なら予備のモデルで照合する', r.verdict.result === '一致' && /gemini-3\.5-flash-lite/.test(s.__calls[1].url), s.__calls.map((c) => c.url));
  const s2 = msb({ props: { GEMINI_API_KEY: 'k' }, replies: [{ code: 429 }, { code: 429 }] });
  let threw = null; try { s2.checkMarkPhoto({ key: K, name: '野田 太郎', image: 'AAAA' }); } catch (e) { threw = e.message; }
  chk('★どれもダメなら「混み合っています」と言う（写真と判定エラーは残す）', /混み合って/.test(threw || '') && s2.__files.length === 1 && s2.__yard.sheets['マーク照合'].rows[1][3] === 'エラー', threw);
  const s3 = msb({ props: { GEMINI_API_KEY: 'k' }, ai: OK });
  threw = null; try { s3.checkMarkPhoto({ key: K, name: '知らない人', image: 'AAAA' }); } catch (e) { threw = e.message; }
  chk('社員に無い名前では照合しない', /記録する人/.test(threw || ''), threw);
  threw = null; try { s3.checkMarkPhoto({ key: '26-99999-0(1)', name: '野田 太郎', image: 'AAAA' }); } catch (e) { threw = e.message; }
  chk('一覧に無い指図書は「見つかりません」', /見つかりません/.test(threw || ''), threw);
}

console.log('\n===== ' + T.pass + ' PASS / ' + T.fail + ' FAIL =====');
process.exit(T.fail ? 1 : 0);
