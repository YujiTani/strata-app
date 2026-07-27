# 進捗ログ（日次）

作業した日ごとに記録する。3〜5分で書ける軽さを保つこと（重いと続かない）。
新しいセッションの Claude はここを読めば現在地と成長曲線を把握できる。
8週間ぶんのこのログ自体が、面接で語れる「学習記録」の資産になる。

---

## 判断をどこに残すか（3階層ルール）

実装中の「なぜそうしたか」は、粒度で置き場所を分ける。

| 粒度 | 例 | 置き場所 |
| ------ | ---- | --------- |
| 大 | 技術選定、アーキテクチャ方針 | `docs/adr/` (ADR) |
| 中 | この型にした理由、この関数を分けた理由、null許容の判断 | **コミットメッセージ本文** |
| 小 | 今日詰まったこと、気づき、次の一手 | このファイル（日次ログ） |

中粒度をコミットに書くのが最重要。実装と同時に書くので記憶が新鮮で、
面接前に `git log` を読み返せば判断の履歴が時系列で蘇る。

### コミットメッセージの型

```markdown
<種別>: <何をしたか>

なぜこうしたか / 迷った選択肢 / 捨てた理由を2〜4行。
例: listings の購入で FOR UPDATE を採用。楽観ロック(version列)も
検討したが、競合時リトライのUXより、確実に直列化する悲観ロックが
「二重販売を防ぐ」という主軸の説明に直結するため悲観ロックを選択。
```

種別: feat / fix / refactor / test / docs / chore / perf

---

## テンプレート（コピーして使う）

### YYYY-MM-DD（Week N / 第X日）

- **やったこと**:
- **判断/詰まったこと**:（中粒度はコミットへ。ここには概要と「なぜ」のタネ）
- **次**:
- **所要時間**: Xh

---

## ログ

### 2026-07-13（Week 1 / 第1日）

- **やったこと**: GitHub Actions CI/CD導入（`.github/workflows/deploy.yml`）。
  push→lint→typecheck→flyctl deployの自動化。Week 1完了条件（push で自動デプロイ）達成。
- **判断/詰まったこと**:
workflowファイルの書き方。
`name`は、処理内容を模したものにする
`on`は、発火条件。今回は`master`への`push`時のみ
`concurrency`は、順番を問わず常に一つずつ直列で実行するようになる。
`cancel-in-progress`: `false`にしておくと実行中に次の実行が来た際も順番に完了まで行う。中断しない。
`jobs`には`timeout-minutes`設定をして実行時間を無駄に食い潰さないようにしておく。
`jobs`の考え方はDockerイメージ作る時と似ている。
ソースや必要なものをインストール（GitHub公式のActionなどを使う）
外部ソースのツールを使用する際はSHAで固定した方が安全
SecretsはGH CLIを使って設定できる。今回はRepository Secretsに設定しOrganization全体やGitHub上の無関係な他のリポジトリからはアクセスできないようにした。
またFly.ioのトークンを `flyctl tokens create deploy`（デプロイ権限しかない弱いトークン）としたことで、万が一の被害規模が小さくなるように工夫した。

- **次**: docker-compose（ローカルPostgres）、Vite+Phaserのフロント最小構成、
  ADRの清書が残タスク。Week 2はDB設計レビューから。
- **所要時間**:
4h程度


### 2026-07-14（Week 1 / 第2日）

- **やったこと**: フロントソースをClaudeFlarePagesにデプロイした。
デプロイしたバックエンドサーバーとクライアント側を連携。
- **判断/詰まったこと**:
フロントソースのデプロイ先の判断は、以下となる。
- ビルド後は静的ファイルになること
- SSRは必要ないこと
- 画像やJavaScriptの配信が多いこと(CDNが欲しい)
- アセットサイズが制限内に収まるか（超えてもR2における）
CORSエラーの解消に少し時間がかかった、実際は設定できていたがPagesのキャッシュが効いていて正しいレスポンスが取得できてなかった。
- **次**:
  ADRの清書が残タスク。フロント側のgithubActionsワークフローを作っても良さそう。
- **所要時間**:
3h程度

### 2026-07-16（Week 1 / 第3日）

