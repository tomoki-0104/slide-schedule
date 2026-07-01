# schedule-pwa ブラウザテスト

Playwright を使ったスケジュールアプリのブラウザ動作テスト。

## セットアップ

```bash
cd browser-tests
npm install
npx playwright install chromium
```

## テスト実行

```bash
npm test
# または
node drag_comparison_test.js
```

> `localhost:3000` が起動済みであること（`schedule-pwa/` をサーバ提供、またはファイルプロトコル）。
> 既存データがある場合は `SCHED_PWD=xxxx` 環境変数でパスワードを渡す。
> 環境変数なし・localStorage 空の場合はテスト用パスワード `0000` で自動登録。

## テストスクリプト

| ファイル | 内容 |
|---|---|
| `drag_comparison_test.js` | スケジュール部 vs コメント部のドラッグ動作比較テスト |

## 出力

| 出力先 | 内容 |
|---|---|
| `screenshots/` | テスト各ステップのスクリーンショット（14枚） |
| `test_report.json` | カーソルスタイル・ドラッグ動作の比較結果JSON |

## テスト結果サマリー（2026-07-02 実施）

### カーソルスタイル比較

| 要素 | cursor値 |
|---|---|
| スケジュール部 `.task` | `pointer`（人差し指） |
| スケジュール部 `.task .mk` | `pointer` |
| コメント部 `.ncell.has`（入力済み） | `grab`（親 `#scroll` から継承） |
| コメント部 `.ncell`（空） | `grab`（同上） |

### ドラッグ動作比較

| 項目 | スケジュール部 | コメント部 |
|---|---|---|
| ドラッグ中クラス付与 | `.dragging` ✅ | `.note-dragging` ✅ |
| ドロップ先ハイライト | なし | `.note-drag-over`（点線枠）✅ |
| ドロップ後の移動 | 成功（日付更新）✅ | 成功（コメント移動）✅ |

### 差異サマリー

#### カーソル差異（❗ 要修正）
- スケジュール部はタスクにホバーすると `cursor: pointer`（人差し指）に変わる
- コメント部は `.ncell` に cursor 指定がなく、親 `#scroll` の `cursor: grab`（開いた手）が継承される
- 結果：コメントにホバーしても「ドラッグ可能」を示す人差し指アイコンが出ない

#### 修正方法（`styles.css` に1行追加）
```css
.ncell.has, .ncell2.has, .ncell3.has, .ncell4.has, .ncell5.has { cursor: pointer; }
```

#### ドラッグ動作は両方で機能している
- ドラッグ自体は `.has` クラスのあるセルなら動作する
- コメント部のシングルクリックで選択ハイライト（`.sel`）が付く動作は別途除去可能

## スクリーンショット一覧

| ファイル名 | 内容 |
|---|---|
| `01_pw_screen.png` | 初回起動：パスワード設定画面 |
| `02_after_login.png` | ログイン後の初期状態 |
| `03_scrolled_july13.png` | 7/13付近へスクロール後 |
| `04_task_added.png` | スケジュール部にタスク追加後 |
| `05_comment_added.png` | コメント部にコメント追加後 |
| `06_both_data_view.png` | タスク・コメント両方表示 |
| `07_schedule_hover.png` | スケジュール部タスクにホバー |
| `08_schedule_dragging.png` | スケジュール部ドラッグ中 |
| `09_schedule_after_drop.png` | スケジュール部ドロップ後 |
| `10_comment_view.png` | コメント部表示 |
| `11_comment_hover.png` | コメント部にホバー |
| `12_comment_dragging.png` | コメント部ドラッグ中（点線枠あり） |
| `13_comment_after_drop.png` | コメント部ドロップ後 |
| `14_final.png` | 最終状態 |
