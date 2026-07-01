# スライド式スケジュール管理アプリ — 設計メモ（CLAUDE.md）

新規セッションでもこの1ファイルを読めば設計と現状を引き継げるようにまとめたもの。

---

## 0. 作業ルール（必読）

- **開発・リリースともに `schedule-pwa/` フォルダで行う**（`schedule-management/` は廃止）。
- **ローカル確認**：`C:\Users\shima\Claude\schedule-pwa\index.html` をブラウザで直接開いて動作確認する。
- **リリース（GitHub Pages 更新）はともきさんが「リリースして」と言ったときだけ**：`git add/commit/push` を行う。

---

## 1. 目的 / コンセプト
- 横軸＝日付の連続タイムライン。**左右スライドでページをめくらず予定全体を俯瞰**できるスケジューラ。
- セルにタスク／予定を柔軟に置ける。出張など連日タスクや、マイルストーン（重大イベント）も扱える。
- 利用環境：**Windows ＋ iPhone**。Cloudflare Workers 経由でデバイス間同期。

## 2. 利用者
- 島袋 智樹（NML / 製造・SCMシステム部門）。Microsoft 365 環境。

## 3. 機能要件
- 横スクロールの連続タイムライン（年単位を左右移動）。今日位置は赤い縦線＋ドット。
- **種別**：`■ 予定（未確定）` / `□ 確定` / `★ マイルストーン`。
- **連日タスク**：`□＝□＝□タイトル` のように日数ぶんのマーカーを `＝` で連結表示（出張など）。
- **曜日色**：土＝青、日＝赤。**休日は列ごとグレー**。ただし**休日にもタスクは置ける**。
- **タスク表示**：タイトル＋任意オプション（時間・場所・人）。無ければタイトルのみ。

## 4. 操作仕様（確定済みルール）
- **セル直接入力**：空セルをクリックするとその場に入力ボックスを表示。種別は**未確定■がデフォルト**、**Enterで登録**（Escでキャンセル）。
- **未確定→確定**：タスク先頭の `■` をタップ → 「**確定しますか？**」確認ダイアログ（はい／いいえ）。
- **確定→未確定**：`□` タップでは戻せない。**追加・編集ポップ内の種別ボタンでのみ**変更可能。
- **連日設定**：**Shift＋ドラッグ**で複数日を選択（青ハイライト）→ 離すと選択範囲に入力ボックス → タイトル入力＋Enterで連日タスク登録。iPhone（Shift無し）では編集ポップの「終了日」で連日指定。
- **休日トグル**：日付ヘッダーをクリックで平日↔休日（グレー）を切替。土日は常時グレー。
- **選択／削除**：タスクを**1クリックで選択**（青枠ハイライト）→ **Delete／Backspaceキーで削除**。Escで選択解除。
- **編集**：タスクを**ダブルクリック（ダブルタップ）**で編集ポップ（確定□／★のマーカータップでも編集ポップ）。ポップ内に削除ボタンあり。
  - ※ 標準 `dblclick` は使わず**自前のダブルタップ検出**（同一タスクを `DBL_MS=320ms` 以内に2回タップ）で判定。§11 参照。
- **ドラッグ移動**：タスク本体を**ドラッグ＆ドロップ**で任意セルへ移動。連日タスクは日数を保持したまま移動。
- **スクロール**：ドラッグで**左右・上下**に移動できる（縦横両対応）。メモ欄編集中はドラッグしてもスクロールせずテキスト選択が可能。
- **月ジャンプ**：ヘッダーの ◀ ／ ▶ ／ 月セレクタで月単位ジャンプ。
- **メモ欄**：ダブルクリック（ダブルタップ）でその日のフリーテキスト入力。2段あり（メモ①・メモ②）。

