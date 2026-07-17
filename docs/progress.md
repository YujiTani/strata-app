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
- **所要時間**: 3h
