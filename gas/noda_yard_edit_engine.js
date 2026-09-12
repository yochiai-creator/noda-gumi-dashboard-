/**
 * 野田組 業務ダッシュボード — ヤードマップ書き込みエンジン (Google Apps Script)
 * （★2026/08 修正版：出荷希望日の非対称同期バグを修正）
 */

var YARD_EDIT_CONFIG = {
  FILE_ID_50K: '1ZEl7LvnU-QrVgtv7XdBX2oY52eHNiOBF2qx-NqlMMe4',
  FILE_ID_20K: '1IgMpP-whM0N5lnE370HYEgIGDZLtcL2pap3Qbyc0nMA',
  MAX_SEARCH_ROW: 100,
  REF_SHEET_NAME: '更新用一覧'
};

var YARD_REF_SEED_50K = [
  ["20", 436, 43501, 43600, 100],
  ["21", 480, 47901, 48000, 100],
  ["29", 472, 47101, 47200, 100],
  ["30", 450, 44901, 45000, 100],
  ["1", 463, 46201, 46300, 100],
  ["2", 464, 46301, 46400, 100],
  ["3", 122, 12101, 12200, null],
  ["19", 478, 47701, 47800, 100],
  ["28", 112, 11101, 11200, 100],
  ["31", 451, 45001, 45100, 100],
  ["27", 114, 11301, 11400, 100],
  ["32", 452, 45101, 45200, 100],
  ["17", 113, 11201, 11300, 100],
  ["23", 459, 45801, 45900, 100],
  ["25", 460, 45901, 46000, 100],
  ["16", 466, 46501, 46600, 100],
  ["4", 465, 46401, 46500, 100],
  ["15", 467, 46601, 46700, 100],
  ["24", 454, 45301, 45400, 100],
  ["26", 121, 12001, 12100, null],
  ["5", 455, 45401, 45500, 100],
  ["13", 115, 11401, 11500, 100],
  ["12", 116, 11501, 11600, 100],
  ["11", 118, 11701, 11800, 100],
  ["10", 117, 11601, 11700, 100],
  ["9", 119, 11801, 11900, 100],
  ["6", 439, 43801, 43900, 100],
  ["7", 435, 43401, 43500, 100],
  ["8", 421, 42001, 42100, 100],
  ["18", 458, 45701, 45800, 100],
  ["22", 437, 43601, 43700, 100]
];

var YARD_REF_SEED_20K = [
  ["1", 920, 95951, 96000, 50],
  ["2", 919, 95901, 95950, 50],
  ["3", 622, 81051, 81100, 50],
  ["4", 621, 81001, 81050, 50],
  ["5", 624, 81151, 81200, 50],
  ["6", 623, 81101, 81150, 50],
  ["7", 688, 84351, 84400, 50],
  ["8", 687, 84301, 84350, 50],
  ["9", 686, 84251, 84300, 50],
  ["10", 667, 83301, 83350, 50],
  ["11", 626, 81251, 81300, 50],
  ["12", 625, 81201, 81250, 50],
  ["13", 690, 84451, 84500, 50],
  ["14", 689, 84401, 84450, 50],
  ["15", 608, 80351, 80400, 50],
  ["16", 607, 80301, 80350, 50],
  ["17", null, null, null, 40],
  ["18", 666, 83261, 83300, 40],
  ["19", 617, 80801, 80850, 50],
  ["20", 618, 80851, 80900, 50],
  ["21", 619, 80901, 80950, 50],
  ["22", 620, 80951, 81000, 50],
  ["23", 696, 84751, 84800, 50],
  ["24", 695, 84701, 84750, 50],
  ["25", 656, 82751, 82800, 40],
  ["26", null, null, null, null],
  ["27", 694, 84651, 84700, 50],
  ["28", 693, 84601, 84650, 50],
  ["29", 692, 84551, 84600, 50],
  ["30", 691, 84501, 84550, 50],
  ["31", 643, 82101, 82150, 50],
  ["32", 644, 82151, 82200, 50],
  ["33", 645, 82201, 82250, 50],
  ["34", 646, 82251, 82300, 50],
  ["35", 647, 82301, 82350, 50],
  ["36", 648, 82351, 82400, 50],
  ["37", 702, 85051, 85100, 50],
  ["38", 701, 85001, 85050, 50],
  ["39", 698, 84851, 84900, 50],
  ["40", 697, 84801, 84850, 50],
  ["41", 616, 80751, 80800, 50],
  ["42", 615, 80701, 80750, 50],
  ["43", 670, 83451, 83500, 50],
  ["44", 669, 83401, 83450, 50],
  ["45", 628, 81351, 81400, 50],
  ["46", 627, 81301, 81350, 50],
  ["47", 630, 81451, 81500, 50],
  ["48", 629, 81401, 81450, 50],
  ["49", 632, 81551, 81600, 50],
  ["50", 631, 81501, 81550, 50],
  ["51", 708, 85351, 85400, 50],
  ["52", 707, 85301, 85350, 50],
  ["53", 709, 85401, 85450, 50],
  ["54", 710, 85451, 85500, 50],
  ["55", 711, 85501, 85550, 50],
  ["56", 712, 85551, 85600, 50],
  ["57", 706, 85251, 85300, 50],
  ["58", 705, 85201, 85250, 50],
  ["59", 703, 85101, 85150, 50],
  ["60", 704, 85151, 85200, 50],
  ["61", 713, 85601, 85650, 50],
  ["62", 714, 85651, 85700, 50],
  ["63", 672, 83551, 83600, 50],
  ["64", 671, 83501, 83550, 50],
  ["65", null, null, null, 50],
  ["66", null, null, null, 50],
  ["67", null, null, null, 50],
  ["68", null, null, null, 50],
  ["69", null, null, null, 50],
  ["70", null, null, null, 50]
];

function yard_populateCellAddresses() {
  yard_populateCellAddresses_('50k');
  yard_populateCellAddresses_('20k');
  Logger.log('セル住所の一括埋め込みが完了しました。');
}

