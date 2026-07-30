# Week 3 / Q2 — 二重販売のスケジュール

> **問い**: `FOR UPDATE` 無しの購入処理で、二重販売が成立するスケジュールを書け。
>
> この図の正式名称は **スケジュール（schedule）**。複数トランザクションの操作を1列に並べたもの。
> 今回作るのは「**直列化可能でないスケジュール**」＝ A→B の順とも B→A の順とも違う結果になる並び。

---

## 前提

- 分離レベル: **READ COMMITTED**（Postgres の既定）
- `FOR UPDATE` は**使わない**（これがバグる版）
- Tx A と Tx B は**別々のDB接続**で同時に走る（＝同時にボタンを押した2人）

### 登場人物

| 名前 | どのテーブルの行か | 説明 |
|---|---|---|
| `出品#1` | `market_listings` の1行 | 「剣#1 を500Gで売ります」という掲示 |
| `剣#1` | `item_instances` の1行 | 売られている剣そのもの（現物1本） |
| `売り手` | `players` の1行 | 出品した人 |
| `買い手A` | `players` の1行 | Tx A を走らせる人 |
| `買い手B` | `players` の1行 | Tx B を走らせる人 |

### 初期状態

```
market_listings   出品#1 : status=active, sold_to=NULL, price=500, seller=売り手, item=剣#1
item_instances    剣#1   : owner_id=売り手, is_listed=true
wallets           売り手=0, 買い手A=1000, 買い手B=1000
ledger_entries    0行
```

---

## 操作の略号

購入処理の中身。表の中はこの番号で書く。

| 番号 | 操作 |
|---|---|
| ① | `SELECT status, sold_to FROM market_listings WHERE id = 出品#1` |
| ② | `if (status === 'active')` → true なら続行、false なら中止 |
| ③ | `UPDATE market_listings SET status='sold', sold_to=買い手X WHERE id=出品#1` |
| ④ | `UPDATE item_instances SET owner_id=買い手X, is_listed=false WHERE id=剣#1` |
| ⑤ | `UPDATE wallets SET balance = balance - 500 WHERE player_id=買い手X` |
| ⑥ | `UPDATE wallets SET balance = balance + 500 WHERE player_id=売り手` |
| ⑦ | `INSERT INTO ledger_entries` ×2（買い手X: -500 purchase / 売り手: +500 sale、両方 `ref_id=出品#1`） |

**表の読み方**: セル内の `返り値:` は、その SQL が**返してきた値**。WHERE 条件ではない。
`WHERE` は常に `id`（主キー）で指定しているので、返る行は**必ず1行**。

⚠️ **`WHERE status='active'` とは書いていない**点に注意。ここが §4 の議論の急所になる。

### 使ってよい事実

| # | 事実 |
|---|---|
| **F1** | READ COMMITTED では、**他のTxがCOMMITした後の姿だけ**が見える。COMMIT前の途中経過は見えない |
| **F2** | `UPDATE` / `DELETE` / `SELECT ... FOR UPDATE` は触った行にロックを取り、**COMMIT / ROLLBACK まで離さない** |
| **F3** | 素の `SELECT` は**ロックを取らない・待たない**。誰かがロックしていても素通りで読める |
| **F4** | ロックされた行を別のTxが `UPDATE` しようとすると、**その場で止まって待つ**（エラーにならない） |
| **F5** | DB は「あなたが読んだ値が今も正しいか」を**検査しない**。古い前提で書き込んでもエラーは出ない |
| **F6** | **待ちが解けた `UPDATE` は、最新の確定版を読み直して WHERE を再評価し、条件に合えばそのまま実行される**<br>（Postgres の EvalPlanQual。READ COMMITTED 特有の挙動） |

**F6 が Q2 の鍵。** 「待たされたら安全」ではない。待った末に、**古い判断のまま実行される**。

---

## 1. Tx A 単独（基準線）

Tx A だけが走れば、当然ながら正しく動く。

| t | Tx A | 取るロック | 確定済みDB（出品#1 / 剣#1 / 財布） |
|:--|:--|:--|:--|
| t1 | `BEGIN` | — | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t2 | ① `SELECT ... WHERE id=出品#1`<br>**返り値: status=active, sold_to=NULL**<br>**【信じる: active】** | なし（F3） | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t3 | ② if active → 続行 | — | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t4 | ③ UPDATE 出品#1 → sold, 買い手A | ◆ **出品#1** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t5 | ④ UPDATE 剣#1 → owner=買い手A | ◆ **剣#1** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t6 | ⑤ UPDATE wallets 買い手A −500 | ◆ **買い手A** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t7 | ⑥ UPDATE wallets 売り手 +500 | ◆ **売り手** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t8 | ⑦ INSERT ledger 買い手A −500 purchase | なし（既存行を触らない） | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t9 | ⑦ INSERT ledger 売り手 +500 sale | なし | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| **t10** | **`COMMIT`** ◆全ロック解放 | 解放 | **sold,買い手A** / **買い手A,false** / **売=500 A=500 B=1000** |

