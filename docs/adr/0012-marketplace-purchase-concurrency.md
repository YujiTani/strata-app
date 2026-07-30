# ADR-0012: マーケット購入の同時実行制御

- ステータス: 決定
- 日付: 2026-07-30
- 改訂: 2026-07-30（実装前レビューを受けて改訂。主な変更は
  「ロック順序から `players` を外した」「ロックの**強度**を宣言に追加」
  「`INSERT purchases` の位置をロック取得後に変更」「案2 の却下理由を訂正」
  「buyer ≠ seller を前提条件として明記」。詳細は末尾の「改訂の経緯」）

## コンテキスト

`market_listings` の購入処理は、1トランザクションで**4テーブル・6回の書き込み**を行う（`docs/db-map.md` §3）。

```
① SELECT market_listings         -- status を読む
② if (status === 'active')       -- 買えるか判断する
③ UPDATE market_listings         -- sold / sold_to
④ UPDATE item_instances          -- owner_id / is_listed
⑤⑥ UPDATE wallets ×2            -- 買い手 −500 / 売り手 +500
⑦ INSERT ledger_entries ×2
```

このうち **① で読んで ② で判断し、③ で書く**という構造が `check-then-act` になっている。
`docs/week3-q2-schedule.md` に、二重販売が成立するスケジュールを手で書き起こして確認した。

判明した事実:

1. **危険な窓は「① と ③ の間」ではなく、「A が ① を読んでから COMMIT するまで」全体**。
   READ COMMITTED では A の未COMMITの変更が B から見えないため、B は A の COMMIT 直前に
   ① を撃っても `active` を読める。
2. **`UPDATE` のロック待ちは救いにならない**。待ちが解けた `UPDATE` は最新の確定版を読み直して
   `WHERE` を再評価するが（Postgres の EvalPlanQual）、`WHERE id = ?` しか書いていないため
   条件は必ずマッチし、そのまま実行される。判断条件（`status='active'`）はアプリの `if` の中にあり、
   DB からは見えない。
3. **保存則チェックでは検出できない**。二重販売が成立しても、通貨総量は保存され、
   `wallets` と `SUM(ledger_entries)` も一致し、`item_instances.owner_id` も1人のまま。
   壊れるのは「代金を払った人が現物を受け取る」という、テーブルの形に表現されていない約束の方。

3 が重要で、**「整合性チェックが通ること」は「壊れていないこと」を意味しない**。
だから事後の検算ではなく、事前に成立させない構造が要る。

## 決定

購入トランザクションを **2層で守る**。

1. **アプリ層**: 判断対象の行を `SELECT ... FOR UPDATE`（Drizzle: `.for('update')`）で確保してから
   `status` を判断する。**ロックを取った後に判断材料を読む**順序を厳守する。
2. **DB層**: `purchases` テーブルを新設し、`market_listing_id` に **UNIQUE 制約**を張る。
   1つの出品に対する購入行は物理的に1行しか作れない。

あわせて `purchases.id`（購入イベントのID）を `ledger_entries.ref_id` に使う。

```
purchases
├─ id                 [PK] uuid              -- 購入イベント1件。ledger_entries.ref_id に使う
├─ market_listing_id  [FK→market_listings]   uuid  UNIQUE ★
├─ buyer_id           [FK→players]           uuid
└─ created_at         timestamptz
```

### トランザクションの二相構造（lock phase → write phase）

購入トランザクションは、**必要な明示ロックをすべて取り切ってから、1つ目の書き込みを行う**。

```
[lock phase]  宣言順序どおりに SELECT ... FOR UPDATE を発行する（書き込みはまだしない）
              ↓
[判定]        ロック後に読んだ値だけを使って、購入可否をすべて判定する
              ↓
[write phase] INSERT purchases → UPDATE market_listings → UPDATE item_instances
              → UPDATE wallets ×2 → INSERT ledger_entries ×2
```