function yard_populateCellAddresses_(sizeKey) {
  var sheet = yard_openRefSheet_(sizeKey);
  var header6 = sheet.getRange(1, 7).getValue();
  if (header6 !== 'GNoセルの住所') {
    sheet.getRange(1, 7).setValue('GNoセルの住所');
    sheet.getRange(1, 7).setFontWeight('bold');
  }
  var header7 = sheet.getRange(1, 8).getValue();
  if (header7 !== '依頼Noセルの住所') {
    sheet.getRange(1, 8).setValue('依頼Noセルの住所');
    sheet.getRange(1, 8).setFontWeight('bold');
  }

  var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
  var mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
  var values = mapSheet.getRange(1, 1, Math.min(YARD_EDIT_CONFIG.MAX_SEARCH_ROW, mapSheet.getMaxRows()), mapSheet.getMaxColumns()).getValues();

  var rows = yard_readRefRows_(sizeKey);
  var filled = 0, notFound = 0, skipped = 0;
  var notFoundPositions = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];

    var gnoRow, gnoCol;

    if (row.gnoCellA1) {
      var cachedGnoRange = mapSheet.getRange(row.gnoCellA1);
      gnoRow = cachedGnoRange.getRow();
      gnoCol = cachedGnoRange.getColumn();
    } else {
      var br = yard_findByBracketLabel_(values, row.pos);
      if (!br) { notFound++; notFoundPositions.push(row.pos + '(ブラケット自体が見つからず)'); continue; }

      var posCell = yard_pickNearerCandidate_(
        yard_firstNonBlankStopAtBracket_(values[br.row - 1], br.col - 1, -1, 3),
        yard_firstNonBlankStopAtBracket_(values[br.row - 1], br.col - 1, 1, 3)
      );
      if (posCell) {
        gnoRow = br.row;
        gnoCol = posCell.col + 1;
      } else {
        var belowVal = (values[br.row] && values[br.row][br.col - 1] !== undefined) ? values[br.row][br.col - 1] : '';
        if (belowVal !== '' && belowVal !== null) {
          gnoRow = br.row + 1;
          gnoCol = br.col;
        } else if (values[br.row]) {
          var belowCell = yard_pickNearerCandidate_(
            yard_firstNonBlankStopAtBracket_(values[br.row], br.col - 1, -1, 3),
            yard_firstNonBlankStopAtBracket_(values[br.row], br.col - 1, 1, 3)
          );
          if (belowCell) {
            gnoRow = br.row + 1;
            gnoCol = belowCell.col + 1;
          } else {
            notFound++;
            notFoundPositions.push(row.pos + '(同じ行・真下とも見つからず)');
            continue;
          }
        } else {
          notFound++;
          notFoundPositions.push(row.pos + '(同じ行・真下とも見つからず)');
          continue;
        }
      }

      var gnoA1 = mapSheet.getRange(gnoRow, gnoCol).getA1Notation();
      sheet.getRange(row.row, 7).setValue(gnoA1);
    }

    if (!row.orderNoCellA1) {
      var orderCell = yard_findOrderNoCellSameColumn_(values, gnoCol - 1, gnoRow - 1, String(row.groupNo || ''));
      if (orderCell) {
        var orderA1 = mapSheet.getRange(orderCell.row + 1, orderCell.col + 1).getA1Notation();
        sheet.getRange(row.row, 8).setValue(orderA1);
      }
    }

    if (!row.shipDateCellA1) {
      var shipDateCell = yard_findShipDateCellSameColumn_(values, gnoCol - 1, gnoRow - 1);
      if (shipDateCell) {
        var shipDateA1 = mapSheet.getRange(shipDateCell.row + 1, shipDateCell.col + 1).getA1Notation();
        sheet.getRange(row.row, 11).setValue(shipDateA1);
      }
    }
    filled++;
  }
  sheet.autoResizeColumns(7, 2);
  Logger.log(sizeKey + ': ' + filled + '件を確認しました（' + notFound + '件は見つからず）');
  if (notFoundPositions.length > 0) {
    Logger.log(sizeKey + ' 見つからなかった位置ラベル: ' + notFoundPositions.join(', '));
  }
}

function yard_addOrderNoColumn() {
  yard_addOrderNoColumn_('50k');
  yard_addOrderNoColumn_('20k');
  Logger.log('「依頼ナンバー」列の追加が完了しました。');
}

function yard_addOrderNoColumn_(sizeKey) {
  var sheet = yard_openRefSheet_(sizeKey);
  var header = sheet.getRange(1, 6).getValue();
  if (header !== '依頼ナンバー') {
    sheet.getRange(1, 6).setValue('依頼ナンバー');
    sheet.getRange(1, 6).setFontWeight('bold');
    sheet.autoResizeColumns(6, 1);
  }
}

function yard_addKindAndShipDateColumns() {
  yard_addKindAndShipDateColumns_('50k');
  yard_addKindAndShipDateColumns_('20k');
  Logger.log('「状態」「出荷希望日」列の追加が完了しました。');
}

function yard_addKindAndShipDateColumns_(sizeKey) {
  var sheet = yard_openRefSheet_(sizeKey);
  var h1 = sheet.getRange(1, 9).getValue();
  if (h1 !== '状態') {
    sheet.getRange(1, 9).setValue('状態');
    sheet.getRange(1, 9).setFontWeight('bold');
  }
  var h2 = sheet.getRange(1, 10).getValue();
  if (h2 !== '出荷希望日') {
    sheet.getRange(1, 10).setValue('出荷希望日');
    sheet.getRange(1, 10).setFontWeight('bold');
  }
  var h3 = sheet.getRange(1, 11).getValue();
  if (h3 !== '出荷希望日セルの住所') {
    sheet.getRange(1, 11).setValue('出荷希望日セルの住所');
    sheet.getRange(1, 11).setFontWeight('bold');
  }
  sheet.autoResizeColumns(9, 3);
}

function yard_setupReferenceSheets() {
  yard_setupReferenceSheet_('50k');
  yard_setupReferenceSheet_('20k');
  Logger.log('セットアップ完了：50k・20kの「' + YARD_EDIT_CONFIG.REF_SHEET_NAME + '」タブを作り直しました。');
}

