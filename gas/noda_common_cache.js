/**
 * 野田組 業務ダッシュボード — ダッシュボード集計の共通キャッシュ (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：在庫・出荷・受注・配車の各集計は、毎回Drive/CSV/PDFを読み直しており
 *       （フロントは5分ごとに自動更新するので、その頻度で読み直していた）、
 *       表示のもたつきの主因になっていた。ヤードのPDF検索で効果が出た
 *       CacheService方式を、4つの集計にも共通で適用する。
 *
 * ★ 名前の衝突に注意
 *   GASは全ファイルが同一のグローバルスコープで、エディタのファイル順に
 *   評価されるため、同名関数を複数ファイルに置くと最後の定義が勝つ。
 *   このファイルの関数は nc_ 接頭辞（noda common）で、他ファイルと重複しない。
 *
 * 使い方（各エンジン側）：
 *   function getXxxDashboardData(force) {
 *     return nc_cached_('xxx', force, 900, getXxxDashboardData_uncached_);
 *   }
 *
 * 戻り値には cached: true/false が付くので、フロントで「キャッシュ表示中」の
 * 判別ができる（updated はキャッシュされた時点の時刻がそのまま入る）。
 */

var NC_CACHE_CONFIG = {
  PREFIX: 'nodaDash_',

  /**
   * ★ キャッシュの世代番号。返すデータの形（項目の増減・意味の変更）を変えたら
   *   必ず1つ増やすこと。
   *
   *   実際に起きた不具合：月次グラフを年度（4月始まり）に絞る変更を公開した直後、
   *   画面には古い形のデータが出続けた。キーが同じなので、公開前に入った
   *   キャッシュがそのまま返っていたため。最大15分、直したはずの画面が
   *   直らないという状態になり、原因の切り分けも紛らわしい。
   *   キーに世代番号を混ぜておけば、公開した瞬間から新しい形が返る。
   *
   *   有効期限を短くするのは解にならない（毎回読み直すと重くなる）。
   *   世代番号なら、形を変えたときだけ作り直せる。
   */
  VERSION: 2,

  /* CacheService の1キーあたりの上限は約100KB。
     ★ 以前は「90,000文字を超えたらキャッシュしない」にしていた。これだと大きい
       データ（ヤードマップなど）は一度もキャッシュされず、開くたびに作り直して
       いた。しかも日本語は1文字3バイトなので、90,000文字未満でも put が例外に
       なって黙って置けていないことがあった。
     → 30,000文字ずつに分けて置く（日本語だけでも90KBに収まる）。 */
  CHUNK_CHARS: 30000,
  MAX_CHUNKS: 40          // 120万文字まで。それより大きいものは置かない
};

/**
 * キャッシュのキーを組み立てる（世代番号込み）。
 * ★ キーを作る場所はここ1か所だけにすること。
 *   以前は 'nodaDash_shipActuals' のように直接書いた箇所が2つあり、
 *   世代番号を入れたときに消し忘れの原因になりかけた。
 */
function nc_cacheKey_(name) {
  return NC_CACHE_CONFIG.PREFIX + 'v' + NC_CACHE_CONFIG.VERSION + '_' + name;
}

/**
 * 特定のキャッシュを1つ捨てる（データを書き換えた直後に使う）。
 * 世代番号を意識しなくて済むよう、この関数を通すこと。
 */
function nc_forget_(name) {
  try {
    CacheService.getScriptCache().remove(nc_cacheKey_(name));
  } catch (err) {
    Logger.log('キャッシュ削除に失敗(' + name + '): ' + String(err));
  }
}

/** まとめて捨てる（1つずつ remove すると呼び出しが増えるため）。 */
function nc_forgetMany_(names) {
  try {
    CacheService.getScriptCache().removeAll((names || []).map(nc_cacheKey_));
  } catch (err) {
    Logger.log('キャッシュ削除に失敗(' + (names || []).length + '件): ' + String(err));
  }
}

/**
 * producer() の結果をキャッシュ経由で返す。
 * @param {string} name    キャッシュ名（エンジンごとに一意）
 * @param {boolean} force  true ならキャッシュを無視して取り直す（更新ボタン用）
 * @param {number} ttlSec  キャッシュの有効秒数
 * @param {function} producer 実際の集計を行う関数
 */
function nc_cached_(name, force, ttlSec, producer) {
  if (!force) {
    var hit = nc_peek_(name);
    if (hit) return hit;
  }
  var data = producer();
  nc_put_(name, data, ttlSec);
  if (data) data.cached = false;
  return data;
}

/**
 * キャッシュにあれば返す。無ければ null（作りには行かない）。
 * ★ 1回の読み取りで複数のキーを作りたいとき（配車グリッドの前後の週など）に、
 *   「もう有るか」を確かめるために要る。
 */
