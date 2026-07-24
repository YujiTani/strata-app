/**
 * @lastModified 2025-02-04
 * @see https://elysiajs.com/recipe/drizzle.html#utility
 */

import { Kind, type TObject } from "@sinclair/typebox";
import type { Table } from "drizzle-orm";
import { type BuildSchema, createInsertSchema, createSelectSchema } from "drizzle-typebox";

type Spread<T extends TObject | Table, Mode extends "select" | "insert" | undefined> =
	T extends TObject<infer Fields>
		? {
				[K in keyof Fields]: Fields[K];
			}
		: T extends Table
			? Mode extends "select"
				? BuildSchema<"select", T["_"]["columns"], undefined>["properties"]
				: Mode extends "insert"
					? BuildSchema<"insert", T["_"]["columns"], undefined>["properties"]
					: {}
			: {};

/**
 * Spread a Drizzle schema into a plain object
 */
export const spread = <T extends TObject | Table, Mode extends "select" | "insert" | undefined>(
	schema: T,
	mode?: Mode,
): Spread<T, Mode> => {
	const newSchema: Record<string, unknown> = {};
	let table: TObject | Table;

	switch (mode) {
		case "insert":
		case "select":
			if (Kind in schema) {
				table = schema;
				break;
			}

			table = mode === "insert" ? createInsertSchema(schema) : createSelectSchema(schema);

			break;

		default:
			if (!(Kind in schema)) throw new Error("Expect a schema");
			table = schema;
	}

	for (const key of Object.keys(table.properties)) newSchema[key] = table.properties[key];

	return newSchema as any;
};
