import postgres from "postgres";

const poolUrl = process.env.DATABASE_URL;
const unPoolUrl = process.env.DATABASE_URL_UNPOOLED;

if (!poolUrl) {
	throw new Error("DATABASE_URL is not defined in .env.development");
}

if (!unPoolUrl) {
	throw new Error("DATABASE_URL_UNPOOLED is not defined in .env.development");
}

const sqlA = postgres(poolUrl);
const sqlB = postgres(unPoolUrl);

async function checkDatabaseConnection(sql: postgres.Sql) {
	try {
		const result = await sql`SELECT 1 AS ok`;
		console.log("Database connection successful:", result);
	} catch (error) {
		console.error("Database connection failed:", error, sql);
		process.exitCode = 1;
	} finally {
		await sql.end();
	}
}

checkDatabaseConnection(sqlA);
checkDatabaseConnection(sqlB);
