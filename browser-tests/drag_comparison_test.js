/**
 * drag_comparison_test.js
 * スケジュール部 vs コメント部 ドラッグ動作比較テスト
 *
 * 実行方法:
 *   node drag_comparison_test.js
 *
 * テスト概要:
 *   1. localhost:3000 を開いてテスト用パスワード0000で新規登録
 *   2. UIを通じて 7/13「くろちゃんテスト用」タスク & コメントを追加
 *   3. スケジュール部のカーソルスタイル・ドラッグ動作を確認
 *   4. コメント部のカーソルスタイル・ドラッグ動作を確認
 *   5. 差異をレポート出力・スクリーンショット保存
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SS_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SS_DIR, { recursive: true });

const BASE_URL = 'http://localhost:3000';
const DAY_W = 46;
const LANE_H = 30;
const HEAD_H = 70;
// 2026-01-01から2026-07-13は0-indexed: 193
const IDX_713 = 193;

async function ss(page, name) {
  const p = path.join(SS_DIR, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  console.log('  📸', name + '.png');
  return p;
}

// ゆっくりドラッグ
async function slowDrag(page, fromX, fromY, toX, toY, steps = 15) {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.waitForTimeout(80);
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (toX - fromX) * i / steps;
    const y = fromY + (toY - fromY) * i / steps;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
  }
}

(async () => {
  const report = { schedule: {}, comment: {}, summary: [] };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  // ===========================
  // STEP 1: 起動・パスワード登録
  // ===========================
  console.log('\n=== STEP 1: 起動・パスワード0000で新規登録 ===');
  await page.goto(BASE_URL);
  await page.waitForTimeout(1000);
  await ss(page, '01_pw_screen');

  const isReg = await page.$('#pwNew1');
  if (isReg) {
    await page.fill('#pwNew1', '0000');
    await page.fill('#pwNew2', '0000');
    await page.click('#pwRegSubmit');
    console.log('  → 新規パスワード0000で登録');
  } else {
    const pwd = process.env.SCHED_PWD || '0000';
    await page.fill('#pwInput', pwd);
    await page.click('#pwSubmit');
    console.log('  → パスワードでログイン');
  }
  await page.waitForTimeout(2000);
  await ss(page, '02_after_login');

  // ===========================
  // STEP 2: 7/13へスクロール
  // ===========================
  console.log('\n=== STEP 2: 7/13へスクロール ===');
  await page.evaluate((idx) => {
    const scroll = document.getElementById('scroll');
    scroll.scrollLeft = Math.max(0, idx * 46 - 400);
    scroll.scrollTop = 0;
  }, IDX_713);
  await page.waitForTimeout(500);

  // dcellの位置確認
  const dcell713 = await page.evaluate(() => {
    const el = document.querySelector('.dcell[data-d="2026-07-13"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (!dcell713) {
    console.error('  ❌ 7/13のdcellが見つかりません');
    await browser.close();
    process.exit(1);
  }
  console.log('  7/13 dcell位置:', JSON.stringify(dcell713));
  await ss(page, '03_scrolled_july13');

  // lanesエリアのbounding rect取得
  const lanesRect = await page.evaluate(() => {
    const el = document.getElementById('lanes');
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  console.log('  lanesエリア位置:', JSON.stringify(lanesRect));

  // 7/13のセル中心座標（スケジュール部 lane 0）
  const cell713X = dcell713.x + DAY_W / 2;
  const cell713Y = lanesRect.y + LANE_H / 2;  // lane 0の中心
  console.log('  7/13 laneセル座標:', { x: cell713X, y: cell713Y });

  // ===========================
  // STEP 3: スケジュール部にタスク追加（UIダブルクリック）
  // ===========================
  console.log('\n=== STEP 3: スケジュール部にタスク追加（7/13をダブルクリック） ===');
  // 1回目クリック
  await page.mouse.click(cell713X, cell713Y);
  await page.waitForTimeout(200);
  // 2回目クリック（ダブルタップ検出: 320ms以内）
  await page.mouse.click(cell713X, cell713Y);
  await page.waitForTimeout(300);

  const inlineInput = await page.$('.inlineEdit');
  if (inlineInput) {
    console.log('  ✅ インライン入力が開いた');
    await page.fill('.inlineEdit', 'くろちゃんテスト用');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    console.log('  ✅ タスク「くろちゃんテスト用」を追加');
  } else {
    console.log('  ⚠️ インライン入力が開かなかった（+追加ボタンで追加を試みる）');
    await page.click('#btnAdd');
    await page.waitForTimeout(300);
    await page.fill('#fTitle', 'くろちゃんテスト用');
    await page.fill('#fStart', '2026-07-13');
    await page.fill('#fLane', '0');
    await page.click('#btnSave');
    await page.waitForTimeout(500);
    console.log('  ✅ ポップアップでタスク追加');
  }
  await ss(page, '04_task_added');

  // ===========================
  // STEP 4: コメント部にコメント追加（UIダブルクリック）
  // ===========================
  console.log('\n=== STEP 4: コメント部（メモ欄）にコメント追加 ===');
  const noteCell = await page.evaluate(() => {
    const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: r.width > 0 };
  });
  console.log('  ncell[2026-07-13]位置:', JSON.stringify(noteCell));

  if (noteCell && noteCell.visible) {
    // 1回目クリック
    await page.mouse.click(noteCell.x, noteCell.y);
    await page.waitForTimeout(200);
    // 2回目クリック（ダブルタップ）
    await page.mouse.click(noteCell.x, noteCell.y);
    await page.waitForTimeout(300);

    const noteTA = await page.$('.noteEditTa');
    if (noteTA) {
      console.log('  ✅ メモ入力エリアが開いた');
      await page.fill('.noteEditTa', 'くろちゃんテスト用');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      console.log('  ✅ コメント「くろちゃんテスト用」を追加');
    } else {
      console.log('  ❌ メモ入力エリアが開かなかった');
    }
  }
  await ss(page, '05_comment_added');

  // 再スクロールして状態確認
  await page.evaluate((idx) => {
    const scroll = document.getElementById('scroll');
    scroll.scrollLeft = Math.max(0, idx * 46 - 400);
  }, IDX_713);
  await page.waitForTimeout(300);
  await ss(page, '06_both_data_view');

  // ===========================
  // STEP 5: スケジュール部テスト
  // ===========================
  console.log('\n=== STEP 5: スケジュール部（タスク）カーソル・ドラッグテスト ===');

  const taskEl = await page.evaluate(() => {
    // くろちゃんテスト用タスクを探す
    const tasks = document.querySelectorAll('.task');
    for (const t of tasks) {
      if (t.textContent.includes('くろちゃんテスト用')) {
        const r = t.getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          inView: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
        };
      }
    }
    return null;
  });
  console.log('  タスク要素位置:', JSON.stringify(taskEl));

  if (taskEl && taskEl.inView) {
    // カーソルスタイル（CSSプロパティ）
    const taskCss = await page.evaluate(() => {
      const tasks = document.querySelectorAll('.task');
      for (const t of tasks) {
        if (t.textContent.includes('くろちゃんテスト用')) {
          const cs = window.getComputedStyle(t);
          const mkEl = t.querySelector('.mk');
          const mkCs = mkEl ? window.getComputedStyle(mkEl) : null;
          return {
            cursor: cs.cursor,
            mkCursor: mkCs ? mkCs.cursor : 'N/A'
          };
        }
      }
      return null;
    });
    report.schedule.cursor = taskCss ? taskCss.cursor : 'N/A';
    report.schedule.mkCursor = taskCss ? taskCss.mkCursor : 'N/A';
    console.log('  📐 .task cursor:', report.schedule.cursor);
    console.log('  📐 .mk  cursor:', report.schedule.mkCursor);

    // ホバー確認
    await page.mouse.move(taskEl.x, taskEl.y);
    await page.waitForTimeout(400);
    await ss(page, '07_schedule_hover');
    console.log('  ✅ タスクにホバー');

    // ドラッグ（7/13 → 7/15、2日右へ）
    const targetX = taskEl.x + DAY_W * 2;
    console.log('  🖱 ドラッグ: タスクを2日右（7/15）へ移動開始');
    await slowDrag(page, taskEl.x, taskEl.y, targetX, taskEl.y);
    await ss(page, '08_schedule_dragging');

    const draggingClass = await page.evaluate(() => !!document.querySelector('.task.dragging'));
    report.schedule.draggingClass = draggingClass;
    console.log('  📌 .draggingクラス付与:', draggingClass);

    await page.mouse.up();
    await page.waitForTimeout(600);
    await ss(page, '09_schedule_after_drop');

    // ドロップ後の日付確認
    const taskAfterDate = await page.evaluate(() => {
      const tasks = document.querySelectorAll('.task');
      for (const t of tasks) {
        if (t.textContent.includes('くろちゃんテスト用')) {
          return t.style.left;
        }
      }
      return null;
    });
    report.schedule.afterDropLeft = taskAfterDate;
    // 元の位置 = IDX_713 * DAY_W + 2 = 193*46+2 = 8880px (scrollから相対)
    // 移動後 = 2日分右
    const expectedMoved = taskAfterDate !== (IDX_713 * DAY_W + 2) + 'px';
    report.schedule.moveResult = taskAfterDate;
    console.log('  📍 ドロップ後のタスク left:', taskAfterDate);
    console.log('  ' + '✅' + ' ドラッグ移動: left値変化=' + (expectedMoved ? 'あり' : 'なし'));
  } else {
    report.schedule.error = 'タスクがビューポートに見つかりません';
    console.log('  ❌', report.schedule.error);
  }

  // ===========================
  // STEP 6: コメント部テスト
  // ===========================
  console.log('\n=== STEP 6: コメント部（メモ欄）カーソル・ドラッグテスト ===');

  // コメントセルを再スクロールして確認
  await page.evaluate((idx) => {
    const scroll = document.getElementById('scroll');
    scroll.scrollLeft = Math.max(0, idx * 46 - 400);
  }, IDX_713);
  await page.waitForTimeout(300);

  const noteEl = await page.evaluate(() => {
    const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      inView: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
      hasClass: el.classList.contains('has'),
      classList: Array.from(el.classList).join(', '),
      textContent: el.textContent
    };
  });
  console.log('  コメントセル情報:', JSON.stringify(noteEl));

  if (noteEl && noteEl.inView) {
    // カーソルスタイル
    const noteCss = await page.evaluate(() => {
      const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const emptyEl = document.querySelector('#daynotes .ncell:not(.has)');
      const emptyCs = emptyEl ? window.getComputedStyle(emptyEl) : null;
      return {
        hasCursor: cs.cursor,
        emptyCursor: emptyCs ? emptyCs.cursor : 'N/A'
      };
    });
    report.comment.cursor = noteCss ? noteCss.hasCursor : 'N/A';
    report.comment.emptyCursor = noteCss ? noteCss.emptyCursor : 'N/A';
    console.log('  📐 .ncell.has  cursor:', report.comment.cursor);
    console.log('  📐 .ncell(空)  cursor:', report.comment.emptyCursor);

    // スクロールダウンして完全にコメント欄が見えるように
    await page.evaluate(() => {
      const scroll = document.getElementById('scroll');
      scroll.scrollTop = 300;
    });
    await page.waitForTimeout(300);

    const noteEl2 = await page.evaluate(() => {
      const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        inView: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
      };
    });
    console.log('  スクロール後コメントセル:', JSON.stringify(noteEl2));
    await ss(page, '10_comment_view');

    if (noteEl2 && noteEl2.inView) {
      // ホバー確認
      await page.mouse.move(noteEl2.x, noteEl2.y);
      await page.waitForTimeout(400);
      await ss(page, '11_comment_hover');
      console.log('  ✅ コメントセルにホバー');

      // ドラッグ（7/13 → 7/15、2日右へ）
      const targetX2 = noteEl2.x + DAY_W * 2;
      console.log('  🖱 ドラッグ: コメントを2日右（7/15）へ移動開始');
      await slowDrag(page, noteEl2.x, noteEl2.y, targetX2, noteEl2.y);
      await ss(page, '12_comment_dragging');

      const noteDraggingClass = await page.evaluate(() => !!document.querySelector('.note-dragging'));
      const noteDragOver = await page.evaluate(() => !!document.querySelector('.note-drag-over'));
      report.comment.noteDraggingClass = noteDraggingClass;
      report.comment.noteDragOver = noteDragOver;
      console.log('  📌 .note-draggingクラス付与:', noteDraggingClass);
      console.log('  📌 .note-drag-overクラス付与:', noteDragOver);

      await page.mouse.up();
      await page.waitForTimeout(600);
      await ss(page, '13_comment_after_drop');

      // ドロップ後の確認
      const note713After = await page.evaluate(() => {
        const el713 = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
        const el715 = document.querySelector('#daynotes .ncell[data-date="2026-07-15"]');
        return {
          text713: el713 ? el713.textContent.trim() : null,
          text715: el715 ? el715.textContent.trim() : null,
          has713: el713 ? el713.classList.contains('has') : false,
          has715: el715 ? el715.classList.contains('has') : false
        };
      });
      report.comment.after = note713After;
      console.log('  📍 7/13コメント(after):', note713After.text713, '(.has=' + note713After.has713 + ')');
      console.log('  📍 7/15コメント(after):', note713After.text715, '(.has=' + note713After.has715 + ')');

      const commentMoved = note713After.has715 && !note713After.has713;
      report.comment.moveResult = commentMoved ? '移動成功' : 'その場のまま or 失敗';
      console.log('  ' + (commentMoved ? '✅' : '⚠️') + ' コメントドラッグ移動:', report.comment.moveResult);
    }
  } else {
    report.comment.error = 'コメントセルがビューポートに見つかりません';
    console.log('  ❌', report.comment.error);
  }

  await ss(page, '14_final');

  // ===========================
  // REPORT
  // ===========================
  const sep = '='.repeat(65);
  console.log('\n' + sep);
  console.log('📊 テスト結果レポート');
  console.log('   スケジュール部 vs コメント部 ドラッグ動作比較');
  console.log(sep);

  console.log('\n┌─ カーソルスタイル比較 ────────────────────────────────────');
  console.log('│  スケジュール部 .task          cursor: ' + (report.schedule.cursor || 'N/A'));
  console.log('│  スケジュール部 .task .mk      cursor: ' + (report.schedule.mkCursor || 'N/A'));
  console.log('│  コメント部     .ncell.has     cursor: ' + (report.comment.cursor || 'N/A'));
  console.log('│  コメント部     .ncell(空)     cursor: ' + (report.comment.emptyCursor || 'N/A'));
  console.log('└────────────────────────────────────────────────────────────');

  console.log('\n┌─ ドラッグ動作比較 ────────────────────────────────────────');
  console.log('│  スケジュール部:');
  console.log('│    .draggingクラス付与:    ' + report.schedule.draggingClass);
  console.log('│    ドロップ後 left:        ' + (report.schedule.moveResult || 'N/A'));
  console.log('│  コメント部:');
  console.log('│    .note-draggingクラス:  ' + report.comment.noteDraggingClass);
  console.log('│    .note-drag-over:       ' + report.comment.noteDragOver);
  console.log('│    ドロップ後移動:         ' + (report.comment.moveResult || 'N/A'));
  console.log('└────────────────────────────────────────────────────────────');

  console.log('\n┌─ 差異サマリー ─────────────────────────────────────────────');
  const c1 = report.schedule.cursor !== report.comment.cursor;
  console.log('│  ' + (c1 ? '❗' : '✅') + ' カーソル差異: ' + (c1 ? 'あり' : 'なし'));
  if (c1) {
    console.log('│      スケジュール: ' + report.schedule.cursor);
    console.log('│      コメント:     ' + report.comment.cursor);
    console.log('│  → ドラッグ可能なことを示す「つまむ」カーソル（grab/pointer）が');
    console.log('│    コメント部に設定されていない');
  }
  const c2 = report.schedule.draggingClass !== report.comment.noteDraggingClass;
  console.log('│  ' + (c2 ? '❗' : '✅') + ' ドラッグ開始クラス差異: ' + (c2 ? 'あり' : 'なし'));
  if (!report.comment.noteDraggingClass) {
    console.log('│  → コメント部のドラッグが開始されない（.note-draggingクラスが付かない）');
  }
  console.log('└────────────────────────────────────────────────────────────');

  const reportPath = path.join(__dirname, 'test_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n📁 詳細レポート: test_report.json');
  console.log('📁 スクリーンショット: screenshots/ (' + fs.readdirSync(SS_DIR).length + '枚)');

  await browser.close();
  console.log('\n✅ テスト完了');
})().catch(e => {
  console.error('\nFATAL ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
});
