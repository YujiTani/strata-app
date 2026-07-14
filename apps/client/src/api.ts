const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
console.log(`rawApiBaseUrl: ${rawApiBaseUrl}`);

export const apiBaseUrl = rawApiBaseUrl.replace(/\/$/, "");
console.log(`apiBaseUrl: ${apiBaseUrl}`);

export function apiUrl(path: `/${string}`): string {
	return `${apiBaseUrl}${path}`;
}
