/**
 * 野田組 業務ダッシュボード — マークの写真照合（出荷の進捗の「マーク」）
 * ------------------------------------------------------------------
 * ★ 何をするか（2026/10/26 落合さん）
 *   容器に刷り込んだマーク（商店名・ロゴ・電話番号）を撮った写真と、出荷作業指図書の
 *   1ページ目（商店名と、マークの絵＝ロゴ・名称・電話番号）を AI（Gemini）に見比べさせ、
 *   「一致／違う／読めない」と理由を返す。一致ならそのまま「マーク」を記録する。
 *   違う・読めないときは記録しない（人が見て「それでもマークにする」を押せる）。
 *   ダブルチェック（対比表との番号の照合）は今はしない（落合さん：今は良い）。
 *
 * ★ AIの判断は間違うことがある。一致でも写真と判定は全部残して、あとから見返せるようにする
 *   （写真は Drive の「出荷チェック写真」、判定は置場容量のスプレッドシートの「マーク照合」シート）。
 *
 * ★ 指図書は、本社から届いた元の指図書PDF（実績シートの fileId）を使う。
 *   書き込みアプリのコピーは途中で書き込み（赤のチェック）が入ったり、チェック完了で別のファイルに
 *   なったりするので、照合の見本には向かない。
 *
 * ★ APIキーはスクリプトプロパティ `GEMINI_API_KEY`（コードに書かない）。画面から入れられるのは
 *   スクリプトの持ち主だけ（setMarkAiKey）。モデルは `MARK_GEMINI_MODEL`（無ければ既定）。
 *
 * 名前の衝突に注意：内部関数はすべて wmark_ 接頭辞。
 */

var WMARK_CONFIG = {
  PROP_KEY: 'GEMINI_API_KEY',
  PROP_MODEL: 'MARK_GEMINI_MODEL',
  MODELS: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],   // 本命 → 予備（混雑・回数制限のときに回す）
  PHOTO_FOLDER: '出荷チェック写真',
  PROP_PHOTO_FOLDER: 'work.markPhotoFolderId',
  LOG_SHEET: 'マーク照合',
  LOG_HEADERS: ['日時', '名前', '指図書', '判定', '写真の商店名', '指図書の商店名', '写真の電話', '指図書の電話', 'ロゴ', '理由', '写真ID', 'モデル', '記録ID'],
  MAX_PHOTO_CHARS: 6 * 1024 * 1024   // base64 で 6MB まで（画面で長辺1600pxに縮めて送るので、ふつうは数百KB）
};

var WMARK_PROMPT = [
  'あなたはLPガス容器の出荷検査の担当です。',
  '1つ目の資料は「出荷作業指図書」のPDFです。1ページ目に「商店名」と、容器に刷り込むマークの絵',
  '（ロゴ・社章、名称、電話番号など。「マーク内容はこの破線より下に記載ください」の下）があります。',
  '2つ目は、現品の容器に刷り込まれたマークを撮った写真です。',
  '写真のマークが、指図書のマークの内容（商店名・ロゴ／社章・電話番号）と合っているかを判定してください。',
  '・商店名は表記の揺れ（全角半角、株式会社の有無、英字の大文字小文字）は同じとみなす。',
  '・電話番号は数字だけで比べる。写真に写っていなければ空にする。',
  '・ロゴ・社章は形と文字が同じかで見る。色の違い（写真の写り）は問わない。',
  '・写真がぼやけている、マークが写っていない、など判断できないときは「読めない」。',
  '・1つでも違うものがあれば「違う」にして、どこが違うかを reason に短く書く。',
  'reason は日本語で、現場の人に分かる言葉で1〜2文。'
].join('\n');

var WMARK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    result: { type: 'STRING', enum: ['一致', '違う', '読めない'] },
    photoShop: { type: 'STRING' },   // 写真から読んだ商店名
    docShop: { type: 'STRING' },     // 指図書の商店名
    photoTel: { type: 'STRING' },
    docTel: { type: 'STRING' },
    logo: { type: 'STRING', enum: ['合う', '違う', 'わからない'] },
    reason: { type: 'STRING' }
  },
  required: ['result', 'photoShop', 'docShop', 'logo', 'reason'],
  propertyOrdering: ['result', 'photoShop', 'docShop', 'photoTel', 'docTel', 'logo', 'reason']
};

// ===== 設定 =====