## 5. オプション直接入力の文法
セル直接入力時、以下の記号でオプションを解析する：
- `@` … **時間**（例 `@18:00`）
- `in` … **場所**（例 `in 横浜駅`）
- `with` … **人**（例 `with 田中`）
- 例：`食事会 @18:00 in 横浜駅 with 田中` → タイトル「食事会」／時間「18:00」／場所「横浜駅」／人「田中」
- 解析は `app.js` の `parseInline()` が担当。

## 6. データモデル（最重要）
グリッドではなく **タスク1件＝1レコード** で保持し、毎回タイムラインへ描画し直す設計。
```
task = {
  id:        一意ID,
  type:      'plan' | 'fix' | 'ms',
  title:     文字列,
  start:     'YYYY-MM-DD',
  end:       'YYYY-MM-DD' | '',
  lane:      整数,
  time:      文字列,
  place:     文字列,
  who:       文字列,
  updatedAt: ISO文字列,       // 最終更新時刻（同期の競合解決用）
  deleted:   boolean,         // ★ tombstone削除フラグ（trueでも配列には残す）
  deletedAt: ISO文字列        // ★ 削除時刻
}
state = {
  schemaVersion: 1,
  meta: { updatedAt: ISO文字列, owner: 文字列 },
  tasks: task[],              // deleted:true のタスクも含む（描画時に除外）
  holidays: 'YYYY-MM-DD'[],
  routineRows: routineRow[],
  dayNotes:  { 'YYYY-MM-DD': 文字列 },   // メモ欄①
  dayNotes2: { 'YYYY-MM-DD': 文字列 }    // メモ欄②
}
routineRow = {
  id:      一意ID,
  label:   文字列,                        // 行名（例:「ジム」「出社」）
  color:   '#rrggbb',                    // 背景色
  markers: 文字列[],                     // クリックで順番に切替えるマーカー候補（例:['MH','MY']）
  cells:   { 'YYYY-MM-DD': 文字列 }      // 日付ごとの入力値
}
```
- **タスク削除はtombstone方式**：`filter` で消さず `deleted:true` を立てる。`render()` で `!t.deleted` にフィルタして表示。これにより削除情報がクラウド同期で相手デバイスに伝わる。
- **タスクを変更するたび** `stamp(t)` で `task.updatedAt` を更新。
- `save()` は `meta.updatedAt` を現在時刻に更新し localStorage に暗号化保存する。

## 7. 技術選定 / アーキテクチャ
- 方針：**PWAライクなWebアプリ**。1コードで Windows / iPhone 両対応。
- **ファイル構成**：

  | ファイル | 役割 |
  |---|---|
  | `index.html` | 画面の骨組み（DOM構造）のみ |
  | `styles.css` | 見た目（全スタイル） |
  | `app.js` | 描画・操作ロジック（スライド／連日選択／D&D／追加・編集／月ジャンプ／祝日トグル／クラウド同期） |
  | `store.js` | 保存アダプタ（localStorage・暗号化・クラウドマージ） |
  | `apple-touch-icon.png` | iPhone ホーム画面アイコン |
  | `icon-192.png` / `icon-512.png` | PWA アイコン |

  読み込み順は `store.js` → `app.js`。
- 主要定数：`DAY_W=46px`（1日幅）、`LANE_H=30px`（行高）、`HEAD_H=70px`、`NOTE_H=100px`（メモ欄高）、表示範囲 `2026-01-01〜2026-12-31`。

## 8. 保存モデル（localStorage のみ）
`store.js` が localStorage に AES-256-GCM + PBKDF2（10万回）で暗号化して保存する。

- **キー**：`schedTimeline.v2`（新スキーマ）。旧 `schedTimeline.v1` は `migrate()` で自動取り込み。
- **すべての変更で即書き込み**（`Store.saveLocalEnc`）。
- ファイル連携（File System Access API / schedule.json）は廃止済み。

### クラウド同期（Cloudflare Workers）
- **Worker URL**：`https://schedule-sync.shimabukuro-tomoki.workers.dev`
- **KV namespace ID**：`d1b78c8c7330483385f38f8d46604c3d`
- **同期コード**（localStorageキー: `cloudSyncKey`）で識別。デバイス間で同じコードを使う。
- **API**：GET `/?key={syncKey}` でデータ取得 / POST `/?key={syncKey}` でデータ保存。データはAES暗号化済みのまま保存。

