import { Elysia } from "elysia";

const defaultAllowedOrigins = "http://localhost:5173,https://strata-app-zjr.pages.dev";

function normalizeOrigin(origin: string): string {
	return origin.trim().replace(/\/$/, "");
}

const allowedOrigins = (Bun.env.CORS_ALLOWED_ORIGINS ?? defaultAllowedOrigins)
	.split(",")
	.map(normalizeOrigin)
	.filter(Boolean);

function resolveAllowedOrigin(origin: string | null): string | undefined {
	if (!origin) return undefined;
	if (allowedOrigins.includes("*")) return "*";
	const normalizedOrigin = normalizeOrigin(origin);
	return allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : undefined;
}

function applyCorsHeaders(headers: Record<string, string>, origin: string | null): void {
	const allowedOrigin = resolveAllowedOrigin(origin);
	if (!allowedOrigin) return;

	headers["Access-Control-Allow-Origin"] = allowedOrigin;
	headers.Vary = "Origin";
	headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
	headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,Idempotency-Key";
	headers["Access-Control-Max-Age"] = "86400";
}

const items = new Elysia({ prefix: "items" })
	.get("/", () => "Items List")
	.get("/:id", ({ params: { id } }) => `Item ID: ${id}`)
	.delete("/:id", ({ params: { id } }) => `Delete Item ID: ${id}`);

new Elysia()
	.onRequest(({ request, set }) => {
		applyCorsHeaders(set.headers, request.headers.get("Origin"));
	})
	.options("/*", ({ request, set }) => {
		applyCorsHeaders(set.headers, request.headers.get("Origin"));
		set.status = 204;
		return;
	})
	.use(items)
	.get("/", () => "Hello World")
	.get("/health", () => "Hi! I'm healthy!")
	.listen(8080);