- t1〜t9 の確定済みDB列が**全部同じ** → COMMIT の瞬間まで外の世界は何も変わらない（F1）
- ロックは t4 で取り始め、**t10 まで1つも離さない**（F2）
- 検算: 通貨総量 0+1000+1000 = 500+500+1000 = 2000 ✓

---

## 2. 二重販売が成立するスケジュール（Q2の答え）

| t | Tx A（買い手A） | Tx B（買い手B） | ロック | 確定済みDB |
|:--|:--|:--|:--|:--|
| t1 | `BEGIN` | | | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t2 | | `BEGIN` | | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t3 | ① `SELECT ... WHERE id=出品#1`<br>**返り値: status=active, sold_to=NULL**<br>**【A信じる: active】** | | なし（F3） | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t4 | | ① `SELECT ... WHERE id=出品#1`<br>**返り値: status=active, sold_to=NULL**<br>**【B信じる: active】** | なし（F3） | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t5 | ② if active → 続行 | | | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t6 | | ② if active → 続行 | | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| | ⚠️ **この時点で A も B も「自分が買える」と判断した。両方とも判断の根拠は正しい（DBは本当に active）** | | | |
| t7 | ③ UPDATE 出品#1 → sold, 買い手A | | ◆A: **出品#1** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t8 | | ③ UPDATE 出品#1 → sold, 買い手B<br>**⏸ 待機**（F4） | Aのロック待ち | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t9 | ④ UPDATE 剣#1 → owner=買い手A | ⏸ | ◆A: **剣#1** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t10 | ⑤ UPDATE wallets 買い手A −500 | ⏸ | ◆A: **買い手A** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t11 | ⑥ UPDATE wallets 売り手 +500 | ⏸ | ◆A: **売り手** | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| t12 | ⑦ INSERT ledger ×2 (ref=出品#1) | ⏸ | なし | active,NULL / 売り手,true / 売=0 A=1000 B=1000 |
| **t13** | **`COMMIT`** ◆全ロック解放<br>→ **Aに「購入成功」を返す** | ⏸ | 解放 | **sold,買い手A / 買い手A,false / 売=500 A=500 B=1000** |
| **t14** | | **待ちが解ける（F6）**<br>最新版を読み直し `WHERE id=出品#1` を再評価<br>→ **id は一致する。そのまま実行**<br>→ `sold_to` を **買い手B に上書き** | ◆B: **出品#1** | sold,買い手A / 買い手A,false / 売=500 A=500 B=1000 |
| t15 | | ④ UPDATE 剣#1 → owner=買い手B | ◆B: **剣#1** | sold,買い手A / 買い手A,false / 売=500 A=500 B=1000 |
| t16 | | ⑤ UPDATE wallets 買い手B −500 | ◆B: **買い手B** | sold,買い手A / 買い手A,false / 売=500 A=500 B=1000 |
| t17 | | ⑥ UPDATE wallets 売り手 +500 | ◆B: **売り手** | sold,買い手A / 買い手A,false / 売=500 A=500 B=1000 |
| t18 | | ⑦ INSERT ledger ×2 (ref=出品#1) | なし | sold,買い手A / 買い手A,false / 売=500 A=500 B=1000 |
| **t19** | | **`COMMIT`**<br>→ **Bにも「購入成功」を返す** | 解放 | **sold,買い手B / 買い手B,false / 売=1000 A=500 B=500** |

**A も B も 200 を返し、例外は1つも出ていない。**

---

## 3. 被害

```
【二重販売が成立した状態】

  Tx A のレスポンス       : 購入成功 200
  Tx B のレスポンス       : 購入成功 200      ← 両方成功している

  market_listings 出品#1 : status=sold, sold_to=買い手B
                           → A が買った記録は B に上書きされて消滅した

  item_instances  剣#1   : owner = 買い手B
                           → A は 500 払ったのに、何も持っていない

  wallets                : 売り手=1000, 買い手A=500, 買い手B=500
                           → 売り手は剣1本で 2回分の代金を受け取った

  ledger_entries         : 4行（本来は2行）
                           WHERE ref_id=出品#1 → 4行 / SUM(amount) = 0
```

### ⚠️ ここが一番こわい: 保存則は破れていない

| 検算 | 結果 |
|---|---|
| 通貨総量 | 開始 2000 → 終了 1000+500+500 = **2000** ✓ 一致してしまう |
| `wallets` と `SUM(ledger_entries)` | 3人とも **一致** ✓ |
| 1つの `item_instance` の `owner_id` | **1人だけ**（買い手B）✓ 構造は壊れていない |

**単純な保存則チェックでは、この事故は検出できません。** お金は湧いていないし消えてもいない。壊れたのは「**代金を払った人が現物を受け取る**」という、テーブルの形では表現されていない約束の方です。

唯一の物証は `ledger_entries` の行数:

```sql
-- 1つの出品に対して ledger が4行ある = 2回売れている
SELECT ref_id, COUNT(*) FROM ledger_entries
WHERE reason IN ('purchase','sale')
GROUP BY ref_id HAVING COUNT(*) > 2;
```

---

## 4. なぜ壊れるのか

### 一言でいうと

> **確認（②）と確保（③）が別の操作に分かれているから。**
> その隙間に他者が割り込み、**同じ「active」を読んで、同じ判断を下せてしまう**。
> これを **check-then-act（確認してから行動する）** という。

### 危険な窓は思っているより広い

「危ないのは ① と ③ の間だけ」ではありません。**F1 のせいで、窓は A が COMMIT するまで開きっぱなし**です。

```
  t3  A が ① で読む
      ├─────────────────────────────────────────┐
      │  この間ずっと、B から見た 出品#1 は      │  ← B はどこで ① を撃っても
      │  「active」のまま（Aの変更は未COMMIT）   │     active を読んでしまう
      └─────────────────────────────────────────┘
  t13 A が COMMIT   ← ここで初めて B から見て sold になる
```

差し込み位置の候補を全部試すと、**壊れないのは「A が COMMIT した後に B が始まる」場合だけ**でした。

| 候補 | B の BEGIN の位置 | 結果 |
|---|---|---|
| 候補0 | A の COMMIT の後 | ✅ 安全。B の ① が `sold` を読む → ② で弾かれる |
| 候補1〜7 | A の COMMIT より前のどこか | ❌ **全部壊れる** |

### 「待った」のに助からなかった理由（F6）

t8 で B は確かにブロックされました。DB は仕事をしています。ではなぜ助からないのか。

```
t8   B の ③ が待機に入る
t13  A が COMMIT してロックを解放
t14  B の ③ が再開する
        ↓
     Postgres は最新の確定版を読み直し、WHERE を再評価する
        ↓
     WHERE id = 出品#1   ← id は変わっていない。当然マッチする
        ↓
     そのまま実行 → 上書き
```

**`WHERE` に `id` しか書いていない**ので、再評価しても必ず通ります。「status が active であること」という肝心の条件は、SQL ではなく**アプリの `if`（②）の中**にあり、それは t6 に置き去りにされたままです。

DB は「B が t6 で何を信じたか」を知りません（**F5**）。だから止められない。

### 補足: この構造の別の直し方

`FOR UPDATE` 以外にも、**条件を `WHERE` に持ち込む**という手があります。

```sql
UPDATE market_listings SET status='sold', sold_to=買い手B
WHERE id = 出品#1 AND status = 'active'    -- ← 条件をSQL側に
```

こうすると t14 の再評価で `status='sold'` を見て**マッチしなくなり、0行更新**で終わります。アプリ側で「更新行数が0なら中止」と判定できる。これは **compare-and-swap / 条件付きUPDATE** と呼ばれる定石です。

`FOR UPDATE` との違いは Week 3 の実装で扱います。どちらを選ぶかは、**触るテーブルが1枚か複数枚か**で変わってきます。

---

## 5. デッドロックの芽（Week 3 の次のテーマ）

このスケジュールでは A も B も**同じ順序**でロックを取っています。

```
出品#1 → 剣#1 → 買い手A/B → 売り手
```

同じ順序で取る限りデッドロックは起きません（Bはただ待つだけ）。

**もし逆順に取る経路が1つでも混ざると**、A が 出品#1 を持ったまま 剣#1 を待ち、B が 剣#1 を持ったまま 出品#1 を待つ、という膠着が発生します。

→ だから `CLAUDE.md` の Week 3 タスク3で「**テーブル間のロック順序を決めて明文化する**」としている。

---

## 6. 宿題（このあと自分で確かめる）

1. `ref_id = 出品#1` は「1つの出品は1回しか売れない」を前提にした設計だった。
   二重販売が起きると `WHERE ref_id=出品#1` は **4行**返る。
   → **`ref_id` は「出品のid」でよいのか。「購入イベントのid」を別に持つべきか？**
2. §3 の通り、保存則チェックでは検出できなかった。
   → **`market_listings` に何の制約を足せば、DB自身がこの事故を拒否できるか？**
   （ヒント: `item_instance_id` に対して `status='active'` の行が最大1つ、を強制する方法）
3. §4 補足の「条件付きUPDATE」と `FOR UPDATE` は、**触るテーブルが4枚**の今回の場面でどう違うか。
