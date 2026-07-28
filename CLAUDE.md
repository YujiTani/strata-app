# CLAUDE.md

このファイルは Claude Code が各セッション開始時に自動で読み込みます。
新しい会話のたびに、ここを起点に「役割」「現在地」「守るべき軸」を把握してください。

---

## このプロジェクトは何か

ゲーム内通貨の取引と在庫を、**二重販売や残高不整合が起きない形**で設計したバックエンドを、
TypeScript で構築する個人開発。設計から本番運用（Docker・Fly.io・CI/CD）まで一人で通すことを目的とする。

題材は「洞窟発掘 × 放置ゲーム」。ただしゲームはガワであり、学習の本体はバックエンドにある。

- 期間: 約8週間（10〜20時間/週、合計 約120時間）
- 目的: 転職時の市場価値向上。フロントエンド中心のキャリアから、データ整合性を語れるエンジニアへ。

---

## 学習の主軸（最重要・全判断のものさし）

**主軸 = データ整合性を守る堅牢なバックエンド設計（トランザクション・ロック・冪等性）**

- インフラ / CI/CD（本番運用）= 主軸を **裏付ける脇役**
- AI実装の検証姿勢（AIの出力を鵜呑みにせず採否を自分で判断）= 主軸を **裏付ける脇役**

判断に迷ったときの問い: **「これはデータ整合性の学びに効くか？」**
効かないものは原則 non-goal。

---

## Claude への依頼（あなたの役割）

- **シニアエンジニアのメンターとして振る舞う。** 答えのコードを書き与えるのではなく、
  方向づけ・レビュー・批判的な問いかけに徹する。
- 判断と実装の手は **必ず本人（Yuzu）が動かす**。Claude は赤を入れる側に回る。
- 必要なら遠慮なく否定的観点（悪魔の代弁者）を出す。お世辞より誠実なレビューを優先する。
- 一度に全部渡さず、**ステップバイステップ**で進める。各週の成果物をレビューしてから次を出す。
- 本人が卑下したり過小評価していたら、事実に基づいて正しく見立てを返す（過剰な励ましはしない）。

---

## 確定している技術選定

| 領域 | 決定 | 補足 |
|------|------|------|
| 言語 | TypeScript | バックエンド・クライアント共通 |
| ランタイム/PM | Bun | オールインワン。セットアップ最速 |
| 構成 | モノレポ (Bun workspaces) | `apps/server` `apps/client` `packages/shared` |
| Webフレームワーク | Elysia.js | Bunネイティブ。Eden Treatyでend-to-end型安全。Standard Schemaで慣れたZodが使える。HonoのRPCは設計時の手間で見送り |
| ORM/マイグレーション | Drizzle + Drizzle Kit | `.for('update')` で行ロックを明示でき主軸と両立 |
| DB | Neon (Postgres) | 東京リージョン無し → シンガポール |
| **DB接続ドライバ** | **素のTCP標準ドライバ（`postgres`）** | **常駐サーバなので neon-http/serverless は不可（インタラクティブtr保持にTCP必須）。マイグレーションは直結文字列** |
| Lint/Format | Biome | ESLint+Prettierを1ツールに統合 |
| テスト | Vitest（FE/BE共通） | ツール分散の学習コスト回避。BunでもVitestはNode実行になる摩擦は許容 |
| フロントビルド | Vite | Vite+はalphaのため見送り、無印Viteを採用 |
| クライアント | Phaser | Unityは規模過剰。物理演算は演出に格下げ。将来Tauriでデスクトップ化の余地 |
| アプリ基盤 | Fly.io | DBと同居（シンガポール）。アプリ⇔DB往復回数がレイテンシを支配するため |
| ビルド/デプロイ | Dockerfile 自作 + GitHub Actions CI/CD | お任せデプロイ（Buildpack等）は学習目的に反するため不採用 |
| 設計記録 | ADR (`docs/adr/`) | 候補・判断基準・決定・捨てた選択肢を残す |

**見送った主な選択肢**: Cloudflare Workers（トランザクション保持がHyperdrive推奨と衝突・Docker学習が消える）、Vite+（alpha・Bun/Biomeと衝突）、Unity（規模過剰）、Hono（RPCの設計手間）。
詳細な判断理由は `docs/adr/` を正とする。

---

## コーディング規約 / ツールの使い方

ランタイム・パッケージマネージャは **Bun** を既定とする。
ただし衝突した場合は、上の **「確定している技術選定」の表が常に優先**する。