/* 画面用：照合が使えるか（キーが入っているか）と、キーを入れられる人か */
function getMarkAiStatus() {
  var props = PropertiesService.getScriptProperties();
  return { hasKey: !!props.getProperty(WMARK_CONFIG.PROP_KEY), canSetKey: wmark_isOwner_() };
}

/* キーを入れる（スクリプトの持ち主だけ）。空なら消す */
function setMarkAiKey(key) {
  if (!wmark_isOwner_()) throw new Error('キーを入れられるのはスクリプトの持ち主だけです');
  var k = String(key || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (!k) props.deleteProperty(WMARK_CONFIG.PROP_KEY);
  else {
    if (!/^[A-Za-z0-9_\-]{20,}$/.test(k)) throw new Error('キーの形が違います');
    props.setProperty(WMARK_CONFIG.PROP_KEY, k);
  }
  return getMarkAiStatus();
}

function wmark_isOwner_() {
  try {
    var me = Session.getActiveUser().getEmail();
    var owner = Session.getEffectiveUser().getEmail();
    return !!me && me === owner;
  } catch (e) { return false; }
}

// ===== 照合 =====

/* 画面から：マークの写真を照合する。
   req = { key: 指図書（依頼No-枝番(版)）, name: 記録する人, image: base64(JPEG), mime } */
function checkMarkPhoto(req) {
  req = req || {};
  var key = String(req.key || '').trim();
  if (!/^\d{2}-\d+-\d+(\(\d+\))?$/.test(key)) throw new Error('指図書が不明です: ' + key);
  var name = work_requireStaff_(req.name);
  if (!PropertiesService.getScriptProperties().getProperty(WMARK_CONFIG.PROP_KEY)) {
    throw new Error('AIのキー（GEMINI_API_KEY）がまだ入っていません。設定してから撮ってください');
  }
  var img = String(req.image || '').replace(/^data:[^,]*,/, '');
  if (!img) throw new Error('写真がありません');
  if (img.length > WMARK_CONFIG.MAX_PHOTO_CHARS) throw new Error('写真が大きすぎます');
  var mime = /^image\/(jpeg|png|webp|heic)$/.test(req.mime || '') ? req.mime : 'image/jpeg';

  var order = wmark_findOrder_(key);
  if (!order) throw new Error('指図書が見つかりません（' + key + '）。少し待って読み直してください');
  if (!order.pdfId) throw new Error('指図書のPDFが見つかりません（' + key + '）');

  // 写真は判定の前に保存する（AIが失敗しても写真は残る）
  var photo = wmark_savePhoto_(key, img, mime);
  var pdf = DriveApp.getFileById(order.pdfId).getBlob();
  var out;
  try {
    out = wmark_callGemini_(WMARK_PROMPT + '\n\nこの指図書の依頼No: ' + key + '、出荷先: ' + (order.dest || '不明'),
      [{ mime: 'application/pdf', data: Utilities.base64Encode(pdf.getBytes()) }, { mime: mime, data: img }]);
  } catch (e) {
    wmark_log_([work_now_(), name, key, 'エラー', '', '', '', '', '', String(e && e.message || e), photo.id, '', '']);
    throw e;
  }
  var v = wmark_normalize_(out.json);

  // 一致ならそのままマークを記録する（二度押しは recordShipStep が足さない）
  var recId = '';
  var data = null;
  if (v.result === '一致') {
    data = recordShipStep({ key: key, step: 'マーク', name: name, qty: order.qty, memo: '写真照合:一致 写真:' + photo.id });
    var it = wmark_item_(data, key);
    recId = it && it.mark ? it.mark.id : '';
  }
  wmark_log_([work_now_(), name, key, v.result, v.photoShop, v.docShop, v.photoTel, v.docTel, v.logo, v.reason, photo.id, out.model, recId]);
  return { key: key, verdict: v, photoId: photo.id, photoUrl: photo.url, recorded: !!recId, progress: data };
}

/* AIの答えをそろえる（純関数）。知らない値は「読めない」に倒す */
function wmark_normalize_(j) {
  j = j || {};
  var s = function (x) { return String(x == null ? '' : x).trim(); };
  var result = ['一致', '違う', '読めない'].indexOf(s(j.result)) >= 0 ? s(j.result) : '読めない';
  var logo = ['合う', '違う', 'わからない'].indexOf(s(j.logo)) >= 0 ? s(j.logo) : 'わからない';
  // ★ 電話番号が両方読めていて数字が違うのに「一致」と言ってきたら、違うに直す（AIの言い間違いの保険）
  var digits = function (x) { return s(x).replace(/\D/g, ''); };
  var pt = digits(j.photoTel), dt = digits(j.docTel);
  var reason = s(j.reason);
  if (result === '一致' && pt && dt && pt !== dt) { result = '違う'; reason = '電話番号が違います（写真 ' + s(j.photoTel) + '／指図書 ' + s(j.docTel) + '）。' + reason; }
  if (result === '一致' && logo === '違う') { result = '違う'; reason = 'ロゴ・社章が違います。' + reason; }
  return { result: result, photoShop: s(j.photoShop), docShop: s(j.docShop), photoTel: s(j.photoTel), docTel: s(j.docTel), logo: logo, reason: reason };
}

function wmark_item_(progress, key) {
  var all = [];
  ((progress && progress.days) || []).forEach(function (g) { all = all.concat(g.items || []); });
  return all.filter(function (o) { return o.key === key; })[0] || null;
}

function wmark_findOrder_(key) {
  var base = getShipProgressBase(false);
  var hit = (base.orders || []).filter(function (o) { return o.key === key; })[0];
  if (hit) return hit;
  base = getShipProgressBase(true);   // 取り込んだばかりの指図書かもしれないので、一度だけ作り直す
  return (base.orders || []).filter(function (o) { return o.key === key; })[0] || null;
}

// ===== 写真・記録 =====

function wmark_photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(WMARK_CONFIG.PROP_PHOTO_FOLDER);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 消されていたら作り直す */ } }
  // 置場容量のスプレッドシートと同じフォルダに作る
  var ssFile = DriveApp.getFileById(yardGetSpreadsheet_().getId());
  var parents = ssFile.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var it = parent.getFoldersByName(WMARK_CONFIG.PHOTO_FOLDER);
  var f = it.hasNext() ? it.next() : parent.createFolder(WMARK_CONFIG.PHOTO_FOLDER);
  props.setProperty(WMARK_CONFIG.PROP_PHOTO_FOLDER, f.getId());
  return f;
}

