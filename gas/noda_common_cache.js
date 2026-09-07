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
  // CacheService の1キーあたりの上限は約100KB。超えると put が例外を投げるため、
  // 余裕をみてこのサイズを超えるものはキャッシュせず素通しにする。
  MAX_BYTES: 90000
};

/**
 * producer() の結果をキャッシュ経由で返す。
 * @param {string} name    キャッシュ名（エンジンごとに一意）
 * @param {boolean} force  true ならキャッシュを無視して取り直す（更新ボタン用）
 * @param {number} ttlSec  キャッシュの有効秒数
 * @param {function} producer 実際の集計を行う関数
 */
function nc_cached_(name, force, ttlSec, producer) {
  var key = NC_CACHE_CONFIG.PREFIX + name;
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
  } catch (err) {
    // キャッシュが使えない環境でも集計自体は動くようにする
    Logger.log('CacheService取得エラー(' + name + '): ' + String(err));
  }

  if (cache && !force) {
    var hit = null;
    try { hit = cache.get(key); } catch (err) { hit = null; }
    if (hit) {
      try {
        var cachedObj = JSON.parse(hit);
        cachedObj.cached = true;
        return cachedObj;
      } catch (err) {
        // 壊れたキャッシュは捨てて取り直す
        Logger.log('キャッシュのJSON解析に失敗したため取り直します(' + name + ')');
      }
    }
  }

  var data = producer();

  // エラー結果はキャッシュしない（次回すぐ再試行できるように）
  if (cache && data && !data.error) {
    try {
      var s = JSON.stringify(data);
      if (s.length <= NC_CACHE_CONFIG.MAX_BYTES) {
        cache.put(key, s, ttlSec);
      } else {
        Logger.log('キャッシュ保存をスキップ：' + name + ' が ' + s.length +
                   'バイトで上限(' + NC_CACHE_CONFIG.MAX_BYTES + ')を超過');
      }
    } catch (err) {
      Logger.log('キャッシュ保存エラー(' + name + '): ' + String(err));
    }
  }

  if (data) data.cached = false;
  return data;
}

/**
 * ダッシュボードのキャッシュを全部消す（公開関数）。
 * 「データがおかしい・古いまま」というときに、GASエディタから実行するか
 * フロントの更新ボタン（force指定）で取り直せば足りるが、手動で消したい場合用。
 */
function clearDashboardCache() {
  var names = ['inventory', 'shipping', 'orderPlan', 'dispatch',
               'shipActuals', 'inventoryTrend'];
  var keys = names.map(function (n) { return NC_CACHE_CONFIG.PREFIX + n; });
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