**理由は外部キーの暗黙ロックにある。** PostgreSQL 9.3 以降、FK の検査は参照先の行に
`FOR KEY SHARE` を取る。したがって以下はすべて、宣言順序を無視して `players` 等の行を
暗黙にロックする:

| 操作 | 暗黙に取るロック |
|---|---|
| `INSERT purchases (buyer_id)` | `players[buyer]` に KEY SHARE |
| `UPDATE market_listings SET sold_to` | `players[buyer]` に KEY SHARE |
| `UPDATE item_instances SET owner_id` | `players[buyer]` に KEY SHARE |
| `INSERT ledger_entries ×2` | `players[buyer]`, `players[seller]` に KEY SHARE |

`KEY SHARE` は `FOR UPDATE` と衝突するため、**書き込みを先に混ぜると宣言順序が破れる**。
明示ロックを先に取り切っておけば、後続の暗黙 KEY SHARE 要求は
「自分が既に保持している行」に対するものになり衝突しない。

この構造により、当初の「`INSERT purchases` を**早い段階**に置く（fail fast）」という判断は**撤回**する。
fail fast の効果は `market_listings` をロックした直後の status 判定で既に得られており、失うものはない。

### ロック順序と強度

デッドロックを避けるため、**全経路（購入・出品・キャンセル・tick）で同一の順序**を使う。
順序だけでなく**強度**も宣言する（強すぎるロックは無関係な経路を止めるため）。

| 順 | テーブル | 購入 | 出品 / キャンセル | tick |
|---|---|---|---|---|
| 1 | `market_listings` | `FOR UPDATE` | `FOR UPDATE` | — |
| 2 | `item_instances` | `FOR UPDATE` | `FOR UPDATE` | — |
| 3 | `wallets` | `FOR NO KEY UPDATE` | — | `FOR NO KEY UPDATE` |

- **`players` は購入経路のロック対象から外す。** 購入は `players` の行を1つも書き換えないため、
  明示ロックを取る理由がない。取ると FK の暗黙 KEY SHARE と衝突してデッドロックの辺を増やすだけ。
- **強度は `FOR NO KEY UPDATE` を既定とする。** 更新するのが非キー列（`balance`,
  `last_idle_tick_at`, `owner_id`, `status`）である限り、これで十分に排他できる
  （NO KEY UPDATE 同士は衝突する）。`FOR UPDATE` は KEY SHARE とも衝突するため、
  FK 経路を巻き込む。Drizzle は `.for('no key update')` を受け付ける
  （`drizzle-orm/pg-core/query-builders/select.types.d.ts:60` の `LockStrength`）。
- 同一テーブル内で複数行をロックする場合（購入は `wallets` を買い手・売り手の2行）は、
  **`player_id` の昇順**で、**1行ずつ個別の `SELECT ... FOR ...` を発行**する。
  `WHERE ... IN (...) ORDER BY ... FOR UPDATE` の1文にまとめない（後述）。

### 前提条件

- **buyer ≠ seller**。自己購入は API レベルで拒否する（下記「自己購入」参照）。
- 残高の更新は必ず **SQL 側の相対演算** `SET balance = balance - ${price}` で行う。
  アプリで読んだ値から計算して絶対値で書く（`balance: wallet.balance - price`）ことを禁止する。

## 検討した選択肢

