import { t } from "elysia";
import { table } from "../schema";
import { spread } from "../utils";

const player = spread(table.players, "insert");

export const insertPlayer = t.Object({
	name: player.name,
});

export const selectPlayer = spread(table.players, "select");
