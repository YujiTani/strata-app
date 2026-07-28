# DBマップ（テーブル早見表）

> 目的: 「いまDBがどういう状態か」を頭の中に描けるようにするための**実務用の地図**。
> 設計の意図・なぜこう持つのかは `docs/data-model.md` を正とする。こちらは**引き方**の文書。
> スキーマの正は `apps/server/db/schema.ts`。図と食い違ったらコードが勝つ。

---

## 0. 図の読み方

```
A ──1:N──> B     Aの1行に対して、Bの行が0個以上ぶら下がる
                 （B側が「Aのid」を持っている = FK は常に「多」の側にある）

A ──1:1──> B     Aの1行に対して、Bの行はちょうど1つ

[PK]  主キー。この列で1行が一意に決まる
[FK]  外部キー。他テーブルの行を指す“ポインタ”
```

**覚えておくと迷わない原則:** FK を持っている方が「子」。
`wallets.player_id` があるということは、wallets が players にぶら下がっている。逆ではない。

---

## 1. 全体地図

```
                        ┌──────────────────┐
                        │    item_defs     │  アイテムの「種類」カタログ
                        │  （マスタ/静的）   │  例: 鉄鉱石、炎の剣
                        └──┬────────┬───┬──┘
                           │        │   │
              typed_as ────┘        │   └──── drops
                  │                 │              │
                  ▼                 ▼              ▼
        ┌──────────────────┐ ┌──────────────┐ ┌─────────────┐
        │ inventory_stacks │ │item_instances│ │ drop_tables │
        │  量で持つ素材      │ │ 1点もの（個体）│ │ 抽選の重み表 │
        └────────┬─────────┘ └──┬────────┬──┘ └─────────────┘
                 │              │        │            ▲
                 │ owner        │ owner  │ listed_as  │ (playerと無関係)
                 │              │        ▼
                 │              │   ┌─────────────────┐
                 │              │   │ market_listings │  出品（マーケット）
                 │              │   └────────┬────────┘
                 │              │            │ seller / sold_to
                 ▼              ▼        ▼
        ╔═══════════════════════════════════════════╗
        ║               players                     ║  ← すべての起点
        ║        1人のプレイヤー = 1行               ║
        ╚═══╤═══════╤═══════════╤═══════════╤═══════╝
            │       │           │           │
       1:1  │  1:N  │      1:N  │      1:N  │
            ▼       ▼           ▼           ▼
      ┌─────────┐ ┌──────────────┐ ┌──────────────────┐ ┌───────────────┐
      │ wallets │ │ledger_entries│ │village_buildings │ │ daily_claims  │
      │ 残高    │ │  通貨の元帳   │ │    村の建物       │ │ ログボの受領印 │
      │(キャッシュ)│ │  （真実）     │ │                  │ │ idle_tick_    │
      └─────────┘ └──────────────┘ └──────────────────┘ │ events        │
                                                          └───────────────┘
```

**3つのかたまりで捉える:**

| かたまり | テーブル | 性格 |
|---|---|---|
| **マスタ（動かない）** | `item_defs` `drop_tables` | 運営が用意する定義。プレイ中に増減しない |
| **所有（動く）** | `inventory_stacks` `item_instances` `village_buildings` | 誰が何を持っているか |
| **お金と記録（動く）** | `wallets` `ledger_entries` `market_listings` `daily_claims` | 取引と、その痕跡 |

---

## 2. テーブル別カード

### players — プレイヤー本体

```
players
├─ id                 [PK] uuid
├─ name                    varchar(40)
├─ last_idle_tick_at       timestamptz  ← 放置計算の「前回いつ精算したか」
└─ last_login_at           timestamptz
```

- **1行 = 1人**
- 参照される側。ほぼ全テーブルがここを指す
- `last_idle_tick_at` は**単なる記録ではなく計算の基準点**。tick処理でここを進め忘れると二重付与になる

---

### wallets — 残高（キャッシュ）

```
wallets
├─ player_id  [PK][FK→players.id] uuid   ← PKとFKが同じ列 = 1:1 の作り方
└─ balance                        bigint  default 0
                                  CHECK: 0 <= balance <= 999,999,999,999
```

- **1行 = 1人の財布**。プレイヤーと1:1（`player_id` が PK なので2行作れない）
- **これは真実ではなくキャッシュ**。正しい残高は `ledger_entries` の合計から導出できる
- CHECK制約で負の残高が**DBレベルで**弾かれる ＝ アプリのバグがあっても DB が最後の砦になる

---

### ledger_entries — 通貨の元帳（真実）

```
ledger_entries
├─ id          [PK]           uuid
├─ player_id   [FK→players]   uuid
├─ amount                     bigint   正=入金 / 負=出金  CHECK: <> 0
├─ reason                     varchar(32)   'purchase' 'sale' 'idle_tick' ...
├─ ref_id                     uuid     この動きの原因になった取引のid
└─ created_at                 timestamptz
```