function nc_peek_(name) {
  var cache;
  try { cache = CacheService.getScriptCache(); } catch (err) {
    Logger.log('CacheService取得エラー(' + name + '): ' + String(err));
    return null;
  }
  var hit = null;
  try { hit = cache.get(nc_cacheKey_(name)); } catch (err) { hit = null; }
  if (!hit) return null;
  try {
    var obj = JSON.parse(hit);
    // 分けて置いたもの：目印だけが入っているので、続きを集めてつなぐ
    if (obj && typeof obj === 'object' && obj.__ncChunks) {
      var keys = nc_chunkKeys_(nc_cacheKey_(name), obj.id, obj.__ncChunks);
      var got = cache.getAll(keys);
      var parts = [];
      for (var i = 0; i < keys.length; i++) {
        if (got[keys[i]] == null) return null;   // 1つでも欠けていたら無かったことにする
        parts.push(got[keys[i]]);
      }
      obj = JSON.parse(parts.join(''));
    }
    if (obj && typeof obj === 'object') obj.cached = true;
    return obj;
  } catch (err) {
    // 壊れたキャッシュは捨てて取り直す
    Logger.log('キャッシュのJSON解析に失敗したため取り直します(' + name + ')');
    return null;
  }
}

/** 作った結果をキャッシュに置く。エラー結果と大きすぎるものは置かない。 */
function nc_put_(name, data, ttlSec) {
  if (!data || data.error) return false;   // エラーは次回すぐ再試行できるように残さない
  var cache;
  try { cache = CacheService.getScriptCache(); } catch (err) {
    Logger.log('CacheService取得エラー(' + name + '): ' + String(err));
    return false;
  }
  try {
    var s = JSON.stringify(data);
    var key = nc_cacheKey_(name);
    if (s.length <= NC_CACHE_CONFIG.CHUNK_CHARS) {
      cache.put(key, s, ttlSec);
      return true;
    }
    var parts = nc_splitChunks_(s, NC_CACHE_CONFIG.CHUNK_CHARS);
    if (parts.length > NC_CACHE_CONFIG.MAX_CHUNKS) {
      Logger.log('キャッシュ保存をスキップ：' + name + ' が ' + s.length + '文字で大きすぎる');
      return false;
    }
    /* ★ 置くたびに別の名前（id）で置く。前の回の切れ端と混ざらないように。
         目印は最後に置く。目印があるなら切れ端はもう全部置けている。
         切れ端は目印より少し長く残す（目印だけ残って切れ端が消えた、を避ける）。 */
    var id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    var keys = nc_chunkKeys_(key, id, parts.length);
    var map = {};
    for (var i = 0; i < keys.length; i++) map[keys[i]] = parts[i];
    cache.putAll(map, Math.min(21600, ttlSec + 120));
    cache.put(key, JSON.stringify({ __ncChunks: parts.length, id: id }), ttlSec);
    return true;
  } catch (err) {
    Logger.log('キャッシュ保存エラー(' + name + '): ' + String(err));
    return false;
  }
}

/* いくつものキャッシュを、まとめて2回の読み出しで取る（目印→切れ端）。
   無いものは入れない。 */
function nc_peekMany_(names) {
  var out = {};
  var cache;
  try { cache = CacheService.getScriptCache(); } catch (err) { return out; }
  var keys = names.map(nc_cacheKey_);
  var got = {};
  try { got = cache.getAll(keys) || {}; } catch (err2) { return out; }
  var need = [];
  var heads = {};
  names.forEach(function (n, i) {
    var raw = got[keys[i]];
    if (raw == null) return;
    try {
      var obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && obj.__ncChunks) {
        heads[n] = nc_chunkKeys_(keys[i], obj.id, obj.__ncChunks);
        need = need.concat(heads[n]);
      } else {
        if (obj && typeof obj === 'object') obj.cached = true;
        out[n] = obj;
      }
    } catch (e) { /* 壊れていたら無いことにする */ }
  });
  if (need.length) {
    var parts = {};
    try { parts = cache.getAll(need) || {}; } catch (e3) { parts = {}; }
    Object.keys(heads).forEach(function (n) {
      var ks = heads[n];
      for (var i = 0; i < ks.length; i++) if (parts[ks[i]] == null) return;
      try {
        var obj = JSON.parse(ks.map(function (k) { return parts[k]; }).join(''));
        if (obj && typeof obj === 'object') obj.cached = true;
        out[n] = obj;
      } catch (e4) { /* 無いことにする */ }
    });
  }
  return out;
}