function yard_setupReferenceSheet_(sizeKey) {
  var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
  var ss = SpreadsheetApp.openById(fileId);
  var existing = ss.getSheetByName(YARD_EDIT_CONFIG.REF_SHEET_NAME);
  if (existing) {
    ss.deleteSheet(existing);
  }
  var sheet = ss.insertSheet(YARD_EDIT_CONFIG.REF_SHEET_NAME);
  sheet.getRange(1, 1, 1, 5).setValues([['位置ラベル', 'GNo', '容器番号開始', '容器番号終了', '本数']]);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  var seed = sizeKey === '50k' ? YARD_REF_SEED_50K : YARD_REF_SEED_20K;
  if (seed.length > 0) {
    sheet.getRange(2, 1, seed.length, 5).setValues(seed);
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 5);
}

function getYardBlockDetail(sizeKey, pos) {
  var result = { found: false, pos: null, groupNo: null, rangeStart: null, rangeEnd: null, qty: null, orderNo: null, error: null };
  try {
    var row = yard_findRefRow_(sizeKey, pos);
    if (!row) { result.error = '位置ラベル ' + pos + ' が一覧タブに見つかりませんでした'; return result; }
    result.found = true;
    result.pos = row.pos;
    result.groupNo = row.groupNo;
    result.rangeStart = row.rangeStart;
    result.rangeEnd = row.rangeEnd;
    result.qty = row.qty;
    result.orderNo = row.orderNo;
  } catch (err) {
    result.error = String(err);
  }
  return result;
}

function getYardMapUpdates(sizeKey, queries) {
  return JSON.stringify(yard_computeUpdates_(sizeKey, queries));
}

function getYardMapUpdatesBoth(queries50k, queries20k) {
  return JSON.stringify({
    "50k": yard_computeUpdates_('50k', queries50k || []),
    "20k": yard_computeUpdates_('20k', queries20k || [])
  });
}

function yard_computeUpdates_(sizeKey, queries) {
  var out = [];
  var refRows;
  try {
    refRows = yard_readRefRows_(sizeKey);
  } catch (err) {
    for (var i = 0; i < queries.length; i++) {
      out.push({ found: false, error: String(err) });
    }
    return out;
  }

  var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;

  var mapSheet = null;
  var mapGrid = null;
  var loadMapGridIfNeeded_ = function () {
    if (mapGrid) return;
    mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
    mapGrid = mapSheet.getDataRange().getValues();
  };

  var refSheet = null;
  var openRefSheetOnce_ = function () {
    if (!refSheet) refSheet = yard_openRefSheet_(sizeKey);
    return refSheet;
  };

  for (var i = 0; i < queries.length; i++) {
    var q = queries[i] || {};
    var result = { found: false, pos: null, groupNo: null, rangeStart: null, rangeEnd: null, qty: null, orderNo: null, kind: null, shipDate: null, error: null };
    try {
      var match = null;
      if (q.pos !== undefined && q.pos !== null && q.pos !== '') {
        for (var j = 0; j < refRows.length; j++) {
          if (String(refRows[j].pos) === String(q.pos)) { match = refRows[j]; break; }
        }
      }
      if (match) {
        result.found = true;
        result.pos = match.pos;
        result.groupNo = match.groupNo;
        result.rangeStart = match.rangeStart;
        result.rangeEnd = match.rangeEnd;
        result.qty = match.qty;
        result.orderNo = match.orderNo;
        result.kind = match.kind;
        result.shipDate = match.shipDate;

        try {
          if (match.gnoCellA1) {
            loadMapGridIfNeeded_();
            var liveVal = yard_readFromGrid_(mapGrid, match.gnoCellA1);
            var liveStr = String(liveVal).trim();
            if (liveStr !== '' && liveStr !== String(match.groupNo).trim()) {
              var liveNum = Number(liveStr);
              if (!isNaN(liveNum)) {
                result.groupNo = liveNum;
                var range = yard_computeRangeFromGNo_(sizeKey, liveNum);
                if (range) {
                  result.rangeStart = range.start;
                  result.rangeEnd = range.end;
                }
                try {
                  openRefSheetOnce_().getRange(match.row, 2, 1, 4).setValues([[liveNum, result.rangeStart || '', result.rangeEnd || '', match.qty]]);
                } catch (syncErr) {
                  Logger.log('マップ→一覧タブの自動同期でエラー: ' + String(syncErr));
                }
              }
            }
          }
        } catch (gnoLiveErr) {
          Logger.log('GNoのライブ読み取りでエラー(位置' + match.pos + '): ' + String(gnoLiveErr));
        }

        // ★ 2026/08 修正：以前は「マップ側の日付が空でない場合だけ」同期していたため、
        // マップ側で日付セルを直接消しても、一覧タブのJ列（出荷希望日）が
        // 古い値のまま残り続ける不具合があった（「マップは空なのに一覧には
        // 出荷希望日が入っている」）。→ マップ側が空になった場合も、その空を
        // 一覧タブに反映する（＝マップ側が正、という原則を空にも適用する）。
        try {
          if (match.shipDateCellA1) {
            loadMapGridIfNeeded_();
            var shipDateRaw = yard_readFromGrid_(mapGrid, match.shipDateCellA1);
            var liveShipDate = yard_formatShipDate_(shipDateRaw);
            var refShipDate = String(match.shipDate || '').trim();
            if (liveShipDate !== refShipDate) {
              result.shipDate = liveShipDate || null;
              try {
                openRefSheetOnce_().getRange(match.row, 10).setValue(liveShipDate);
              } catch (syncErr2) {
                Logger.log('出荷希望日の自動同期でエラー: ' + String(syncErr2));
              }
            }
          }
        } catch (shipDateLiveErr) {
          Logger.log('出荷希望日のライブ読み取りでエラー(位置' + match.pos + '): ' + String(shipDateLiveErr));
        }

        try {
          if (match.orderNoCellA1) {
            loadMapGridIfNeeded_();
            var liveOrderNoRaw = yard_readFromGrid_(mapGrid, match.orderNoCellA1);
            var liveOrderNo = String(liveOrderNoRaw).trim();
            if (liveOrderNo !== '' && liveOrderNo !== String(match.orderNo || '').trim()) {
              result.orderNo = liveOrderNo;
              try {
                openRefSheetOnce_().getRange(match.row, 6).setValue(liveOrderNo);
              } catch (syncErr3) {
                Logger.log('依頼ナンバーの自動同期でエラー: ' + String(syncErr3));
              }
            }
          }
        } catch (orderNoLiveErr) {
          Logger.log('依頼ナンバーのライブ読み取りでエラー(位置' + match.pos + '): ' + String(orderNoLiveErr));
        }
      }
    } catch (err) {
      result.error = String(err);
    }
    out.push(result);
  }
  return out;
}