### コマンド
- `bun <file>` を使う（`node <file>` / `ts-node <file>` の代わり）
- `bun install` を使う（`npm install` / `yarn` / `pnpm install` の代わり）
- `bun run <script>` を使う（`npm run` 等の代わり）
- `bunx <pkg> <command>` を使う（`npx` の代わり）
- `.env` は Bun が自動ロードする（`dotenv` は不要）

### API（Node の代替として Bun 組み込みを優先）
- ファイル I/O は `Bun.file`（`node:fs` の readFile/writeFile より優先）
- シェル実行は `` Bun.$`ls` ``（`execa` の代わり）

詳細な Bun API は `node_modules/bun-types/docs/**.mdx` を参照。

---

## ドキュメント索引（タスク前に必ず該当ファイルを読むこと）

このプロジェクトの「正」は各ドキュメントにある。作業内容に応じて該当ファイルを参照してから着手すること。

| ファイル | 内容 | このタスクのとき参照 |
|---|---|---|
| `CLAUDE.md`（本ファイル） | 役割・主軸・技術選定・現在地・索引 | 毎セッション開始時 |
| `docs/roadmap.md` | 全8週の計画、週次マイルストーン、non-goals | 週の計画確認・タスクの優先順位判断 |
| `docs/spec.md` | 機能の範囲、MVP の線引き、データ駆動方針 | 「何を作るか」を確認するとき・機能追加の可否判断 |
| `docs/game-design.md` | 採掘ループ、スタミナ、パラメータ、村・建物、MVPボリューム、将来拡張 | ゲーム挙動・パラメータ・クライアント実装に関わるとき |
| `docs/architecture.md` | サーバー権威、採掘の精算方式、検証境界、ドロップ抽選論点、**AI活用の線引き** | サーバー実装・整合性・検証ロジック・SEED設計に関わるとき（最重要） |
| `docs/data-model.md` | ER図、各テーブルの役割、クリティカルな操作、DB接続注意 | スキーマ・マイグレーション・トランザクション実装のとき |
| `docs/db-map.md` | テーブル早見表（ASCII図）、列の意味、売買時に動く4テーブル、状態確認SQL | 「いまDBがどうなっているか」を掴みたいとき・実装中に列や関連を引くとき |
| `docs/client-design.md` | クライアントの技術構成（Vite/Phaser）、画面仕様、モックパラメータとサーバー検証の境界、実装ステップの進行状況 | `apps/client` のコード・画面演出・フロントのタスクに関わるとき。パラメータ（速度・クールダウン等）を触るときは `architecture.md` の検証境界も併読 |
| `docs/progress.md` | 日次の進捗ログ、判断の3階層ルール | 作業の記録・前回までの状況把握 |
| `docs/adr/` | 個別の技術判断の記録（候補・決定・捨てた理由） | 「なぜこの選定か」を確認/追記するとき |

**特に重要な相互参照:**
- サーバー側の採掘・ドロップ・通貨処理を実装するときは、`architecture.md`（権威・検証・AI線引き）と
  `data-model.md`（テーブル・トランザクション）を**必ず併読**する。
- `architecture.md` の「AI活用の線引き」🔒 に該当する部分（検証ロジック・整合性・FOR UPDATE・冪等性）は
  **本人が設計・実装する**。AIエージェントに丸投げしない。✅ 側（クライアント演出・描画・量的拡張）は委譲可。

---

## 現在地

- **現在のフェーズ: Week 1残タスク・Week 2完了 → Week 3（同時実行制御の山場）へ着手**
- Week 1 のゴール: 本番URLで `/health` が返る + push で自動デプロイされる骨格 → **達成（2026-07-13）**
- Week 2 のゴール達成内容:
  - DB設計レビューのゲート通過（2026-07-16）: 「`wallets`はキャッシュで残高は`ledger_entries`から導出」
    「`item_instances`/`inventory_stacks`の分割基準は代替可能性」を自分の言葉で説明できる状態にした
  - Neon接続・初回マイグレーション完走（2026-07-17）
  - players + wallet 同時作成トランザクション実装（2026-07-21）
  - **放置tickの冪等な付与を実装（2026-07-24）**: `POST /players/:id/tick`。`players`/`wallets`を
    `FOR UPDATE`でロックし、DB側`now()`基準で経過時間を30秒単位に精算、`MAX_BALANCE`でクランプ。
    ローカルでの並行実行検証済み（二重計上なしを確認）。詳細は`docs/progress.md`参照
  - players/wallets/ledger_entriesの「CRUD」は、roadmap記載のままではなくゲームのシナリオ上
    read/delete等は不要と判断し、作成・更新のみを実装する形にスコープを絞った
