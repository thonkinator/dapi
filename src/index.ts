import { Hono, type Context } from "hono";
import type { APIUser, RESTRateLimit } from "discord-api-types/v10";

type Types = {
	Bindings: {
		TOKEN: string;
	};
	Variables: {
		retries: number;
	};
};

const app = new Hono<Types>();
app.use("*", async (c, next) => {
	const start = performance.now();
	await next();
	c.header("X-Response-Time", `${performance.now() - start}`);
	c.header("Access-Control-Allow-Origin", "*");
});
app.use("*", async (c, next) => {
	const cached = await caches.default.match(c.req.url);
	if (cached && !cached.headers.get("Content-Type")?.startsWith("application/xml")) {
		console.log(cached);
		const res = new Response(cached.body, cached);
		res.headers.set("X-Cache-Status", "HIT");
		return res;
	}
	await next();
	if (!c.res.ok) return;
	c.header("X-Retries", `${c.get("retries")}`);
	c.header("X-Cache-Status", "MISS");
	c.executionCtx.waitUntil(caches.default.put(c.req.url, c.res.clone()));
});

async function api(c: Context<Types>, endpoint: string, retries = 0) {
	const res: RESTRateLimit = await (
		await fetch(`https://discord.com/api/v10${endpoint}`, {
			headers: {
				Authorization: `Bot ${c.env.TOKEN}`,
			},
		})
	).json();
	c.set("retries", retries);
	if (!res.retry_after) return res;
	return new Promise((resolve, reject) => {
		setTimeout(() => resolve(api(c, endpoint, retries + 1)), res.retry_after * 1000);
	});
}

async function cdn(c: Context<Types>, endpoint: string) {
	const url = new URL(`https://cdn.discordapp.com${endpoint}`);
	new URL(c.req.url).searchParams.forEach((value, param) => url.searchParams.append(param, value));
	const res = await fetch(url);
	return new Response(res.body, {
		headers: {
			"Content-Type": res.headers.get("Content-Type")!,
		},
	});
}

app.get(
	"/users/:id{[0-9]{1,20}}/:asset{(?:avatar|banner|avatar-decoration)(?:\\.png|\\.webp|\\.jpg|\\.jpeg|\\.gif)?}",
	async (c) => {
		const { id, asset: assetRaw } = c.req.param();
		const [asset, format = "webp"] = assetRaw.split(".");
		const user = (await api(c, `/users/${id}`)) as APIUser;
		const assetHash = user[asset.replaceAll("-", "_") as "avatar" | "banner" | "avatar_decoration"];
		const url = new URL(c.req.url);
		return user.avatar == null && asset == "avatar"
			? await cdn(
					c,
					`/embed/avatars/${
						user.discriminator == "0" ? (BigInt(id) >> 22n) % 6n : parseInt(user.discriminator) % 5
					}.png`
			  )
			: await cdn(
					c,
					`/${asset}s/${id}/${assetHash}.${
						assetHash?.startsWith("a_") && !url.searchParams.has("noanim") ? "gif" : format
					}`
			  );
	}
);

// can't do guilds, even discoverable ones, bc of DAPI limitations. sry :(

// Applications?
// Icon
// Cover
// Achievement Icons

export default app;