| 選択肢 | 採用しなかった理由 |
|---|---|
| **案1: `SELECT ... FOR UPDATE`**（採用） | — |
| 案2: 条件付き UPDATE（compare-and-swap）<br>`UPDATE ... WHERE id=? AND status='active'` | **技術的には案1と同等に守れる**（下記「訂正」参照）。採らなかった理由は3点: (1) 更新行数0の判定を書き忘れると**静かに壊れる**（`FOR UPDATE` + `if` は判定を忘れにくい）、(2)「ロックを取っている」という意図がコードに現れず、ロック順序表と対応付けられない、(3) 判断が SQL 側（status）とアプリ側（残高・所有者）に散る。主軸がロックの学習であることも踏まえ案1を採用 |
| 案3: アプリケーション層の排他（プロセス内ロック等） | サーバーが複数マシンで動く（`fly status` で実際に2台稼働中）ため、プロセス内の排他は無意味。分散ロックを持ち込むとインフラが増え、主軸から外れる |
| 案4: 楽観ロック（version 列 + 更新時チェック） | 実質は案2 と同じ構造で、守れる範囲も同じ。加えて `version` 列という「壊れうる状態」を1つ増やす |
| 案5: 分離レベルを SERIALIZABLE に上げる | 直列化異常を DB が検出して片方を中止するため理屈上は解決する。ただし**失敗時のリトライをアプリが必ず実装する**必要があり、暗黙の前提が増える。また「なぜ守れるのか」がブラックボックス化し、ロックの学習という目的に反する。将来の比較対象として保留 |

## 理由

### なぜ `FOR UPDATE` か

`FOR UPDATE` の効き目は「割り込みされにくい」という確率の話ではなく、
**待ちが解けた後に最新の確定値を返す**という点にある。

```
B の SELECT ... FOR UPDATE が待機
  → A が COMMIT してロック解放
  → B は最新版を読み直して受け取る（status='sold'）
  → B の if が false になり、正しく中止される
```

素の `SELECT` は待たないので古い値のまま（＝二重販売）。
`UPDATE` は待つが `WHERE id` しか再評価しないので通ってしまう（＝二重販売）。
`SELECT ... FOR UPDATE` だけが「**待って、最新を返して、その上でアプリに判断させる**」。

つまり「信じていること」がロック取得後に更新される。だから
**先に素の SELECT で読み、後から FOR UPDATE を足す**のは無意味であり、順序が本質になる。

### なぜ DB 制約も張るのか（二重防御）

| 層 | 誰が守るか |
|---|---|
| アプリ（`FOR UPDATE`） | **書く人が覚えている限り**守られる。新しい購入経路を1つ書き忘れれば穴が開く |
| DB（UNIQUE 制約） | **誰が何を書いても**物理的に拒否される |

`daily_claims` の `UNIQUE(player_id, claim_date)` と同じ考え方。
アプリのロックは「気をつける」対策であり、制約は「気をつけなくても守られる」対策。
主軸が整合性である以上、後者を持たない理由がない。

なお、当初ヒントとして検討した
`CREATE UNIQUE INDEX ON market_listings (item_instance_id) WHERE status='active'` は、
「**同じ現物を2枚出品する**」ことは防ぐが、「**1枚の出品を2人が買う**」は防げない。
今回の事故に効くのは購入側の UNIQUE である。（出品側の制約は別途検討する価値がある）

### なぜ `ref_id` を購入イベントIDにするか

`ref_id` に出品のIDを使う設計は「1つの出品は1回しか売れない」を前提にしている。
二重販売が起きると `WHERE ref_id = 出品#1` が4行返り、**壊れた状態を記述できてしまう**。
購入イベントのIDなら、1件の購入 = ledger 2行 の対応が常に保たれる。

`purchases` の導入は、この `ref_id` の問題と、DB層の二重販売防止を**同時に解決する**。
別々に検討していた2つの論点が1つのテーブルに収束したことが、採用の後押しになった。

### なぜロック順序を固定するか

購入は4行にロックを取る。ロックは1つずつ順に取るため、
**別の処理が別の順序で取りに来ると循環待ちが発生する**。

```
Tx1（購入）    : ◆出品#1 → ◆剣#1
Tx2（キャンセル）: ◆剣#1  → ◆出品#1
  → Tx1 は Tx2 を待ち、Tx2 は Tx1 を待つ = デッドロック（SQLSTATE 40P01）
```

Postgres は検出して片方を強制終了するためデータは壊れないが、
ユーザーには理由不明の失敗が返る。防ぎ方は「全員が同じ向きに回る」ことのみ。