/* ★ 画面を開いたときに、作り置き（先読み）してあるものを1回でまとめて返す。
     今までは11本を別々に呼んでいて、1本ごとにGASの起動の待ちがかかっていた。
     ここでは作らない（キャッシュを見るだけ）。無かったものは missing で返し、
     画面がそれだけを今までどおり1本ずつ取りに行く。 */
var NC_BUNDLE_KEYS = {
  inventory: 'inventory', shipping: 'shipping', orderPlan: 'orderPlan', dispatch: 'dispatch',
  invTrend: 'inventoryTrend', monthly: 'monthlyCombined', dispGrid: 'dispatchGrid_0',
  armPlan: 'armPlan', armMonthly: 'armMonthly', yardMap: 'yardMapBoth', plan: 'prodPlan3'
};

function getDashboardBundle() {
  var names = Object.keys(NC_BUNDLE_KEYS).map(function (k) { return NC_BUNDLE_KEYS[k]; });
  var hit = nc_peekMany_(names);
  var data = {}, missing = [];
  Object.keys(NC_BUNDLE_KEYS).forEach(function (k) {
    var v = hit[NC_BUNDLE_KEYS[k]];
    if (v != null) data[k] = v; else missing.push(k);
  });
  return { data: data, missing: missing };
}

function nc_chunkKeys_(key, id, n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(key + '#' + id + '#' + i);
  return out;
}

/* 文字列を n 文字ずつに分ける。サロゲートペア（絵文字など）の途中では切らない
   （半分ずつに分かれた文字は、置いたときに別の文字に化ける）。 */
function nc_splitChunks_(s, n) {
  var out = [];
  var i = 0;
  while (i < s.length) {
    var end = Math.min(s.length, i + n);
    if (end < s.length) {
      var c = s.charCodeAt(end - 1);
      if (c >= 0xD800 && c <= 0xDBFF) end--;
    }
    out.push(s.substring(i, end));
    i = end;
  }
  return out;
}

/**
 * ダッシュボードのキャッシュを全部消す（公開関数）。
 * 「データがおかしい・古いまま」というときに、GASエディタから実行するか
 * フロントの更新ボタン（force指定）で取り直せば足りるが、手動で消したい場合用。
 */
function clearDashboardCache() {
  var names = ['inventory', 'shipping', 'orderPlan', 'dispatch',
               'shipActuals', 'inventoryTrend', 'monthlyCombined', 'dispatchMonthly'];
  // 今の世代ぶんに加えて、古い世代のキーも消しておく（消し漏れが残らないように）
  var keys = [];
  names.forEach(function (n) {
    for (var v = 1; v <= NC_CACHE_CONFIG.VERSION; v++) {
      keys.push(NC_CACHE_CONFIG.PREFIX + 'v' + v + '_' + n);
    }
    keys.push(NC_CACHE_CONFIG.PREFIX + n);   // 世代番号を入れる前のキー
  });
  try {
    CacheService.getScriptCache().removeAll(keys);
    Logger.log('ダッシュボードのキャッシュを削除しました: ' + names.join(', '));
    return { ok: true, cleared: names };
  } catch (err) {
    Logger.log('キャッシュ削除エラー: ' + String(err));
    return { ok: false, error: String(err) };
  }
}

/**
 * シートのセルを「日付の文字列」に直す（内部共通）。
 *
 * ★ なぜ必要か（実際にハマった）
 *   シートに '2026-07' や '2026-08-17' を文字列として書き込んでも、
 *   Googleスプレッドシートが勝手に日付として解釈して保存する。
 *   そのため getValues() で読み戻すと Date オブジェクトになっていて、
 *   String() すると
 *     "Mon Jun 01 2026 00:00:00 GMT+0900 (日本標準時)"
 *   という長い文字列になる。これが画面にそのまま出てしまっていた。
 *   さらに、この文字列でsortすると曜日名のアルファベット順に並ぶので、
 *   日付順に並べたつもりが並んでいないという二重の不具合になる。
 *
 * Date型なら指定の書式に整え、そうでなければ文字列にして返す。
 * @param {*} v セルの値
 * @param {string} fmt 'yyyy-MM' や 'yyyy-MM-dd' など
 * @return {string} 整えた文字列（空セルは ''）
 */
function nc_dateText_(v, fmt) {
  if (v === null || v === undefined || v === '') return '';
  // instanceof だけに頼らず、getTime を持つかでも判定する
  if (v instanceof Date || (typeof v === 'object' && v && typeof v.getTime === 'function')) {
    var t = v.getTime();
    if (isNaN(t)) return '';
    return Utilities.formatDate(v, 'Asia/Tokyo', fmt);
  }
  return String(v);
}
