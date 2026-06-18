import { useState } from "react";

const PLAN = `# 計画概要
- 題材: 洞窟発掘×放置ゲーム(ゲームはガワ、本体はバックエンド学習)
- 開発者: フロントエンド経験4年(TypeScript/React)。バックエンド実務経験は薄い
- 期間: 8週間、週10-20h、合計約120h
- 学習主軸: データ整合性を守る堅牢なバックエンド設計(トランザクション・ロック・冪等性)。インフラ/CI/CDとAI実装検証は主軸を裏付ける脇役
- 技術: TypeScript+Hono、Neon(Serverless Postgres)、Fly.io(Neonに東京リージョンが無いため、アプリ・DBともシンガポールに同居)、Phaserクライアント、Dockerfile自作+GitHub Actions CI/CD
- データモデル: players / wallets / ledger_entries(複式元帳、残高はledgerから導出) / inventory_stacks / item_instances / listings / village_buildings / daily_claims / drop_tables。すべてサーバー権威
- 週次計画:
  - W1: 環境構築(リポジトリ、Dockerfile自作、ローカルPostgres、ヘルスチェックAPI)
  - W2: スキーマ+マイグレーション、players/wallets/ledgerのCRUD、冪等な放置tick
  - W3: 山場。並行購入で二重販売を再現→FOR UPDATEで修正→並行攻撃を自動テスト化
  - W4: デイリー報酬(UNIQUE制約)、村アップグレード(複数リソースを1トランザクションで消費)
  - W5: 本番デプロイ+CI/CD+リージョン間レイテンシ実測(NRT vs SIN)
  - W6-7: Phaserで掘る→ドロップ→売買の薄いクライアント
  - W8: バッファ+デモ磨き+記事化
- 成果物: 動くデモ(3分台本: 冒頭「壊してみせる」宣言→経済紹介→FOR UPDATE無しで攻撃実演→修正→再攻撃で防御実証→AI出力の誤りを捕まえた具体例)、ADR群、技術記事、週次進捗ログ
- non-goals: 認証本格対策、レート制限、リアルタイム通知、ギルド、Tauri常駐化、常時ウォーミング
- 時間配分: バックエンド60h / インフラ20h / クライアント25h / ドキュメント15h`;

const REVIEW_PROMPT = `あなたは辛口だが公正なシニアエンジニアです。後輩の個人開発計画をレビューします。この計画は別のメンターと練られたものですが、あなたは利害のない第三者として、忖度なしで見直してください。

${PLAN}

以下の構成で日本語で回答してください。見出しは「## 」で始めてください。
## 致命的な問題(あれば)
## 見落とされているリスク
## 過剰・不要と思う部分
## 良い点
## 総合判定(GO / 条件付きGO / 再考)
具体的に、根拠とともに。問題が無い項目は「特になし」と正直に書くこと。`;