- **やったこと**:
  - `FE_ci.yml` を新規作成。`apps/client` の typecheck・build を検証するCI（デプロイはCloudflare Pages側のGit連携に任せ、
    Actions側は検証のみに専念する設計）。
  - `BE_deploy.yml` に typecheck ステップを追加。従来は `bun run lint`（Biome）のみで型検査をしていなかった。
  - typecheck を `typecheck:be`（ルート＋`packages/shared`）/ `typecheck:fe`（`apps/client`）にスクリプト分割し、
    BE/FEそれぞれが自分の担当範囲だけを検査するように整理。
  - FE_ci導入で発覚した `apps/server/src/index.ts` の型エラー（Elysiaの `HTTPHeaders` 型と自前の `Record<string, string>` の不一致）を修正。
- **判断/詰まったこと**:
  - `concurrency.group` の設計思想: BEは「本番環境」という単一の資源を守るため固定文字列でよいが、CIはブランチごとに
    別々の検証対象なので `${{ github.ref }}` を含めてブランチ専用レーンにする必要がある。BEの設定を無条件にコピペしない。
  - `paths` フィルタの対象選定: `.gitignore`/`biome.json` はtypecheck/buildの結果に影響しないため対象から除外。
  - Bunは型を実行時に検査しないため、CIにtypecheckを入れない限り型エラーが本番デプロイをすり抜ける、という実例に遭遇。
    lintとtypecheckは別物であることを実感した。
  - `package.json` にスクリプトを手で追記した際、タブ/スペース混在でBiomeのフォーマットチェックに引っかかった
    （インデントはタブに統一する）。
- **次**:
  Week 2 開始。`docs/data-model.md` のDB設計レビュー（`wallets`/`ledger_entries`の関係、
  `item_instances`/`inventory_stacks`の分割理由を自分の言葉で説明する）がまだ未着手。
  そのあとNeonのプロジェクト作成（シンガポールリージョン）・接続文字列の取得・サーバー側の依存追加に進む。
- **所要時間**: 2h

### 2026-07-16（Week 2 / 第1日）

- **やったこと**:
  - DB設計レビューのゲート通過。「walletsはキャッシュで、残高の正は追記専用の `ledger_entries` から導出」
    「`item_instances` / `inventory_stacks` の分割基準は代替可能性」を自分の言葉で説明できた。
    - Neonプロジェクト作成（シンガポール ap-southeast-1、PostgreSQL 18.4）。接続文字列2種
    （pooled / unpooled）を `apps/server/.env.development` に保存し、psqlで両方の疎通を確認。
  - 依存追加: `postgres`・`drizzle-orm`（dependencies）、`drizzle-kit`（devDependency）。
  - `apps/server/db/db-check.ts` 作成（`bun run db:check`）。環境変数の起動時ガード、
    失敗時 `process.exitCode = 1`、finallyで `sql.end()`。成功系・失敗系とも動作検証済み。
- **判断/詰まったこと**:
  - 残高導出の考え方: 同一トランザクションが第一の防衛線、ledgerとの照合は保険という整理で腹落ち。
  - 「なぜマイグレーションはunpooled直結か」の説明は一度で腹落ちせず、初回 `drizzle-kit migrate`
    直後に再演する約束で棚上げ中。
- **次**: `db/schema.ts` に players テーブルを定義（UUID生成をDB側/アプリ側どちらにするか、
  timestamptz か timestamp か、name の制約、の3判断を持参）→ drizzle.config → generate → migrate。
- **所要時間**: 3h

### 2026-07-17（Week 2 / 第2日）

- **やったこと**:
  - スキーマの制約強化: timestamp列を全て timestamptz 化、金額4列（balance/amount/price/base_value）を
    integer → bigint(mode:"number") に修正、CHECK制約2本（wallets の残高範囲 0〜999_999_999_999、
    ledger の amount<>0）、カンスト定数 `MAX_BALANCE` を schema.ts に定義。
  - 初回マイグレーション完走: generate → 生成SQLの目視検収 → migrate 成功。
    psql `\dt` で10テーブルの実在と、`\d wallets` でCHECK制約の実体を確認。db:check も pooled/unpooled 両方通過。
  - 棚上げ宿題「なぜマイグレーションはunpooled直結か」をクローズ。
    自分の言葉での結論:「pooled 経由で migrate すると工事屋（マイグレーションツール）が札（セッションに
    紐づくロック）を失う。守る相手は他の客ではなく工事屋自身」。
  - DrizzleをAPIに連携させて、エンドポイントを一つ生やした。
  - **役割分担を更新**: 判断=本人・記述=AI可・検収=本人（生成コード・SQLの各行を自分の判断と対応づけて
    説明できることがゲート）。ADR清書時に `architecture.md` の「AI活用の線引き」へ反映する（宿題）。
