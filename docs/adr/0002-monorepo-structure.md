# ADR-0002: モノレポ構成（Bun workspaces）

- ステータス: 決定
- 日付: 2026-07-13

## コンテキスト

サーバー（バックエンド）・クライアント（Phaser）・両者で共有したいコード（決定論的PRNG等、
`docs/architecture.md`のSEED設計参照）が存在する。別リポジトリに分けるか、1つにまとめるかを決める必要があった。

## 決定

Bun workspaces を使ったモノレポ構成にする。`apps/server` `apps/client` `packages/shared` の3ワークスペース。

## 検討した選択肢

| 選択肢 | 採用しなかった理由 |
|---|---|
| サーバー/クライアント別リポジトリ | SEED から map を再現する決定論的ロジック等をクライアント・サーバーで**同一コード**として共有する必要があり（`architecture.md`）、別リポジトリだとコピーがズレるリスクがある |
| npm/pnpm workspaces | ランタイムをBunに統一する判断（ADR-0001）と合わせ、ワークスペース機能もBun組み込みのものを使う |

## 理由

`packages/shared` にSEED PRNG等を置き、クライアント・サーバー双方から同一コードを参照できることが、
「サーバーが正・クライアントは演出」という設計（`architecture.md`）の前提を壊さないために重要だった。

## 結果・トレードオフ

- 得たもの: shared コードの単一ソース化。Dockerfileのcontextをリポジトリルートに置く必要が生じた
  （`apps/server`単体を切り出せないため、`.dockerignore`の設計にも影響 — 詳細は `docs/progress.md` 2026-07-24 参照）
- 払ったコスト: `bun.lock`がワークスペース全体を記録するため、`apps/client`を追加した際に
  server用Dockerfileの`--frozen-lockfile`が構成不一致で落ちる、という実例にぶつかった
  （学習ノート `2026-07-14-bun-lockfile-docker` 参照）