function yard_parseA1_(a1) {
  var m = /^([A-Za-z]+)(\d+)$/.exec(String(a1).trim());
  if (!m) return null;
  var letters = m[1].toUpperCase();
  var colNum = 0;
  for (var k = 0; k < letters.length; k++) {
    colNum = colNum * 26 + (letters.charCodeAt(k) - 64);
  }
  var rowNum = parseInt(m[2], 10);
  if (isNaN(rowNum) || colNum < 1) return null;
  return { row: rowNum - 1, col: colNum - 1 };
}

function yard_readFromGrid_(grid, a1) {
  var pos = yard_parseA1_(a1);
  if (!pos) return '';
  if (pos.row < 0 || pos.row >= grid.length) return '';
  var rowArr = grid[pos.row];
  if (!rowArr || pos.col < 0 || pos.col >= rowArr.length) return '';
  var v = rowArr[pos.col];
  return v === null || v === undefined ? '' : v;
}

function yard_computeRangeFromGNo_(sizeKey, gno) {
  if (sizeKey === '50k') {
    return { start: (gno - 1) * 100 + 1, end: gno * 100 };
  } else if (sizeKey === '20k') {
    return { start: 50000 + (gno - 1) * 50 + 1, end: 50000 + gno * 50 };
  }
  return null;
}

function clearYardBlock(payload) {
  var result = { success: false, error: null };
  try {
    var existingRow = yard_findRefRow_(payload.sizeKey, payload.pos);

    yard_clearRefRow_(payload.sizeKey, payload.pos);

    if (existingRow && existingRow.shipDateCellA1) {
      try {
        var fileId = payload.sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
        var mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
        mapSheet.getRange(existingRow.shipDateCellA1).setValue('');
      } catch (mapErr) {
        Logger.log('マップ側の出荷希望日セルのクリアでエラー(位置' + payload.pos + '): ' + String(mapErr));
      }
    }

    result.success = true;
  } catch (err) {
    result.error = String(err);
  }
  return result;
}

function yard_clearRefRow_(sizeKey, pos) {
  var sheet = yard_openRefSheet_(sizeKey);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(pos)) {
      sheet.getRange(i + 2, 2, 1, 5).setValues([['', '', '', '', '']]);
      sheet.getRange(i + 2, 10).setValue('');
      return;
    }
  }
}

function updateYardBlock(payload) {
  var result = { success: false, error: null, visualDebug: null };
  try {
    var oldRow = yard_findRefRow_(payload.sizeKey, payload.pos);
    var oldGNo = oldRow ? String(oldRow.groupNo) : null;

    yard_upsertRefRow_(payload.sizeKey, payload);
    try {
      result.visualDebug = yard_bestEffortWriteVisualMap_(payload, oldGNo);
    } catch (visualErr) {
      result.visualDebug = { error: String(visualErr) };
      Logger.log('見た目のヤードマップへの反映でエラー: ' + String(visualErr));
    }
    // ★ 直した内容がすぐマップに出るように、一括取得のキャッシュを捨てる
    nc_forget_('yardMapBoth');
    result.success = true;
  } catch (err) {
    result.error = String(err);
  }
  return result;
}

function yard_openRefSheet_(sizeKey) {
  var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
  var ss = SpreadsheetApp.openById(fileId);
  var sheet = ss.getSheetByName(YARD_EDIT_CONFIG.REF_SHEET_NAME);
  if (!sheet) {
    throw new Error('「' + YARD_EDIT_CONFIG.REF_SHEET_NAME + '」タブが見つかりません。先に yard_setupReferenceSheets() を実行してください。');
  }
  return sheet;
}

function yard_readRefRows_(sizeKey) {
  var sheet = yard_openRefSheet_(sizeKey);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v[0] === '' || v[0] === null) continue;
    rows.push({
      row: i + 2, pos: v[0], groupNo: v[1], rangeStart: v[2], rangeEnd: v[3], qty: v[4], orderNo: v[5],
      gnoCellA1: v[6] || null, orderNoCellA1: v[7] || null, kind: v[8] || null, shipDate: v[9] || null,
      shipDateCellA1: v[10] || null
    });
  }
  return rows;
}

function yard_findRefRow_(sizeKey, pos) {
  var rows = yard_readRefRows_(sizeKey);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].pos) === String(pos)) return rows[i];
  }
  return null;
}

function yard_upsertRefRow_(sizeKey, payload) {
  var sheet = yard_openRefSheet_(sizeKey);
  var pos = payload.pos !== undefined && payload.pos !== null ? String(payload.pos) : null;
  if (pos === null || pos === '') throw new Error('位置ラベル(pos)が指定されていません');

  var lastRow = sheet.getLastRow();
  var targetRow = null;
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === pos) { targetRow = i + 2; break; }
    }
  }
  if (!targetRow) {
    targetRow = sheet.getLastRow() + 1;
  }

  var groupNo = payload.groupNo !== undefined && payload.groupNo !== null && payload.groupNo !== ''
    ? Number(payload.groupNo) : '';
  var rangeStart = payload.rangeStart !== undefined && payload.rangeStart !== null && payload.rangeStart !== ''
    ? Number(payload.rangeStart) : '';
  var rangeEnd = payload.rangeEnd !== undefined && payload.rangeEnd !== null && payload.rangeEnd !== ''
    ? Number(payload.rangeEnd) : '';
  var qty = payload.qty !== undefined && payload.qty !== null && payload.qty !== ''
    ? Number(payload.qty) : '';
  var orderNo = payload.orderNo !== undefined && payload.orderNo !== null ? String(payload.orderNo) : '';

  sheet.getRange(targetRow, 1, 1, 6).setValues([[pos, groupNo, rangeStart, rangeEnd, qty, orderNo]]);

  if (payload.kind !== undefined && payload.kind !== null && payload.kind !== '') {
    sheet.getRange(targetRow, 9).setValue(String(payload.kind));
  }

  if (payload.shipDate !== undefined && payload.shipDate !== null) {
    sheet.getRange(targetRow, 10).setValue(String(payload.shipDate));
  }
}