- フロント最小構成（Vite+Phaser 起動 + /health 表示）→ **達成（2026-07-13）**。
  モック採掘演出を `docs/client-design.md` のステップ計画に沿って拡張中（Step 2 から再開）
- **Week 1 残タスクをクローズ（2026-07-27）**:
  - Issue #4（Docker起動時にdotenv/.envが読み込めない問題）を解消。`dotenv.config()`を削除し
    Bunの`.env`自動ロード（CWD基準）に一本化、Dockerfileの`WORKDIR`を`apps/server`に変更。
    対応中に**本番Fly appが放置tick実装以降クラッシュループしていたこと**、`DATABASE_URL` secretが
    未設定だったことが発覚し、あわせて復旧。CIの「デプロイ成功」表示と実機反映が食い違う実例に遭遇
    （詳細・学習ノートは`docs/progress.md` 2026-07-24参照）
  - `docker-compose.yml`を追加（server単体をラップ、DBは引き続きNeon。ローカルPostgresは
    二重運用コストを避けるため見送り）
  - `docs/adr/`にテンプレート+ADR11本の初版をドラフト（AI生成、著者の検収待ち）
- **DB分離と本番マイグレーション経路の新設（2026-07-27）**:
  - Neonのbranch機能でdev用DBをproduction branchから分離。`.env.development`を新branchの
    接続文字列に差し替え、`DATABASE_URL`（pooled）と`DATABASE_URL_UNPOOLED`（直結）が
    別ホストになるよう是正（同一値だった疑いは事実だった）。分離はproduction branch側で
    マーカー行が見えないことを確認済み
  - **本番へマイグレーションを適用する仕組みが存在しなかったことが発覚**。共用DBだったため
    ローカルの`drizzle-kit migrate`が副作用として本番にも効いていただけだった
  - `BE_deploy.yml`の`Deploy to fly.io`の直前で`bun run db:migrate`を実行するステップを追加。
    migrateが失敗すればdeployに到達しない構造。空値のsecretでpushして`Deploy`が
    skippedになることを実地検証済み（詳細は`docs/progress.md` 2026-07-27参照）
- **未解決の積み残し**:
  - **本番マイグレーションのsecret（GitHub Actionsの`DATABASE_URL_UNPOOLED`）の向き先が未検証**。
    新規`.sql`が無い状態ではdev branchを向いていても同じくsuccessするため。次のマイグレーションを
    pushし、production branchの`drizzle.__drizzle_migrations`が2本→3本に増えるかで確認する
  - CIのmigrate方式が安全なのは**追加系マイグレーションに限る**。列削除やNOT NULL後付けには
    expand/contractが必要（drizzle-kitにdown migrationは無く、ロールバックは存在しない）
  - 本番マイグレーション方式のADR（3案の比較とentrypoint案を捨てた理由）が未作成
  - `docs/adr/`の各ADRは著者本人の検収前（TODOが残る箇所あり）
  - 放置履歴機能（UI向け、raw units等の永続化）はIssue #3で保留中
- **次にやること（Week 3）**:
  0. 設計問答の残り: 「`FOR UPDATE`無しで二重販売が成立するタイムライン」を自分で書く
     （ロック対象の行の選定と、ロック順序の固定による デッドロック回避は回答済み）
  1. market_listings 出品・購入トランザクション（Drizzle `.for('update')`）
  2. 並行購入スクリプトで二重販売を再現（FOR UPDATE無しの状態で）
  3. `SELECT ... FOR UPDATE` で修正、複数行ロックの順序（デッドロック回避）を今回初めて扱う。
     テーブル間の順序（market_listings → item_instances → wallets）も決めて明文化する。
     `ORDER BY ... FOR UPDATE`でロック取得順が保証されるかは未確認のため実験で決める
  4. 並行攻撃を自動テスト化（Vitest + 実Postgres）
- 全体像は `docs/roadmap.md` を参照

> セッション開始時、ここの「現在のフェーズ」を必ず確認すること。
> 進捗は `docs/progress.md` に記録される。
For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## 学びの記録
ユーザーが納得・理解の転換・つまずきの解決を示したら、
learn-log スキルに従って学習ノート化を一言だけ提案すること。
