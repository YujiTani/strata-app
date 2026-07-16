import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
	throw new Error("DATABASE_URL is not defined in .env.development");
}

const sql = postgres(url);

async function checkDatabaseConnection() {
	try {
		const result = await sql`SELECT 1 AS ok`;
		console.log("Database connection successful:", result);
	} catch (error) {
		console.error("Database connection failed:", error);
		process.exitCode = 1;
	} finally {
		await sql.end();
	}
}

checkDatabaseConnection();