- **1行 = お金が1回動いた事実**。追記のみ、更新も削除もしない（＝会計帳簿と同じ）
- `ref_id` が肝。**1回の売買は2行以上を生む**ので、それを束ねる紐が要る:

```
  取引 ref_id = X の売買
  ┌──────────────────────────────────────────────┐
  │ player=買い手  amount=-500  reason='purchase' │  ref_id = X
  │ player=売り手  amount=+500  reason='sale'     │  ref_id = X
  └──────────────────────────────────────────────┘
       ↑ この2行は必ずセットで存在しないとおかしい
         → 同一トランザクションで書く理由がここ
```

- 検算のしかた: `SELECT SUM(amount) FROM ledger_entries WHERE player_id = ?`
  これが `wallets.balance` と**一致しなければ整合性が壊れている**

---

### item_defs — アイテムの種類（マスタ）

```
item_defs
├─ id          [PK]  uuid
├─ name              varchar(80)   '炎の剣'
├─ rarity            varchar(32)   'rare'
├─ kind              varchar(32)   'material' | 'weapon'
├─ base_value        bigint
└─ sprite_key        varchar(64)
```

- **1行 = アイテムの設計図**。「炎の剣とはどういうものか」の定義
- プレイヤーの所持とは無関係。誰も持っていなくても行は存在する

---

### inventory_stacks — 量で持つ素材

```
inventory_stacks
├─ id           [PK]              uuid
├─ player_id    [FK→players]      uuid
├─ item_def_id  [FK→item_defs]    uuid
└─ quantity                       integer
```

- **1行 = 「誰が」「何を」「何個」持っているか**
- 鉄鉱石99個は99行ではなく **1行に quantity=99**
- 個体差がないから成立する（どの鉄鉱石も同じ）→ だから**売買の対象にしにくい**

---

### item_instances — 1点もの（個体）

```
item_instances
├─ id           [PK]             uuid
├─ owner_id     [FK→players]     uuid    ← 所有者。売買で書き換わる列
├─ item_def_id  [FK→item_defs]   uuid    ← 種類（炎の剣）
├─ rolled_stats                  jsonb   {"atk": 47} 個体値
└─ is_listed                     boolean default false
```

- **1行 = 現実に存在する1個**。同じ「炎の剣」でも atk が違えば別物
- `owner_id` を書き換えることが**所有権の移動**そのもの
- ⚠️ **`is_listed` は `market_listings.status` と情報が重複している**（下の §4 で扱う）

```
   item_defs（設計図）          item_instances（実体）
   ┌───────────────┐           ┌────────────────────────────┐
   │ id: def-sword │◀──────────│ id: it-001  atk=47 owner=A │
   │ name: 炎の剣   │◀──────────│ id: it-002  atk=12 owner=B │
   └───────────────┘           │ id: it-003  atk=88 owner=A │
                               └────────────────────────────┘
        1種類                        3個の実体（性能が違う）
```

---

### market_listings — 出品（マーケット）★今週の主戦場

```
market_listings
├─ id               [PK]                  uuid
├─ seller_id        [FK→players]          uuid   売り手
├─ item_instance_id [FK→item_instances]   uuid   売りに出している“その1個”
├─ price                                  bigint
├─ status                                 varchar(20)  'active'|'sold'|'cancelled'
├─ sold_to          [FK→players] NULL可   uuid   買い手（売れるまで NULL）
└─ created_at                             timestamptz
```

- **1行 = 「この1個を、この値段で売りに出している」という掲示**
- `status` が**この行の状態そのもの**。Week 3 で守るべきはここ
- `sold_to` が NULL かどうかで「まだ買われていない」が表現される

---

### village_buildings / daily_claims / drop_tables / idle_tick_events

```
village_buildings              daily_claims                     drop_tables
├─ id          [PK]            ├─ id          [PK]              ├─ id           [PK]
├─ player_id   [FK]            ├─ player_id   [FK]              ├─ depth_band   int
├─ building_type               ├─ claim_date  date              ├─ item_def_id  [FK]
└─ level       default 1       └─ claimed_at                    ├─ weight       int
                                  UNIQUE(player_id, claim_date) └─ is_monster   bool
   1行 = 建物1棟                  ↑ 二重受領をDBが物理的に拒否      1行 = 抽選の1候補

idle_tick_events
├─ id  [PK] / player_id [FK] / created_at      1行 = tickが1回走った痕跡
```

---

## 3. 売買のとき何が動くか（正常系・買い手1人）

**マーケットは1枚のテーブルでは完結しない。4枚が同時に動く。**