function toggleYardBlockKind(payload) {
  var result = { success: false, error: null };
  try {
    var sheet = yard_openRefSheet_(payload.sizeKey);
    var lastRow = sheet.getLastRow();
    var targetRow = null;
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][0]) === String(payload.pos)) { targetRow = i + 2; break; }
      }
    }
    if (!targetRow) throw new Error('位置ラベル ' + payload.pos + ' が一覧タブに見つかりませんでした');
    sheet.getRange(targetRow, 9).setValue(String(payload.kind));
    result.success = true;
  } catch (err) {
    result.error = String(err);
  }
  return result;
}

function yard_firstNonBlankStopAtBracket_(row, startCol, dir, maxSkip) {
  var c = startCol;
  for (var i = 0; i < maxSkip; i++) {
    c += dir;
    if (c < 0 || c >= row.length) return null;
    var v = row[c];
    if (v === null || v === '') continue;
    var normalized = yard_normalizeBracketText_(v).trim();
    if (/^<\s*\d+\s*>$/.test(normalized)) return null;
    return { value: v, col: c, skip: i + 1 };
  }
  return null;
}

function yard_pickNearerCandidate_(left, right) {
  if (left && right) return left.skip <= right.skip ? left : right;
  return left || right || null;
}

function yard_bestEffortWriteVisualMap_(payload, oldGNo) {
  var fileId = payload.sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
  var sheet = SpreadsheetApp.openById(fileId).getSheets()[0];

  var debug = { pos: payload.pos, found: false };
  var existingRow = yard_findRefRow_(payload.sizeKey, payload.pos);
  var currentGNo = oldGNo !== undefined && oldGNo !== null ? oldGNo : (existingRow ? String(existingRow.groupNo) : null);

  var gnoRange = null;
  if (existingRow && existingRow.gnoCellA1) {
    var cachedRange = sheet.getRange(existingRow.gnoCellA1);
    var cachedVal = String(cachedRange.getValue()).trim();
    var isBlankC = cachedVal === '';
    var isOwnC = currentGNo !== null && cachedVal === currentGNo;
    if (isBlankC || isOwnC) {
      gnoRange = cachedRange;
      debug.usedCachedAddress = true;
    } else {
      debug.reason = 'キャッシュ済みセル(' + existingRow.gnoCellA1 + ')の中身(' + cachedVal +
        ')が想定と違うため、書き込みを中止しました。yard_populateCellAddresses() で住所を確認し直してください。';
      return debug;
    }
  } else {
    var values = sheet.getRange(1, 1, Math.min(YARD_EDIT_CONFIG.MAX_SEARCH_ROW, sheet.getMaxRows()), sheet.getMaxColumns()).getValues();
    var br = yard_findByBracketLabel_(values, payload.pos);
    if (!br) { debug.reason = 'ブラケット <' + payload.pos + '> が見つかりませんでした'; return debug; }
    var posCell = yard_pickNearerCandidate_(
      yard_firstNonBlankStopAtBracket_(values[br.row - 1], br.col - 1, -1, 3),
      yard_firstNonBlankStopAtBracket_(values[br.row - 1], br.col - 1, 1, 3)
    );
    var foundRow, foundCol;
    if (posCell) {
      foundRow = br.row;
      foundCol = posCell.col + 1;
    } else {
      var belowVal = (values[br.row] && values[br.row][br.col - 1] !== undefined) ? values[br.row][br.col - 1] : '';
      if (belowVal !== '' && belowVal !== null) {
        foundRow = br.row + 1;
        foundCol = br.col;
      } else if (values[br.row]) {
        var belowCell = yard_pickNearerCandidate_(
          yard_firstNonBlankStopAtBracket_(values[br.row], br.col - 1, -1, 3),
          yard_firstNonBlankStopAtBracket_(values[br.row], br.col - 1, 1, 3)
        );
        if (belowCell) {
          foundRow = br.row + 1;
          foundCol = belowCell.col + 1;
        } else {
          debug.reason = 'ブラケットの隣・真下に位置番号セルが見つかりませんでした（別区画の領域に阻まれた可能性）';
          return debug;
        }
      } else {
        debug.reason = 'ブラケットの隣・真下に位置番号セルが見つかりませんでした';
        return debug;
      }
    }

    var cellVal = String(sheet.getRange(foundRow, foundCol).getValue()).trim();
    var isBlank = cellVal === '';
    var isOwnCurrentValue = currentGNo !== null && cellVal === currentGNo;
    if (!isBlank && !isOwnCurrentValue) {
      debug.reason = '書き込み先セル(' + sheet.getRange(foundRow, foundCol).getA1Notation() +
        ')に別の数字(' + cellVal + ')が既に入っているため、誤検出とみなして書き込みを中止しました';
      return debug;
    }
    gnoRange = sheet.getRange(foundRow, foundCol);
    debug.usedCachedAddress = false;

    if (existingRow) {
      yard_openRefSheet_(payload.sizeKey).getRange(existingRow.row, 7).setValue(gnoRange.getA1Notation());
    }

    if (existingRow && !existingRow.orderNoCellA1) {
      var orderCellFound = yard_findOrderNoCellSameColumn_(values, gnoRange.getColumn() - 1, foundRow - 1, String(payload.groupNo || currentGNo || ''));
      if (orderCellFound) {
        var orderA1Found = sheet.getRange(orderCellFound.row + 1, orderCellFound.col + 1).getA1Notation();
        yard_openRefSheet_(payload.sizeKey).getRange(existingRow.row, 8).setValue(orderA1Found);
        existingRow.orderNoCellA1 = orderA1Found;
      }
    }
  }

  debug.found = true;
  debug.writeCellA1 = gnoRange.getA1Notation();
  if (payload.groupNo) {
    gnoRange.setValue(Number(payload.groupNo));
    debug.wroteGroupNo = Number(payload.groupNo);
  }

  if (payload.orderNo) {
    var orderCellAddr = existingRow ? existingRow.orderNoCellA1 : null;
    if (orderCellAddr) {
      sheet.getRange(orderCellAddr).setValue(payload.orderNo);
      debug.wroteOrderNoCellA1 = orderCellAddr;
    } else {
      debug.orderNoReason = '依頼Noセルの住所が一覧タブに登録されていないため、見た目のマップには反映されていません（一覧タブのみ反映済み）。yard_populateCellAddresses() を実行すると自動で埋まります。';
    }
  }
  return debug;
}