順序の中身に絶対的な正解はない。**全経路で同一であること**だけが要件であり、
`market_listings → item_instances → players → wallets` を選んだのは
「掲示が現物を指し、現物が人を指す」という**依存の上流から下流への向きと一致し、人が覚えやすい**ため。
ただし「自然な処理順」は API ごとに異なる（tick は市場を見ない）ので、
**各APIで自然さから導出するのではなく、この宣言された順序を参照する**こと。

同一テーブル内を `player_id` 昇順にしたのは、役割ベースの順序（買い手→売り手）が破れるため。

```
Tx1: 買い手=アオイ, 売り手=ベン   → ◆アオイ → ◆ベン
Tx2: 買い手=ベン,   売り手=アオイ → ◆ベン   → ◆アオイ   ← 逆順
```

役割は「そのトランザクションから見た相対的な位置」であり、相手が入れ替わると逆転する。
デッドロック回避には**誰から見ても同じ絶対順序**が必要なので、値そのもの（`player_id`）を基準にする。

### 訂正: 案2 について当初書いていた却下理由は誤りだった

初版では案2 を「守れるのはその1行だけ」として却下した。**これは技術的に誤りである。**

`UPDATE market_listings SET ... WHERE id=? AND status='active'` が1行を更新した時点で、
そのトランザクションは**その行の排他ロックを COMMIT まで保持する**。強度は `FOR UPDATE` と同等。
門番となる行（guard row）を排他的に握っている以上、他の3テーブルへの書き込みも
`FOR UPDATE` 版とまったく同じだけ守られる。`RETURNING` を付ければ `price` / `seller_id` /
`item_instance_id` もレース無しで取れる。これは "guard row" として広く使われる定石である。

案1 を採用する結論は変わらないが、**理由が誤っていると「条件付き UPDATE は1行しか守れない」という
誤った一般則を他の設計に持ち込むことになる**ため、上記のとおり書き直した。

## 各シナリオの設計判断

### 自己購入（buyer == seller）— API レベルで拒否する

`wallets` を「買い手・売り手の2行」ロックする前提は buyer ≠ seller を暗黙に置いている。
buyer == seller のとき2行は**同一の1行に潰れる**。

```
wallets[X] = 1000、X が自分の出品（price=500）を買う
  UPDATE wallets SET balance = 1000 - 500 WHERE player_id = X   -- 500
  UPDATE wallets SET balance = 1000 + 500 WHERE player_id = X   -- 1500  ← 前の更新を上書き
結果: 1000 → 1500（500 の通貨創出）。ledger は -500/+500 の2行で SUM=0
```

**並行実行すら不要**で、単独のトランザクションで確定的に壊れる。しかも `ledger_entries` 側は
正しいため通貨総量の保存則は破れず、`wallets` と `SUM(ledger_entries)` の突き合わせで
初めて drift として現れる（`docs/week3-q2-schedule.md` §3 と同じ「保存則では見つからない」構造）。

対処は二重にする:
1. `buyer_id === seller_id` を明示的に拒否（409）。ロック順序の前提が崩れる唯一のケースであるため
2. 残高更新を SQL 側の相対演算にする（前提条件に記載済み）。これ単独でも通貨創出は消える

### 二重出品（同じ現物に active な出品が2行）— 部分ユニークインデックスで防ぐ

`UNIQUE(market_listing_id)` が保証するのは「1つの**出品**は1回しか買われない」だけ。
同じ `item_instance` に `active` な出品が2行あれば、**別々の出品として2人が正常に購入を完了し、
それぞれ UNIQUE を通過する**。被害は二重販売と同一（払ったのに現物がない）。

出品 API も購入と同じ `check-then-act` 構造を持つため、素の実装では成立する:

```
Tx1: SELECT item_instances[剣#1] → 出品可 → INSERT market_listings(L1, active)
Tx2: SELECT item_instances[剣#1] → 出品可 → INSERT market_listings(L2, active)  ← 素のSELECTは待たない
両方COMMIT → 剣#1 に active な出品が2行
```

したがって以下を Week 3 のスコープに含める（初版では TODO に落としていた）:

