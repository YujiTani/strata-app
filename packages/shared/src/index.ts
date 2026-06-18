// packages/shared — apps/client と apps/server が共有する「純粋なコード」の置き場。
// 置くもの: 型 / 定数 / 検証スキーマなど、両アプリが import する非実行時依存の少ないもの。
//
// 注意（architecture.md の検証境界 🔒）:
//   通貨・採掘・在庫など「データ整合性の主軸」に関わる型/検証スキーマは、
//   ここに置く場合でも *Yuzu 自身が設計・実装する*。AI には丸投げしない。
//   以下はワークスペース配線を確認するための最小の足場であり、後で実物に置き換える。

/** ワークスペース解決の確認用。実際の共有物ができたら削除してよい。 */
export const SHARED_PACKAGE_NAME = "@packages/shared";

/** 数値を [min, max] に収める汎用ヘルパー（ドメイン非依存の例）。 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