- **判断/詰まったこと**:
  - 検収ゲートが実際に機能した: AI生成スキーマの timestamp 無指定（without time zone）と、
    `sql` タグに埋めた定数が `$1` プレースホルダに化ける問題を、生成SQLの目視で migrate 前に捕獲。
    後者は `${sql.raw(String(MAX_BALANCE))}` で解決（sql.raw は自分の定数にだけ使う）。
  - BigIntのJSONシリアライズエラーを理由に integer へ落とすのは「表示層の都合で保存層を曲げる」
    層違いの修理だった。bigint + mode:"number" が正解（カンスト 9999億 < 2^53 で安全）。
  - ledger は元帳でありイベントログではない。0円の出来事の記録は listings / daily_claims 等の責務。
- **次**: コミット。残りは Week 1 積み残し（docker-compose・ADR清書）と、サーバー本体への
  Drizzle クライアント組み込み（db-check を超えて実クエリへ）。
  apps/server/index.tsがごちゃついているので、今後のためにファイルの切り出しを行なっていく。
  徐々に分けていく構想にしたい。できるならDDDなどで分けた方が評価されるかもしれない。
- **所要時間**: 3h

### 2026-07-24（Week 2 / 第3日）

- **やったこと**:
  - players + wallet 同時作成トランザクション（2026-07-21分、コミット漏れの整理も兼ねる）に続き、
    放置tickの冪等な付与（`POST /players/:id/tick`）を実装。roadmapのWeek 2最終項目。
  - `players`・`wallets`を`SELECT ... FOR UPDATE`でロックし、DB側の`now()`を基準に経過時間を
    30秒単位に切り捨てて精算。端数は`last_idle_tick_at`に残して次回へ繰り越し。
    `MAX_BALANCE`の残り枠でクランプ、クランプ後の額が0のときは`wallets`/`ledger_entries`の書き込みを
    スキップ（ただし`players.last_idle_tick_at`の前進は消費単位数が0でない限り実施＝クランプで
    貰えなくても時間は進める。上限到達時に「放置し続ければ得」という誘因を作らないための判断）。
  - `ledger_entries.ref_id`（関連取引ID）に参照先が無い問題に気づき、最小限の`idle_tick_events`
    テーブルを新設（列は`id`/`player_id`/`created_at`のみ）。UI向けの拡張（raw units等）は
    要件未確定のため見送り、Issue #3として保留。
  - ローカルでの動作確認完了（基本フロー・0単位ケース・並行2リクエストでの二重計上なし・
    存在しないプレイヤーの挙動）。途中で実装バグを2件発見・修正:
    `sql<Date>`の型注釈だけでは実行時にDateへ変換されない問題（`.mapWith()`で解決）、
    `idle_tick_events`のマイグレーション未適用。
  - Docker動作確認は、Bunの`.env`自動ロードがカレントディレクトリ依存で、Dockerfileの起動パス
    （リポジトリルートから実行）だと`apps/server/.env.development`を拾えないという既存コードの
    問題にぶつかり中断。Issue #4として切り出し、Task化して保留。
- **判断/詰まったこと**:
  - `UPDATE ... RETURNING`は更新後の値しか返せない、という仕様に気づき、「消費単位数」を
    自己参照UPDATEだけで安全に取り出すのは並行実行下で無理だと判断。今回に限り
    `SELECT ... FOR UPDATE`をWeek3の予定より前倒しで導入（詳細はlearn-logのseed参照）。
  - roadmapには「players/wallets/ledger_entriesのCRUD」とあるが、ゲームのシナリオ上
    read/delete等のフルCRUDは不要と判断し、作成（player作成時のinsert）と更新
    （tick時のUPDATE/INSERT）のみを実装して先に進めることにした。