```sql
CREATE UNIQUE INDEX ON market_listings (item_instance_id) WHERE status = 'active';
```

あわせて出品 API も `item_instances` を宣言順序どおりにロックしてから
所有者と出品中判定を行う。「アプリが気をつけなくても守られる」という本 ADR の論理は、
出品側にも同じく適用される。

### 残高の上限・下限 — CHECK は backstop、判定はアプリで

`wallets_balance_range` は `0 <= balance <= MAX_BALANCE` の**両端**を見ている
（`apps/server/db/schema.ts:45-48`）。購入で 23514 が飛ぶ経路は3つあり、
SQLSTATE だけでは区別できない。

| 経路 | 発生条件 | 扱い |
|---|---|---|
| 買い手の残高不足 | `buyer.balance - price < 0` | アプリがロック後に事前判定して 402/409 |
| **売り手の上限超過** | `seller.balance + price > MAX_BALANCE` | **アプリが事前判定して拒否**。tick と違い代金は減らせないのでクランプで逃げられない |
| price <= 0 | `ledger_entries_amount_nonzero` に当たる | `market_listings` に `CHECK (price > 0)` を追加して入口で防ぐ |

「売り手の財布が満杯」を「買い手の残高不足」として返すのは明確な誤りなので、
制約違反を制御フローに使わず、**ロック後に読んだ値でアプリが判定する**。
`market_listings.status` にも `CHECK (status IN ('active','sold','cancelled'))` を足す
（現状 varchar(20) で制約が無く、`'Active'` のような打ち間違いが素通りする）。

### 出品後に売り手が別経路で現物を手放した場合 — ロック後に所有者を再検証する

`item_instances` をロックした後、**`owner_id === listing.seller_id` を再検証する**。
将来トレードやクラフト消費が入ったとき、購入が「売り手が持っていない物」を移転させることを防ぐ。
これは `is_listed` フラグではなく、この再検証が構造的な答えになる。

### 価格改定・キャンセル

- `price` は**リクエストボディから受け取らず、ロック後の行から読む**。ボディの価格を信じると
  価格改定と同時購入で「古い値段で買える」TOCTOU になる
- キャンセルも `market_listings` → `item_instances` の順でロックし、status を見てから書く。
  購入と同じ順序なのでデッドロックは起きない

### エラーの区別とリトライ

| SQLSTATE | 意味 | リトライ |
|---|---|---|
| `23505`（`purchases_market_listing_id_unique`） | その出品はもう売れた | **不要**（恒久的な失敗。再試行しても永遠に失敗する） |
| `23514` | CHECK 違反。制約名で分岐 | 不要（設計上ここには来ないはず） |
| `40P01` | デッドロック | 限定回数のみ可。ただし起きない設計を目指す |
| `40001` | 直列化異常（案5 を採る場合のみ） | 必須 |

「UNIQUE 違反もリトライすべきでは」と後から迷わないよう、この区別を明記しておく。

なお PostgreSQL の unique index への挿入は、競合相手が**未コミット**の間は
23505 を即返さず相手の完了を待つ。したがって「fail fast」という表現は正確ではない。

### 冪等性（`Idempotency-Key`）

`apps/server/src/index.ts:57` は CORS で `Idempotency-Key` を許可しているが実装は無い。
同じ買い手の二重クリックや再送は、現設計では「他人に負けた」ケースと区別できず 409 になる。

`purchases` の導入はこれを安価に解決する: UNIQUE 違反を捕まえたら `purchases` を引き直し、
`buyer_id` が要求者本人なら**既存の購入結果を 200 で返す**（真の冪等）。別人なら 409。

## 結果・トレードオフ

### 得られたもの

- 二重販売がアプリ層とDB層の両方で防がれる。片方の実装漏れが即座に事故にならない
- `purchases` により「購入」がデータとして存在するようになり、`ledger_entries` の
  `ref_id` が壊れた状態を表現できなくなった
- デッドロックの発生条件と回避方法を、実装前に文書として持てた

