# ADR（Architecture Decision Records）

技術選定の「候補・判断基準・決定・捨てた選択肢」を記録する。`CLAUDE.md`の「確定している技術選定」表の
詳細版であり、面接等で判断根拠を語るための資産でもある。

新しいADRを書くときは `template.md` をコピーする。

## 一覧

| ADR | タイトル | ステータス |
|---|---|---|
| [0001](./0001-language-runtime.md) | 言語・ランタイム・パッケージマネージャ | 決定 |
| [0002](./0002-monorepo-structure.md) | モノレポ構成（Bun workspaces） | 決定 |
| [0003](./0003-web-framework.md) | バックエンドWebフレームワーク | 決定 |
| [0004](./0004-orm-migration.md) | ORM・マイグレーション | 決定 |
| [0005](./0005-database-provider.md) | データベースとリージョン | 決定 |
| [0006](./0006-db-connection-driver.md) | DB接続ドライバとpooled/unpooledの使い分け | 決定 |
| [0007](./0007-lint-format.md) | Lint / Format | 決定 |
| [0008](./0008-testing.md) | テストツール | 決定 |
| [0009](./0009-frontend-stack.md) | フロントエンド構成 | 決定 |
| [0010](./0010-backend-hosting-cicd.md) | バックエンドのアプリ基盤・ビルド・CI/CD | 決定 |
| [0011](./0011-frontend-hosting.md) | フロントエンドのホスティング | 決定 |

## 検収について

これらはAIが既存ドキュメント（`CLAUDE.md`・`docs/progress.md`・学習ノート）から初版をドラフトしたもの。
各ADRの「理由」「結果・トレードオフ」を自分の言葉で説明できるかを確認し、説明できない・納得できない箇所は
書き直すこと。`TODO:`が残っている箇所は特に、自分の記憶・判断を補って埋めること。
