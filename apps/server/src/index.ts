import { Elysia, file } from "elysia";

const items = new Elysia({ prefix: "items" })
	.get("/", () => "Items List")
	.get("/:id", ({ params: { id } }) => `Item ID: ${id}`)
	.delete("/:id", ({ params: { id } }) => `Delete Item ID: ${id}`);

new Elysia()
	.use(items)
	.get("/", () => "Hello World")
	.get("/health", () => "Hi! I'm healthy!")
	.get("/users/:id", ({ params: { id } }) => `User ID: ${id}`)
	.get("/users/:id/profile", file("../assets/xIcon.png"))
	.get("context", (context) => {
		console.log(context);
		return context.body;
	})
	.get("/status", ({ status }) => status(200, "ok"))
	.get("set", ({ set }) => {
		set.status = 201;
		return "ok bokujou!";
	})
	.get("cookie", ({ cookie: name }) => {
		console.log(name.value);
		name.value = "とどろきくん";
	})

	.listen(3001);