- **次**: Issue #4（Docker起動時の環境変数問題）の解決。Week 1積み残し（docker-compose・ADR清書）も
  未着手のまま残っている。Week 3（同時実行制御の山場：listings購入、FOR UPDATE、ロック順序、
  並行攻撃の自動テスト化）へ進む前に、これらの整理をどう扱うか判断する。
- **所要時間**: 15h（3日間ぶんの合算。厳密な計測ではないので目安程度）

### 2026-07-24（Week 3 準備 / 第4日）

- **やったこと**:
  - Issue #4を解消（クローズ済み）。`src/index.ts`から`dotenv.config()`を削除し、Bunの`.env`自動ロード
    （実行時CWD基準）に一本化。`Dockerfile`の`release`ステージに`WORKDIR /usr/src/app/apps/server`を
    追加してCMDを`bun run src/index.ts`に変更し、ローカルと同じ自動ロードの仕組みが本番でも成立する
    構造にした。`drizzle.config.ts`のdotenvはローカルCLI専用（本番イメージに同梱されない）なので対象外。
  - 副次的に`.dockerignore`の穴を発見・修正: 除外パターンがビルドコンテキスト**ルート直下**にしか
    マッチせず、`apps/server/.env.development`（実際のNeon接続文字列）がDockerイメージに焼き込まれて
    いた。`**/`を付けて深さに関わらず除外されるよう修正。`docker build --no-cache`後にイメージ内へ
    `find`をかけて焼き込み解消を確認。
  - `flyctl logs`で本番を確認したところ、**放置tick実装（Week 2最終日）以降ずっと本番がクラッシュ
    ループしていた**ことが発覚（`error: Cannot find package 'dotenv'`が起動10回リトライ後に停止済み）。
    さらに`flyctl secrets list`で本番Fly appに`DATABASE_URL`自体が設定されていないことも判明。
    Neon dev用の接続文字列を本番secretsに設定（本番用DBを分離するかは後回しと判断。理由:
    現状は実ユーザーがいない個人開発段階のため、まず「共用していると自覚した上で進める」ことを優先。
    分離するなら`docs/adr/`行き）。
  - 修正をpush→CIデプロイは成功表示だったが、クラッシュループ中のマシンには通常のローリング
    デプロイが割り込めず（`"machine still active, refusing to start"`）実機には反映されていなかった。
    `flyctl deploy`を手動で再実行し強制的に切り替え、`/health`が200・`POST /players`で実DB書き込み
    成功を確認して復旧。
- **判断/詰まったこと**:
  - 「デプロイがCIで成功表示」と「実機に新イメージが反映されている」は別物、という実例に遭遇。
    ヘルスチェック未設定（`fly.toml`に`[[http_service.checks]]`が無い）の状態でクラッシュループ中の
    マシンに当てるローリングデプロイは、image切り替え自体が失敗してもリリースは成功扱いになりうる。
  - 本番DBをdevと共用する判断は「今は要件がないので後回し」という明示的な先送り。将来ユーザーが
    増える前に必ず戻ってくる論点として記録しておく。
- **次**: Week1積み残しのdocker-compose（`docker run`の手間を減らす目的。ローカルPostgres追加は
  Neon採用済みのため見送り、server単体の起動をラップする方向）。その後Week3（listings購入トラン
  ザクション）に着手。
- **所要時間**: 2h

### 2026-07-27（Week 3 / 第5日）

