/**
 * 野田組 業務ダッシュボード — キャッシュの先読み（開く前に作っておく）
 * ------------------------------------------------------------------
 * ★ なぜ要るのか
 *   画面を開くと11本の集計を呼ぶ。どれもキャッシュ（5〜15分）があれば一瞬だが、
 *   期限が切れていると Drive・CSV・PDF・スプレッドシートを読み直すので数秒〜
 *   十数秒かかる。しかも画面は全部そろうまで出さないので、一番遅いものを待つ。
 *   開くのは数十分おきなので、ほぼ毎回「期限切れ」から作り直していた。
 *   → 10分おきに、人が開く前に作っておく。人は作り置きを受け取るだけになる。
 *
 * ★ どれを、どのくらいの間隔で作り直すか
 *   ・すぐ変わるもの（指図書の数・当日の配車・配車表・ヤードマップ・アーム予定）
 *     … 毎回（10分おき）。キャッシュの期限は25分。
 *   ・1日1回しか変わらないもの（在庫CSV・計画表・推移・月次・生産計画）
 *     … 30分おき。キャッシュの期限は60分。
 *   期限を作り直しの間隔より長くしてあるので、動いている時間帯は切れ目が無い。
 *   画面から直したもの（配車・ヤード）は今までどおり直した時点で捨てて作り直す。
 *
 * ★ 動かす時間帯は 6時〜21時。夜は回さない（実行時間の節約）。
 *   そのかわり20時台に作る控えは6時間近くもたせる（夜に開いても待たされないように。2026/10/25）。
 *
 * ★ トリガーは自分で張る。1時間ごとの harvestDailyData の頭で
 *   warm_ensureTrigger_() を呼ぶので、GASエディタで何かを実行する必要はない。
 *
 * 名前の衝突に注意：内部関数はすべて warm_ 接頭辞。
 */

var WARM_CONFIG = {
  HANDLER: 'warmDashboardCaches',
  EVERY_MIN: 10,
  FROM_HOUR: 6,     // この時から
  TO_HOUR: 21,      // この時の前まで
  SLOW_AGE_MIN: 25, // 1日1回しか変わらないものは、作ってからこれだけ経ったら作り直す
  BUDGET_MS: 4.5 * 60 * 1000,
  /* 夜の最後の回（TO_HOUR の前の1時間）に作る控えは、これだけもたせる（CacheServiceの上限は6時間）。
     20時台に作ったものが夜中の2〜3時ごろまで残るので、夜に開いても待たされない。
     そのあと朝6時までは誰も見ないので空いてよい（開けば作り直す）。 */
  NIGHT_TTL_SEC: 21000,
  LAST_RUN_MINUTE: 50,  // 20時50分より後の回は、1日1回のものも含めて全部作り直して長くもたせる
  PROP: 'warm.builtAt'
};

/* 作り直すものの一覧。名前は記録用。slow:true は30分おきでよいもの。 */
function warm_jobs_() {
  return [
    { name: '在庫',           slow: true,  run: function () { return getInventoryDashboardData(true); } },
    { name: '指図書',         slow: false, run: function () { return getShippingDashboardData(true); } },
    { name: '受注出荷計画',   slow: true,  run: function () { return getOrderPlanDashboardData(true); } },
    { name: '当日の配車',     slow: false, run: function () { return getDispatchTodayData(true); } },
    { name: '在庫推移',       slow: true,  run: function () { return getInventoryTrendData(true); } },
    { name: '月次',           slow: true,  run: function () { return getMonthlyCombinedData(true); } },
    { name: '配車表',         slow: false, run: function () { return getDispatchGridData(true, 0); } },
    { name: 'アーム予定',     slow: false, run: function () { return getArmShipPlan(true); } },
    { name: 'アーム月別',     slow: true,  run: function () { return getArmMonthlyData(true); } },
    { name: 'ヤードマップ',   slow: false, run: function () {
        var q = warm_yardQueries_();
        return getYardMapUpdatesBothWithOrderText(q['50k'], q['20k'], true);
      } },
    { name: '生産計画',       slow: true,  run: function () { return getProdPlanData(true); } },
    { name: '出荷の進捗',     slow: false, run: function () { return getShipProgressBase(true); } }
  ];
}

