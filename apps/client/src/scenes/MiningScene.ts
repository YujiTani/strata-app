import Phaser from "phaser";

import { apiUrl } from "../api";

/**
 * 採掘シーン。
 * Step 1 時点では「洞窟風の背景 + タイトル + サーバー疎通表示」のみ。
 * グリッド・キャラ・採掘ループは以降のステップで追加する。
 *
 * 注意（architecture.md）: このシーンはすべて「演出」。
 * ドロップ・通貨・進捗の確定はサーバーが行い、クライアントは結果を決めない。
 */
export class MiningScene extends Phaser.Scene {
	constructor() {
		super("mining");
	}

	create(): void {
		this.drawCaveBackground();
		this.drawHud();
	}

	/** 暗色の矩形を重ねただけの洞窟風背景（図形プレースホルダー）。 */
	private drawCaveBackground(): void {
		const { width, height } = this.scale;

		// 天井と床の岩盤
		this.add.rectangle(width / 2, 24, width, 48, 0x1c1a24);
		this.add.rectangle(width / 2, height - 40, width, 80, 0x1c1a24);

		// 奥行きの暗がり（左ほど暗い＝進行方向）
		this.add.rectangle(width * 0.15, height / 2, width * 0.3, height, 0x08080e, 0.6);
	}

	private drawHud(): void {
		this.add.text(16, 12, "⛏ Strata", {
			fontSize: "20px",
			color: "#e8d9a0",
		});

		const healthText = this.add.text(this.scale.width - 16, 12, "server: ⏳ checking...", {
			fontSize: "14px",
			color: "#9aa0b0",
		});
		healthText.setOrigin(1, 0);

		// サーバー疎通確認。権威はサーバー側にあるため、疎通不能は明示的に見せる。
		fetch(apiUrl("/health"))
			.then(async (res) => {
				if (!res.ok) throw new Error(`status ${res.status}`);
				const body = await res.text();
				healthText.setText(`server: ✅ ${body}`);
				healthText.setColor("#8fd18f");
			})
			.catch(() => {
				healthText.setText("server: ❌ unreachable");
				healthText.setColor("#d18f8f");
			});
	}
}