### 払ったコスト

- **ロック保持時間が伸びる**。ロックは COMMIT まで離さないため、同一出品への購入は直列化される。
  許容しているのはスループットだけでなく**接続の占有**でもある: `index.ts:9-15` は
  pooled 接続に対して `drizzle(databaseUrl)` を使っており、長いトランザクションは
  pooler のサーバ接続をピン留めするため、保持時間の伸びは**プール枯渇として顕在化**する
- **トランザクション内で DB 以外の `await` を絶対に行わない**という規律が必要
  （ログ送信・通知・外部API）。1つ入るだけで人気商品のスループットが壊れる
- **2本の wallet UPDATE を `UPDATE ... FROM (VALUES ...)` の1文にまとめてはならない**。
  1文になった瞬間、行のロック順は実行計画が決めるため `player_id` 昇順の保証が消える
- **`lock_timeout` / `idle_in_transaction_session_timeout` が未設定**。詰まった
  トランザクション1本がその出品への購入を無限に止める。購入トランザクションの先頭で
  `SET LOCAL lock_timeout = '3s'` を発行し、`55P03` を 503/409 にマップするのが安価な保険
- **ロック順序を全経路で守る規律が必要**になった。この ADR を参照しない実装が1つでも入ると破れる
- **テーブルが1枚増えた**。`market_listings.sold_to` と `purchases.buyer_id` で
  「誰が買ったか」が二重に持たれる状態が生まれた（下記 TODO）
- 常駐サーバでのインタラクティブトランザクション保持が前提。ADR-0006（素のTCPドライバ採用）に依存する

### 覆すとしたら

- スループットが問題になったら、案2（条件付きUPDATE）や案5（SERIALIZABLE + リトライ）を再検討する。
  その際は「守れる範囲が1行に限られる」制約を、テーブル構成を変えて回避できるかが論点になる
- 出品・購入以外の経路（トレード、オークション等）が増え、ロック順序の維持が現実的でなくなったら、
  順序の固定ではなく SERIALIZABLE + リトライへ移行する判断があり得る

## TODO（未決定・実装時に確定させる）

- [x] ~~`ORDER BY ... FOR UPDATE` でロック取得順が保証されるか~~ → **決着（実験不要）**。
      PostgreSQL は `LockRows` を `Sort` の上に置くため通常はソート順にロックされるが、
      これは**プラン依存であり保証ではない**。保証されないものに依存せず、
      **最初から1行ずつ個別の `SELECT ... FOR ...` を昇順で発行する**。往復が1回増えるだけで、
      buyer==seller のとき「1文で2行返るはず」という前提が壊れない利点もある。
      実験自体は学習として価値があるが、実装の依存先にはしない
- [x] ~~既存の tick 実装のロック順序が宣言順序と矛盾しないか~~ → **確認済み**。
      `apps/server/src/index.ts:108-127` は `players` → `wallets` の順で、宣言順序と矛盾しない。
      ただし**強度が強すぎる**: tick は `last_idle_tick_at`（非キー列）しか更新しないのに
      `FOR UPDATE` を使っているため、tick 実行中はそのプレイヤーが関わる全書き込み
      （購入・アイテム生成・ledger 追記）が FK の KEY SHARE 経由でブロックされる。
      放置ゲームで最も高頻度に走る処理なので影響が大きい → `FOR NO KEY UPDATE` に落とす
- [ ] **tick の `.for('update')` を `.for('no key update')` に変更する**（`index.ts:116`, `:126`）
- [ ] **`market_listings.sold_to` は削除する方針**。`purchases.buyer_id` と情報が重複し、
      しかも `docs/week3-q2-schedule.md` §3 で「上書きされて A の記録が消滅した」当の列である。
      ただし代替となる `purchases` が存在しないため、**削除は `purchases` 導入後（Phase 4）**。
      それまでは「新規に書かない（NULL のまま）」だけでもよい
