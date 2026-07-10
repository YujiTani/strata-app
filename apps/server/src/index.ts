import { Elysia } from "elysia";

const items = new Elysia({ prefix: "items" })
	.get("/", () => "Items List")
	.get("/:id", ({ params: { id } }) => `Item ID: ${id}`)
	.delete("/:id", ({ params: { id } }) => `Delete Item ID: ${id}`);

new Elysia()
	.use(items)
	.get("/", () => "Hello World")
	.get("/health", () => "Hi! I'm healthy!")

	.listen(8080);