- **やったこと**:
  - **Neonのbranch機能でdev用DBを分離**（Week 3で意図的にバグを再現する前提を整えた）。
    production branchから`Current data`でbranchを作成し、`apps/server/.env.development`を
    新branchの接続文字列に差し替え。あわせて`DATABASE_URL`（pooled）と
    `DATABASE_URL_UNPOOLED`（直結）が**同一値だった疑い（`docs/adr/0006`）が事実だった**ことを
    旧設定のコメント行で確認し、別ホストになるよう是正。
  - 分離の検証: dev側に`POST /players`でマーカー行を作り、Neon Consoleのproduction branchで
    `SELECT * FROM players WHERE name='dev-branch-check'`が0件であることを確認。
    pooled接続でも`FOR UPDATE`入りのtickトランザクションが通ることも確認。
  - **本番へマイグレーションを適用する仕組みが最初から存在しないことが発覚**。
    `Dockerfile`は`CMD ["bun","run","src/index.ts"]`のみ、`BE_deploy.yml`にもmigrate記述なし。
    これまでは「DBを共用していたため、ローカルでの`drizzle-kit migrate`が副作用として本番にも
    効いていた」だけだった。分離した瞬間にこの経路が消滅した。
  - 対策としてCIに組み込み: `apps/server`に`db:generate`/`db:migrate`スクリプトを追加し、
    `BE_deploy.yml`の`Deploy to fly.io`の**直前**で`bun run db:migrate`を実行するステップを追加
    （`working-directory: apps/server`、GitHub Actions secretの`DATABASE_URL_UNPOOLED`を注入）。
  - **ゲートが閉じることを実地検証**: secretに空相当の値が入ったままpushしたところ、
    `Run DB migrations` failure → `Setup flyctl` / `Deploy to fly.io` が **skipped**、
    本番`/health`は200のまま、`fly status`のVERSIONも34から変わらず。
    secret修正後にrerunして全stepがsuccess、VERSION 34→35に更新されたことを確認。
  - Week 3の設計問答: Q1（ロック対象の行）とQ3（デッドロックの防ぎ方）に回答。
- **判断/詰まったこと**:
  - 目的を「ローカルと同じ状態にする」から「**デプロイされたコードが要求するスキーマを本番が満たす**」
    に置き直した。基準はローカルの状態ではなく、masterにコミットされた`drizzle/*.sql`。
  - 実行場所の3案（CIのdeploy前 / コンテナ起動時のentrypoint / 手動）を比較し、CI案を採用。
    決め手は「migrateが失敗すればdeployに到達しない」の1点。entrypoint案を却下した理由は
    複数マシン起動時の競合だが、これは将来の話ではなく`fly status`で**すでにマシンが2台**動いていた。
  - この方式が安全なのは**追加系マイグレーションに限る**。migrate成功→deploy失敗で止まると
    「新しい列があるが知らない古いコード」が残る。列削除やNOT NULL後付けにはexpand/contractが要る
    （drizzle-kitにdown migrationは無く、ロールバックは存在しない＝fix-forwardのみ）。
  - `""`（クォート2文字）は**非空文字列**なので`drizzle.config.ts`の`if (!databaseUrl) throw`を
    素通りし、接続段階で失敗していた。ゲートが閉じたのは設計したガードではなく接続失敗による。
    **falsyチェックは「未設定」しか防げず「間違った値」は防げない**。
  - secretの置き場所を間違えかけた。CIで実行する案なのに最初はFlyのsecretに入れていた
    （Flyのsecretはコンテナ内のプロセスしか読めず、CIからは見えない）。
  - Q3で最初に出した答え「ロックされていないかチェックしてから進める」は、Q2で自分が
    「危険だ」と指摘した`check-then-act`と同じ構造だった。確認と確保が分割できる時点で隙間が残る。
    `FOR UPDATE`が優れているのは両者が不可分な1操作であるため。
- **次**:
  - Q2（`FOR UPDATE`無しで二重販売が成立するタイムライン）を手書きで埋める。
  - `POST /listings`（出品API）の実装 → 購入トランザクション → 並行購入で二重販売の再現。
  - ロック順序の固定は、テーブル間の順序（listings → item_instances → wallets）も決めて明文化する。
    `ORDER BY ... FOR UPDATE`でロック取得順が保証されるかは未確認のため、並行スクリプトで実験して決める。
  - **secretの向き先（production branchを指しているか）は未検証**。今回は新規`.sql`が無いため
    devを向いていても同じくsuccessする。次のマイグレーションをpushし、production branchの
    `drizzle.__drizzle_migrations`が2本→3本に増えるかで検証する。
  - 本番マイグレーション方式のADR（3案の比較とentrypoint案を捨てた理由）を1本起こす。
- **所要時間**: 約2h（目安）
