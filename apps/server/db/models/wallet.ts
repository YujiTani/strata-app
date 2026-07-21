import { t } from "elysia";
import { table } from "../schema";
import { spread } from "../utils";

const wallet = spread(table.wallets, "insert");

export const insertWallet = t.Object({
	player_id: wallet.player_id,
});

export const selectWallet = spread(table.wallets, "select");