- [ ] **`item_instances.is_listed` は削除する**。アプリから一度も参照されていないことを確認済み
      （`src` 配下に参照0件）。旧コードが壊れる相手がいないため expand/contract は不要で、
      contract のみで済む。使われる前に消すのが最も安い
- [ ] **`ledger_entries` に `UNIQUE (ref_id, player_id, reason)`** を張るか検討する。
      「同一購入イベントで同じ人に同じ理由の行が2本」を DB が拒否できる。`purchases` の UNIQUE と同じ思想
- [ ] **`reason` の値がコードとドキュメントで食い違っている**。`index.ts:174` は `'reward'`、
      `docs/db-map.md` は `'idle_tick'`。どちらかに統一し、`CHECK` で固定する
- [ ] `apps/server/db/schema.ts:178-183` の `table` エクスポートに `market_listings` /
      `item_instances` / `item_defs` が含まれていない。追加するか直接 import に統一するかを決める
- [ ] **素材（`inventory_stacks`）が出品できない**。`market_listings.item_instance_id` は NOT NULL で
      1点ものしか指せないが、`docs/spec.md` は「自給自足できない**素材**を売買する市場」を
      経済ループの中心に置いている。**仕様とスキーマの食い違い**。
      Week 3 は二重販売の教材として1点ものに絞る判断（2026-07-30）だが、先送りであることを自覚しておく。
      売り方の性質が異なる（1点もの＝所有権の移動／素材＝数量の増減）ため、
      同一テーブルで「どちらか一方だけ埋まる列」にするか、テーブルを分けるかは別途設計が必要。
      素材側で起きるバグは二重販売ではなく**在庫マイナス**（出品中の分を本人が村で消費する等）になる

## 改訂の経緯（2026-07-30）

初版を書いた直後、**実装前に**別のレビュアー（AIエージェント）へ批判的レビューを依頼した。
11件の指摘のうち、設計を変更したのは以下。

| 指摘 | 初版 | 改訂後 |
|---|---|---|
| **自己購入で通貨が増える** | 前提として書いていなかった | buyer ≠ seller を前提条件に明記。残高更新を相対演算に限定 |
| **FK の暗黙 KEY SHARE がロック順序を破る** | 明示ロックだけを数えていた | lock phase / write phase を分離。`INSERT purchases` を「早い段階」→「ロック取得後」に変更 |
| **`players` を購入経路でロックする必要がない** | 順序表に含めていた | 順序表から削除。購入は `players` を書き換えないため |
| **ロックの強度が未宣言** | 順序だけ宣言していた | 強度列を追加。`FOR NO KEY UPDATE` を既定に |
| **同じ現物に active な出品が2行** | TODO に落としていた | Week 3 のスコープに格上げ。被害は二重販売と同一のため |
| **売り手の残高上限超過が未検討** | 検討していなかった | 「各シナリオの設計判断」に追加。クランプで逃げられない旨も明記 |
| **案2 の却下理由が技術的に誤り** | 「守れるのは1行だけ」 | 訂正。guard row を握れば同等に守れる。却下理由を書き直し |
| **`ORDER BY ... FOR UPDATE` は実験不要** | TODO で「実験して決める」 | 保証がないものに依存しない方針に決着。1行ずつ昇順で取る |

**この ADR が実装前に書かれていたことの価値**が、ここで実際に現れた。
上記のうち「自己購入」「FK の暗黙ロック」「二重出品」は、実装後に発見していれば
書き直しのコストが発生していた。設計を文章にしておくと、コードを書く前にレビューできる。

## 関連

- `docs/week3-q2-schedule.md` — 二重販売が成立するスケジュールの詳細
- `docs/db-map.md` §3 §4 — 購入時に動く4テーブル、状態の二重管理の論点
- `docs/data-model.md` — 購入トランザクションの擬似コード
- ADR-0004（Drizzle 採用: `.for('update')` で行ロックを明示できることが決め手だった）
- ADR-0006（素のTCPドライバ: インタラクティブトランザクション保持が可能なこと）