### マージ戦略（`Store.mergeStates(local, cloud)`）
- **tasks**：IDごとに `updatedAt` を比較し新しい方を採用。tombstone（`deleted:true`）も伝播する。
- **holidays / routineRows / dayNotes / dayNotes2**：`meta.updatedAt` が新しい方のデータを丸ごと採用。

### 同期フロー（`cloudSync(silent)` in app.js）
1. Cloudflare から取得
2. `Store.mergeStates(local, cloud)` でマージ
3. マージ結果をCloudflareへ書き戻し
4. localStorageに保存・再描画

- **起動時**：同期コードが設定済みなら `afterAuth()` でサイレント自動同期。
- **未同期インジケーター**：`save()` が呼ばれると ☁️同期ボタンに **緑◎** が表示される。同期完了後に消える。

### ツールバー（現在）
| ボタン | 機能 |
|---|---|
| ☁️ 同期 | クラウドと双方向同期（初回のみ同期コード入力） |
| 🔑 | 同期コードの確認・変更 |
| 🔐 | パスワード変更 |
| ⚙ ルーティン | ルーティン行の設定 |

## 9. 成果物 / ファイル
- `index.html` … 画面の骨組み。
- `styles.css` … スタイル。
- `app.js` … 描画・操作ロジック本体。
- `store.js` … 保存アダプタ（localStorage ＋ Cloudflare同期）。
- `apple-touch-icon.png` / `icon-192.png` / `icon-512.png` … アイコン。
- `CLAUDE.md` … 本設計メモ。

## アクセス方法
| 方法 | URL / パス | 備考 |
|---|---|---|
| スマホ（iPhone） | `https://tomoki-0104.github.io/slide-schedule/` | GitHub Pages |
| 個人PC | `C:\Users\shima\Claude\schedule-pwa\index.html` | ローカルHTML直接起動 |
| 会社PC | GitHubから `index.html` をダウンロードして起動 | Cloudflare FW通過は未確認 |

- **GitHubリポジトリ**：`https://github.com/tomoki-0104/slide-schedule`（Public）
- gh CLI インストール済み、`tomoki-0104` でログイン済み。

## 10. 現状（2026-07-01 時点）
- **フォルダ統合**：`schedule-management/`（開発用）と `schedule-pwa/`（公開用）を統合。`schedule-pwa/` が唯一の正本。
- **クラウド同期**：Cloudflare Workers + tombstone方式でPC・スマホ双方向同期が動作。
- **GitHub Pages**：`https://tomoki-0104.github.io/slide-schedule/` でスマホからアクセス可能。
- **実装済み主要機能**：タスク追加・編集・削除（tombstone）・ドラッグ移動・連日タスク・ルーティン行・メモ欄2段・縦横スクロール・月ジャンプ・パスワード認証（AES-256-GCM）・クラウド双方向同期。

## 11. ダブルクリック修正の経緯（技術メモ）
- **症状**：タスクをダブルクリックしても編集ポップが開かなかった。
- **原因**：1クリック目の `pointerup` で `render()` が `lanes.innerHTML` を丸ごと再構築するため、ブラウザ標準の `dblclick` が「同一要素上の2連続クリック」と認識されず発火しなかった。
- **対策**：標準 `dblclick` リスナを廃止し、`pointerup` 内で自前のダブルタップ検出（`lastTapId` + `lastTapTime`、`DBL_MS=320ms`）を実装。PC・iPhone 共通で動作。

## 12. 次の候補（未着手）
1. 日本の祝日自動グレー化。
2. PWA化：ホーム画面追加・オフライン対応。
3. iPhoneでの連日操作（ロングプレス等）の追加。
4. 会社PCでCloudflare Workers URLがFWでブロックされないか確認。