function yard_findOrderNoCellSameColumn_(values, col, row, ownGNo) {
  var rowWindow = 6;
  for (var r = row; r < Math.min(values.length, row + rowWindow); r++) {
    var v = values[r][col];
    if (v === null || v === '') continue;
    var s = String(v).trim();
    if (s.indexOf('依頼No') === 0) return { row: r, col: col };
    var normalized = yard_normalizeBracketText_(s);
    if (/^<\s*\d+\s*>$/.test(normalized)) return null;
  }
  return null;
}

function yard_findShipDateCellSameColumn_(values, col, row) {
  var rowWindow = 8;
  var datePattern = /\d+月\d+日/;
  for (var r = row; r < Math.min(values.length, row + rowWindow); r++) {
    var v = values[r][col];
    if (v === null || v === '') continue;
    if (v instanceof Date) return { row: r, col: col };
    var s = String(v).trim();
    if (datePattern.test(s)) return { row: r, col: col };
    var normalized = yard_normalizeBracketText_(s);
    if (/^<\s*\d+\s*>$/.test(normalized)) return null;
  }
  return null;
}

function yard_formatShipDate_(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, 'Asia/Tokyo', 'M月d日');
  }
  return String(raw).trim();
}

function yard_normalizeBracketText_(s) {
  s = String(s);
  s = s.replace(/[０-９]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  s = s.replace(/＜/g, '<').replace(/＞/g, '>');
  return s;
}

function yard_firstNonBlank_(row, startCol, dir, maxSkip) {
  var c = startCol;
  for (var i = 0; i < maxSkip; i++) {
    c += dir;
    if (c < 0 || c >= row.length) return null;
    var v = row[c];
    if (v !== null && v !== '') return { value: v, col: c };
  }
  return null;
}

function yard_findByBracketLabel_(values, label) {
  var target = '<' + String(label).trim() + '>';
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var v = values[r][c];
      if (v === null || v === '') continue;
      var normalized = yard_normalizeBracketText_(v).replace(/\s+/g, '').trim();
      if (normalized === target) {
        return { row: r + 1, col: c + 1 };
      }
    }
  }
  return null;
}

function yard_checkConsistency(sizeKey) {
  var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
  var sheet = SpreadsheetApp.openById(fileId).getSheets()[0];

  var refRows = yard_readRefRows_(sizeKey);
  var mismatches = [];
  var okCount = 0;

  for (var i = 0; i < refRows.length; i++) {
    var row = refRows[i];
    var pos = row.pos;
    var refGNo = row.groupNo;

    if (!row.gnoCellA1) {
      mismatches.push({ pos: pos, refGNo: refGNo, visualGNo: null, issue: 'GNoセルの住所が一覧タブに登録されていません（yard_populateCellAddresses()を実行してください）' });
      continue;
    }
    var visualGNo = sheet.getRange(row.gnoCellA1).getValue();
    if (String(visualGNo).trim() === String(refGNo).trim()) {
      okCount++;
    } else {
      mismatches.push({ pos: pos, refGNo: refGNo, visualGNo: visualGNo, issue: '一覧タブと見た目のマップでGNoが違う（セル' + row.gnoCellA1 + '）' });
    }
  }

  return { sizeKey: sizeKey, okCount: okCount, mismatchCount: mismatches.length, mismatches: mismatches };
}

function testCheckConsistency50k() {
  var result = yard_checkConsistency('50k');
  Logger.log('一致: ' + result.okCount + '件 / ズレ: ' + result.mismatchCount + '件');
  if (result.mismatches.length > 0) {
    for (var i = 0; i < result.mismatches.length; i++) {
      var m = result.mismatches[i];
      Logger.log('位置' + m.pos + ': 一覧タブ=' + m.refGNo + ' / 見た目のマップ=' + m.visualGNo + ' (' + m.issue + ')');
    }
  }
}

function testCheckConsistency20k() {
  var result = yard_checkConsistency('20k');
  Logger.log('一致: ' + result.okCount + '件 / ズレ: ' + result.mismatchCount + '件');
  if (result.mismatches.length > 0) {
    for (var i = 0; i < result.mismatches.length; i++) {
      var m = result.mismatches[i];
      Logger.log('位置' + m.pos + ': 一覧タブ=' + m.refGNo + ' / 見た目のマップ=' + m.visualGNo + ' (' + m.issue + ')');
    }
  }
}

function testGetYardBlockDetail() {
  Logger.log(JSON.stringify(getYardBlockDetail('50k', '21'), null, 2));
}

function testGetYardMapUpdatesBoth() {
  var q50 = [{ pos: '21' }];
  var q20 = [{ pos: '1' }];
  var json = getYardMapUpdatesBoth(q50, q20);
  Logger.log(JSON.stringify(JSON.parse(json), null, 2));
}
/**
 * 野田組 業務ダッシュボード — ヤードマップ 依頼No・PDFリンク機能 (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：メインのヤードマップエンジン（yard_findRefRow_ などが入っているファイル）に
 *       追記する形の、依頼No・PDFリンク関連の追加機能。メインエンジンの既存コードは
 *       一切編集しない（安全のため、別ファイルとして追加するだけ）。
 *
 * 含まれる関数：
 *   getYardBlockDetailWithPdf(sizeKey, pos)
 *     → ブロックをタップして詳細を開いたときに呼ぶ。実際のマップの依頼Noセルを
 *       読み、共有ドライブ内の該当PDFを検索してリンク付きで返す（重い処理）。
 *
 *   getYardMapUpdatesBothWithOrderText(queries50k, queries20k)
 *     → マップ全体を表示・更新するときに呼ぶ。依頼Noの「文字」だけを軽く読む
 *       （PDF検索はしない）。一覧・マップの丸バッジ表示用。
 *
 * ★ このファイルは、メインエンジンファイルの yard_findRefRow_ / yard_openRefSheet_ /
 *   YARD_EDIT_CONFIG / getYardBlockDetail / getYardMapUpdatesBoth に依存している。
 *   同じGASプロジェクト内に、メインエンジンとは別ファイルとして置くこと。
 */