function wmark_savePhoto_(key, b64, mime) {
  var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/heic' ? 'heic' : 'jpg';
  var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, key + '_マーク_' + stamp + '.' + ext);
  var f = wmark_photoFolder_().createFile(blob);
  return { id: f.getId(), url: 'https://drive.google.com/file/d/' + f.getId() + '/view' };
}

function wmark_log_(row) {
  try {
    var sh = work_sheet_(WMARK_CONFIG.LOG_SHEET, WMARK_CONFIG.LOG_HEADERS);
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row.map(function (x) { return x == null ? '' : String(x); })]);
  } catch (e) { Logger.log('マーク照合の記録に失敗: ' + e); }
}

// ===== Gemini =====

/* parts = [{mime, data(base64)}]。答えは { json, model }。
   混雑（503）・回数制限（429）・モデルが無い（404）なら予備のモデルへ回す。 */
function wmark_callGemini_(prompt, parts) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(WMARK_CONFIG.PROP_KEY);
  if (!key) throw new Error('AIのキー（GEMINI_API_KEY）がまだ入っていません。設定してから撮ってください');
  var models = [props.getProperty(WMARK_CONFIG.PROP_MODEL)].concat(WMARK_CONFIG.MODELS)
    .filter(function (m, i, a) { return m && a.indexOf(m) === i; });
  var body = {
    contents: [{ role: 'user', parts: parts.map(function (p) { return { inline_data: { mime_type: p.mime, data: p.data } }; })
      .concat([{ text: prompt }]) }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: WMARK_SCHEMA }
  };
  var payload = JSON.stringify(body);
  var last = '';
  for (var i = 0; i < models.length; i++) {
    var model = models[i];
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key }, payload: payload
    });
    var code = res.getResponseCode();
    var json = {};
    try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) { json = {}; }
    if (code === 200) {
      var cand = (json.candidates || [])[0];
      if (!cand || !cand.content) throw new Error('AIが答えを返しませんでした（' + ((cand && cand.finishReason) || '不明') + '）');
      var text = (cand.content.parts || []).map(function (p) { return p.text || ''; }).join('');
      return { json: JSON.parse(text), model: model };
    }
    var msg = (json.error && ((json.error.status || '') + ' ' + (json.error.message || ''))) || '';
    last = model + ' → ' + code + ' ' + msg.slice(0, 120);
    if (code === 400 || code === 401 || code === 403) throw new Error('AIの照合でエラー（' + last + '）');
    // 429・503・404・500 は次のモデルへ
  }
  throw new Error('AIが混み合っています。少し待って撮り直してください（' + last + '）');
}