export default function PlanReview() {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [review, setReview] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const runReview = async () => {
    setStatus("loading");
    setReview("");
    setErrorMsg("");
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2500,
          messages: [{ role: "user", content: REVIEW_PROMPT }],
        }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || "API error");
      }
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (!text) throw new Error("空の応答が返りました");
      setReview(text);
      setStatus("done");
    } catch (e) {
      setErrorMsg(String(e.message || e));
      setStatus("error");
    }
  };

  // minimal markdown-ish renderer: ## headers, bold, lists
  const renderLine = (line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} style={styles.h2}>
          {line.slice(3)}
        </h2>
      );
    }
    if (/^\s*[-*]\s/.test(line)) {
      return (
        <div key={i} style={styles.li}>
          <span style={styles.bullet}>▸</span>
          <span>{renderInline(line.replace(/^\s*[-*]\s/, ""))}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
    return (
      <p key={i} style={styles.p}>
        {renderInline(line)}
      </p>
    );
  };

  const renderInline = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, j) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={j} style={{ color: "#F5B450" }}>
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      )
    );
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.eyebrow}>CAVE GAME PROJECT — INDEPENDENT REVIEW</div>
        <h1 style={styles.h1}>計画レビュー: サブエージェント</h1>
        <p style={styles.lead}>
          利害のない別のClaudeインスタンスに、8週間計画の全文を渡して
          シニアエンジニア観点の監査を依頼します。
        </p>

        <details style={styles.details}>
          <summary style={styles.summary}>レビュー対象の計画を確認する</summary>
          <pre style={styles.pre}>{PLAN}</pre>
        </details>

        <button
          onClick={runReview}
          disabled={status === "loading"}
          style={{
            ...styles.button,
            opacity: status === "loading" ? 0.6 : 1,
            cursor: status === "loading" ? "wait" : "pointer",
          }}
        >
          {status === "loading"
            ? "レビュー中…(20秒ほどかかります)"
            : status === "done"
            ? "もう一度レビューを実行"
            : "レビューを実行"}
        </button>

        {status === "error" && (
          <div style={styles.error}>
            レビューを取得できませんでした: {errorMsg}
            <br />
            もう一度実行してください。
          </div>
        )}

        {status === "done" && (
          <div style={styles.reviewBox}>
            <div style={styles.reviewLabel}>SUB-AGENT REVIEW</div>
            {review.split("\n").map(renderLine)}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#1C1A17",
    padding: "32px 16px 64px",
    fontFamily:
      "'Hiragino Sans', 'Noto Sans JP', -apple-system, sans-serif",
    color: "#D9D4CC",
  },
  container: { maxWidth: 720, margin: "0 auto" },
  eyebrow: {
    fontSize: 11,
    letterSpacing: "0.18em",
    color: "#8A8378",
    fontFamily: "ui-monospace, 'SF Mono', monospace",
    marginBottom: 12,
  },
  h1: {
    fontSize: 26,
    fontWeight: 700,
    color: "#F2EEE7",
    margin: "0 0 12px",
    lineHeight: 1.3,
  },
  lead: { fontSize: 14, lineHeight: 1.8, color: "#A8A296", margin: "0 0 24px" },
  details: {
    background: "#23211D",
    border: "1px solid #35322C",
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 24,
  },
  summary: { cursor: "pointer", fontSize: 13, color: "#C9C3B8" },
  pre: {
    fontSize: 12,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    color: "#A8A296",
    fontFamily: "ui-monospace, 'SF Mono', monospace",
    marginTop: 12,
  },
  button: {
    width: "100%",
    padding: "14px 20px",
    fontSize: 15,
    fontWeight: 700,
    background: "#F5B450",
    color: "#1C1A17",
    border: "none",
    borderRadius: 8,
    marginBottom: 24,
  },
  error: {
    background: "#2C1F1B",
    border: "1px solid #6B3A2E",
    color: "#E8A28F",
    borderRadius: 8,
    padding: 16,
    fontSize: 13,
    lineHeight: 1.7,
    marginBottom: 24,
  },
  reviewBox: {
    background: "#23211D",
    border: "1px solid #3D382F",
    borderLeft: "3px solid #F5B450",
    borderRadius: 8,
    padding: "20px 22px",
  },
  reviewLabel: {
    fontSize: 10,
    letterSpacing: "0.18em",
    color: "#F5B450",
    fontFamily: "ui-monospace, 'SF Mono', monospace",
    marginBottom: 16,
  },
  h2: {
    fontSize: 16,
    fontWeight: 700,
    color: "#F2EEE7",
    margin: "20px 0 8px",
    paddingBottom: 6,
    borderBottom: "1px solid #35322C",
  },
  p: { fontSize: 14, lineHeight: 1.9, margin: "0 0 4px" },
  li: {
    display: "flex",
    gap: 8,
    fontSize: 14,
    lineHeight: 1.9,
    marginBottom: 2,
  },
  bullet: { color: "#F5B450", flexShrink: 0 },
};