// ===== 内部：依頼Noの文字列から、本当の依頼No部分だけを正確に抜き出す =====
// ★ セルの内容には「2026-60556-0,(1)」のような「4桁の年+ハイフン」で始まる
//   表記もあり、単純に4〜6桁の数字を全部拾うと年（2026）を依頼Noと誤認して
//   間違ったPDFを検索してしまうバグがあった。年の接頭辞だけを除外する。
// ★ 枝番号（末尾の-0、-1など）は、同じ依頼No内でも容器番号が異なる別々の
//   指図書を区別する大事な情報なので、消さずに依頼Noの一部として残す
//   （例："60556-0" と "60047-1" は別物として扱う）。
function yard_extractOrderNumbers_(text) {
  var nos = [];
  var re = /(?:20\d{2}-)?(\d{4,6}(?:-\d+)?)/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    nos.push(m[1]);
  }
  return nos;
}

// ===== ブロックをタップしたときに呼ぶ：依頼No→PDFリンクを検索して返す =====
function getYardBlockDetailWithPdf(sizeKey, pos) {
  var result = getYardBlockDetail(sizeKey, pos);
  result.orders = [];
  try {
    var row = yard_findRefRow_(sizeKey, pos);
    if (row && row.orderNoCellA1) {
      var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
      var mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
      var liveOrderText = String(mapSheet.getRange(String(row.orderNoCellA1).trim()).getValue() || '');

      var nos = yard_extractOrderNumbers_(liveOrderText);
      var seen = {};
      for (var i = 0; i < nos.length; i++) {
        var no = nos[i];
        if (seen[no]) continue;
        seen[no] = true;
        result.orders.push({ no: no, url: yard_findOrderPdfUrl_(no) });
      }
    }
  } catch (err) {
    result.ordersError = String(err);
  }
  return result;
}

// ===== マップ全体表示時に呼ぶ：依頼NoからPDFリンクまで全部まとめて取得する =====
// ★ 読み込みに時間がかかっても、開いた瞬間から全ブロックのPDFリンクが
//   出ている状態にしたいという要望のため、一括取得の時点で全件のPDF検索を行う。
function getYardMapUpdatesBothWithOrderText(queries50k, queries20k, force) {
  /* ★ 依頼NoごとにDriveを検索するので重い。今まで毎回やっていたため、
       ヤードタブを開くたびに待たされていた。5分ぶんキャッシュする。
       ★ 引数（位置の一覧）は静的データから作る固定のものなので、
         キャッシュのキーには入れない。
       ★ アプリから区画を直したときは updateYardBlock で消している。 */
  return nc_cached_('yardMapBoth', force === true, 300, function () {
    return getYardMapUpdatesBothWithOrderText_uncached_(queries50k, queries20k);
  });
}

function getYardMapUpdatesBothWithOrderText_uncached_(queries50k, queries20k) {
  var base = JSON.parse(getYardMapUpdatesBoth(queries50k, queries20k));
  var pdfCache = {}; // 同じ依頼Noを何度も検索しないためのキャッシュ

  ['50k', '20k'].forEach(function (sizeKey) {
    var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
    var mapSheet = null;

    (base[sizeKey] || []).forEach(function (result) {
      if (!result || !result.found) return;

      // ★ 「状態(kind)」は、一覧タブに別途記録された値を信用せず、
      // 「実際にGNo(groupNo)が入っているかどうか」から毎回確実に判定し直す。
      // 以前は「保存時にkindを明示的に更新し忘れる」バグにより、GNoが
      // 入っているのにマップ上は「空き」の見た目のまま、というズレが起きていた。
      var hasGroupNo = result.groupNo !== null && result.groupNo !== undefined && result.groupNo !== '';
      result.kind = hasGroupNo ? 'fill' : 'empty';
      // 空きになった区画は、古い出荷希望日が残っていると紛らわしいのでクリアする
      if (!hasGroupNo) {
        result.shipDate = null;
      }

      result.orders = [];
      try {
        var row = yard_findRefRow_(sizeKey, result.pos);
        if (row && row.orderNoCellA1) {
          if (!mapSheet) mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
          var text = mapSheet.getRange(String(row.orderNoCellA1).trim()).getValue();
          result.orderNoText = String(text || '');

          var nos = yard_extractOrderNumbers_(result.orderNoText);
          var seen = {};
          for (var i = 0; i < nos.length; i++) {
            var no = nos[i];
            if (seen[no]) continue;
            seen[no] = true;
            if (!(no in pdfCache)) {
              pdfCache[no] = yard_findOrderPdfUrl_(no);
            }
            result.orders.push({ no: no, url: pdfCache[no] });
          }
        } else {
          result.orderNoText = '';
        }
      } catch (err) {
        Logger.log('依頼No/PDF一括取得エラー(' + sizeKey + ' pos' + result.pos + '): ' + String(err));
        result.orderNoText = '';
      }
    });
  });

  return JSON.stringify(base);
}

// ===== 内部：依頼No(数字のみ)から、共有ドライブ内の出荷作業指図書PDFを検索する =====
// 候補が複数見つかった場合は、PDFの中身（容器No部分）を実際に読んで、
// 渡された容器番号レンジ（そのブロックの本当のレンジ）と重なるものを優先する。
// 候補が1件だけなら、内容確認の手間（重い処理）をかけずそのまま採用する。
//
// ★ 2026/08 修正：以前は毎回（5分ごとの自動更新も含む）Drive検索をやり直しており、
// マップ全体で依頼No が数十件あると、その数だけDrive検索が発生し、これがマップ表示の
// ラグの主因になっていた。→ CacheService で検索結果をキャッシュし、同じ依頼No なら
// 次回以降は検索せずキャッシュから即座に返すようにする（依頼Noと実際のPDFの対応は
// 基本的に変わらないため、6時間キャッシュしても実用上問題ない）。
function yard_findOrderPdfUrl_(orderNo) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'yardPdfUrl_' + orderNo;
  var cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached === '__NONE__' ? null : cached;
  }

  var url = yard_findOrderPdfUrl_uncached_(orderNo);
  try {
    cache.put(cacheKey, url === null ? '__NONE__' : url, 21600); // 6時間（秒）
  } catch (cacheErr) {
    Logger.log('PDF検索結果のキャッシュ保存でエラー(依頼No' + orderNo + '): ' + String(cacheErr));
  }
  return url;
}