```
     買い手 B が listing L（価格500）を購入する

  market_listings             item_instances          wallets              ledger_entries
  ┌────────────────────┐      ┌────────────────┐      ┌──────────┐        ┌────────────┐
  │ id      : L        │      │ id   : it-001  │      │ A : 1000 │        │ (追記のみ) │
  │ seller  : A        │─────▶│ owner: A       │      │ B :  800 │        └────────────┘
  │ item    : it-001   │      │ is_listed: T   │      └──────────┘
  │ price   : 500      │      └────────────────┘
  │ status  : active   │
  │ sold_to : NULL     │
  └────────────────────┘

                        ── 購入トランザクション ──
                                    ▼

  ┌────────────────────┐      ┌────────────────┐      ┌──────────┐        ┌────────────────────────┐
  │ status  : sold     │      │ owner: B       │      │ A : 1500 │        │ B  -500 purchase ref=L │
  │ sold_to : B        │      │ is_listed: F   │      │ B :  300 │        │ A  +500 sale     ref=L │
  └────────────────────┘      └────────────────┘      └──────────┘        └────────────────────────┘
```

**変更点の一覧:**

| テーブル | 何が変わるか | 種類 |
|---|---|---|
| `market_listings` | `status` → `sold`、`sold_to` → 買い手 | UPDATE |
| `item_instances` | `owner_id` → 買い手、`is_listed` → false | UPDATE |
| `wallets` | 買い手 −500 / 売り手 +500 | UPDATE ×2 |
| `ledger_entries` | 2行 追記（同じ `ref_id`） | INSERT ×2 |

この**5〜6個の書き込みが全部成功するか全部失敗するか**、が「1トランザクション」の意味。

**保存則（検算の道具）:**
- 通貨の総量は前後で変わらない（1000+800 = 1500+300 = 1800）
- `item_instances` の1行に対し `owner_id` はただ1人
- 手数料シンクを入れると総量は減る（減った分は必ず ledger に痕跡がある）

---

## 4. 状態が二重に書かれている場所（自分で判断すべき論点）

同じ事実が**2箇所**に書かれている:

```
   「it-001 は出品中である」
        ├── market_listings.status  = 'active'   ← 掲示側の表現
        └── item_instances.is_listed = true      ← 現物側の表現
```

`market_listings.status` を `sold` にして `is_listed` を `true` のまま落としたら、
「売れているのに出品中の現物」というありえない状態が生まれる。

考えておくべき問い（答えは自分で出す）:

1. この2つが食い違ったとき、**どちらを信じるのか**
2. そもそも `is_listed` は必要か。`market_listings` を引けば分かることではないか
3. 必要だとしたら、どうやって食い違いを**構造的に**防ぐか
   （アプリで頑張る / DB制約で縛る / 部分ユニークインデックス、のどれか）
4. 「1つの `item_instance` に `active` な `market_listings` は最大1行」は、いま何が保証しているか

---

## 5. 状態を目で確かめるSQL

```sql
-- 誰が何を持っているか（1点もの）
SELECT ii.id, d.name, ii.rolled_stats, p.name AS owner, ii.is_listed
FROM item_instances ii
JOIN item_defs d ON d.id = ii.item_def_id
JOIN players   p ON p.id = ii.owner_id;

-- 出品中の一覧
SELECT l.id, l.price, l.status, sp.name AS seller, d.name AS item
FROM market_listings l
JOIN players sp ON sp.id = l.seller_id
JOIN item_instances ii ON ii.id = l.item_instance_id
JOIN item_defs d ON d.id = ii.item_def_id
WHERE l.status = 'active';

-- ★整合性チェック: キャッシュ(wallets) と 真実(ledger) が一致しているか
SELECT p.name,
       w.balance                        AS cached,
       COALESCE(SUM(le.amount), 0)      AS from_ledger,
       w.balance - COALESCE(SUM(le.amount), 0) AS drift   -- 0 でなければ壊れている
FROM players p
JOIN wallets w ON w.player_id = p.id
LEFT JOIN ledger_entries le ON le.player_id = p.id
GROUP BY p.name, w.balance;

-- ★二重販売の検出: 同じ現物に active な出品が2つ以上ないか
SELECT item_instance_id, COUNT(*)
FROM market_listings WHERE status = 'active'
GROUP BY item_instance_id HAVING COUNT(*) > 1;
```

---

## 6. 現在の実装状況（2026-07-28 時点）

| テーブル | マイグレーション | アプリからの読み書き |
|---|---|---|
| players / wallets | 適用済み | `POST /players`（作成）、`POST /players/:id/tick` |
| ledger_entries | 適用済み | tick で追記 |
| idle_tick_events | 適用済み | tick で追記 |
| item_defs / item_instances / inventory_stacks | 適用済み | **未実装** |
| market_listings | 適用済み | **未実装（Week 3 でここから）** |
| village_buildings / daily_claims / drop_tables | 適用済み | 未実装 |