/* 画面は静的な区画の一覧（位置ラベル）を渡してくる。サーバ側では入込場マスタの
   索引（更新用一覧）にある位置を全部渡す。画面の区画は全部ここに載っているので、
   画面が必要なぶんは必ず含まれる（結果は位置ラベルで引かれる）。 */
function warm_yardQueries_() {
  var out = {};
  ['50k', '20k'].forEach(function (k) {
    out[k] = yard_readRefRows_(k).map(function (r) { return { pos: String(r.pos) }; });
  });
  return out;
}

// ===== トリガーから呼ばれる =====
function warmDashboardCaches() {
  var h = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));
  if (h < WARM_CONFIG.FROM_HOUR || h >= WARM_CONFIG.TO_HOUR) return { skipped: '時間外' };
  if (h === WARM_CONFIG.TO_HOUR - 1) {
    // 夜の最後の1時間：控えを長くもたせる。最後の回は全部作り直す（1日1回のものも長い期限で置き直す）
    NC_TTL_FLOOR_SEC = WARM_CONFIG.NIGHT_TTL_SEC;
    var m = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'm'));
    return warm_run_(m >= WARM_CONFIG.LAST_RUN_MINUTE);
  }
  return warm_run_(false);
}

/* 作り直す。all=true なら間隔に関係なく全部。結果は1件ずつの所要時間と大きさ。 */
function warm_run_(all) {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var builtAt = {};
  try { builtAt = JSON.parse(props.getProperty(WARM_CONFIG.PROP) || '{}'); } catch (e) { builtAt = {}; }

  var report = [];
  warm_jobs_().forEach(function (job) {
    if (Date.now() - started > WARM_CONFIG.BUDGET_MS) {
      report.push({ name: job.name, skipped: '時間切れ' });
      return;
    }
    var age = builtAt[job.name] ? (started - builtAt[job.name]) / 60000 : Infinity;
    if (!all && job.slow && age < WARM_CONFIG.SLOW_AGE_MIN) {
      report.push({ name: job.name, skipped: 'まだ新しい' });
      return;
    }
    var t0 = Date.now();
    try {
      var d = job.run();
      var err = d && typeof d === 'object' ? d.error : null;
      var size = 0;
      try { size = JSON.stringify(d).length; } catch (e2) { size = -1; }
      report.push({ name: job.name, ms: Date.now() - t0, size: size, error: err || null });
      if (!err) builtAt[job.name] = Date.now();
    } catch (e) {
      report.push({ name: job.name, ms: Date.now() - t0, error: String(e) });
    }
  });

  try { props.setProperty(WARM_CONFIG.PROP, JSON.stringify(builtAt)); } catch (e3) { /* 記録だけなので無視 */ }
  return { ms: Date.now() - started, items: report };
}

/* トリガーが無ければ張る。harvestDailyData の頭で毎時呼ばれる。 */
function warm_ensureTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === WARM_CONFIG.HANDLER;
  });
  if (has) return false;
  ScriptApp.newTrigger(WARM_CONFIG.HANDLER).timeBased().everyMinutes(WARM_CONFIG.EVERY_MIN).create();
  Logger.log('キャッシュの先読みトリガーを張りました（' + WARM_CONFIG.EVERY_MIN + '分おき）');
  return true;
}

// ===== 公開関数：手で確かめる =====
/* 全部を作り直して、1つずつ何秒かかったか・どのくらいの大きさかを出す。
   「どれが遅いのか」を見るため。作り直すだけで、データは何も書き換えない。 */
function 表示の速さを測る() {
  warm_ensureTrigger_();
  var r = warm_run_(true);
  Logger.log('全部で ' + (r.ms / 1000).toFixed(1) + '秒');
  r.items.slice().sort(function (a, b) { return (b.ms || 0) - (a.ms || 0); }).forEach(function (x) {
    Logger.log('  ' + x.name + '  ' +
      (x.skipped ? x.skipped : (x.ms / 1000).toFixed(1) + '秒  ' + Math.round((x.size || 0) / 1000) + '千文字') +
      (x.error ? '  エラー: ' + x.error : ''));
  });
  return r;
}