// ===== 内部：出荷作業指図書PDFの保存フォルダ構成（ルート→年→月）から、
// 「今月のフォルダ」のIDを解決する。毎回フォルダを辿るのは無駄なので、
// 一度見つけたら当日中はキャッシュしておく。 =====
var YARD_PDF_ROOT_FOLDER_ID = '13qWXWwBXgbEO9avO5qlnZ0WHDaMSaYA_';

function yard_findSubfolderByName_(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function yard_getCurrentMonthPdfFolderId_() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'yardPdfMonthFolderId';
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    var now = new Date();
    var yearName = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy') + '年';
    var monthName = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'M')) + '月';

    var root = DriveApp.getFolderById(YARD_PDF_ROOT_FOLDER_ID);
    var yearFolder = yard_findSubfolderByName_(root, yearName);
    if (!yearFolder) return null;
    var monthFolder = yard_findSubfolderByName_(yearFolder, monthName);
    if (!monthFolder) return null;

    var folderId = monthFolder.getId();
    try { cache.put(cacheKey, folderId, 21600); } catch (e) { /* キャッシュ失敗は無視 */ }
    return folderId;
  } catch (err) {
    Logger.log('出荷作業指図書フォルダの解決でエラー: ' + String(err));
    return null;
  }
}

// ===== 内部：PDF検索の実処理（キャッシュを介さず、実際にDriveを検索する） =====
// ★ 2026/08 修正：以前は候補PDFが複数見つかった場合、それぞれの中身をOCRで読んで
// 容器番号レンジと照らし合わせていたが、この「PDFをGoogleドキュメントに変換してOCR」
// という処理が依頼Noごとに何度も走ると非常に重く、マップ全体の読み込みが1分近く
// かかる原因になっていた。
// ★ 2026/08 追加：さらに、検索範囲を「出荷作業指図書フォルダの今月フォルダ内」に
// 絞ることで、Drive全体を検索するより大幅に速く、かつ無関係な同名ファイルが
// 誤って混ざるリスクも減らす（速度と正確性の両方が改善する）。
// 今月フォルダで見つからない場合のみ、Drive全体を対象にした検索にフォールバックする
// （念のため取りこぼしを防ぐため）。
// ★ 複数候補が残った場合はOCR確認ではなく「最終更新日時が一番新しいファイル」を選ぶ
//   （メタデータだけを見るので高速。再発行された指図書は通常、最新のものが正しい版）。
function yard_findOrderPdfUrl_uncached_(orderNo) {
  try {
    var monthFolderId = yard_getCurrentMonthPdfFolderId_();
    var candidates = [];

    if (monthFolderId) {
      var scopedQuery = "'" + monthFolderId + "' in parents and title contains '" + orderNo +
        "' and title contains '指図書' and mimeType = 'application/pdf'";
      var scopedFiles = DriveApp.searchFiles(scopedQuery);
      while (scopedFiles.hasNext() && candidates.length < 10) {
        candidates.push(scopedFiles.next());
      }
    }

    if (candidates.length === 0) {
      // 今月フォルダで見つからない場合のフォールバック：Drive全体を検索する
      var files = DriveApp.searchFiles(
        "title contains '" + orderNo + "' and title contains '指図書' and mimeType = 'application/pdf'"
      );
      while (files.hasNext() && candidates.length < 10) {
        candidates.push(files.next());
      }
    }
    if (candidates.length === 0) {
      var files2 = DriveApp.searchFiles(
        "title contains '" + orderNo + "' and mimeType = 'application/pdf'"
      );
      while (files2.hasNext() && candidates.length < 10) {
        candidates.push(files2.next());
      }
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].getUrl();

    // 複数候補があれば、最終更新日時が一番新しいものを選ぶ（メタデータ比較のみ、高速）
    var best = candidates[0];
    var bestTime = best.getLastUpdated().getTime();
    for (var i = 1; i < candidates.length; i++) {
      var t = candidates[i].getLastUpdated().getTime();
      if (t > bestTime) {
        best = candidates[i];
        bestTime = t;
      }
    }
    return best.getUrl();
  } catch (err) {
    Logger.log('PDF検索エラー(依頼No' + orderNo + '): ' + String(err));
  }
  return null;
}

// ===== 公開関数：依頼No→PDFリンクのキャッシュを手動でクリアする =====
// ★ 出荷作業指図書PDFが新しく追加された・差し替わったのに、キャッシュのせいで
//   古いリンク（またはリンク無し）のままになっている場合に、これを実行するとよい。
function yard_clearPdfUrlCache() {
  // CacheServiceには「前方一致で削除」というAPIが無いため、
  // 個別キーを覚えておくリストが無い場合はキャッシュの有効期限（6時間）が切れるまで待つのが
  // 簡単だが、今すぐ全部クリアしたい場合は removeAll で明示的に消せる
  // （キー名が分からないと消せないため、実際に使われた依頼Noのリストを別途保存しておく必要がある。
  //   今のところはシンプルに「6時間待てば自然に消える」運用とする）
  Logger.log('PDFリンクのキャッシュは6時間で自動的に切れます。今すぐ更新したい場合は、対象の依頼Noが分かれば CacheService.getScriptCache().remove("yardPdfUrl_" + 依頼No) を個別に実行してください。');
}



// ===== 動作確認 =====
function testGetYardBlockDetailWithPdf() {
  Logger.log(JSON.stringify(getYardBlockDetailWithPdf('50k', '2'), null, 2));
}

function testGetYardMapUpdatesBothWithOrderText() {
  var q50 = [{ pos: '1' }, { pos: '2' }, { pos: '3' }];
  var json = getYardMapUpdatesBothWithOrderText(q50, []);
  Logger.log(JSON.stringify(JSON.parse(json), null, 2));
}
// ===== 動作確認：位置18の実際のkind判定結果を確認する =====
function testPos18Kind() {
  var json = getYardMapUpdatesBothWithOrderText([{ pos: '18' }], []);
  Logger.log(JSON.stringify(JSON.parse(json), null, 2));
}