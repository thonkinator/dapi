import { Hono, type Context } from "hono";
import type { APIUser, APIGuild } from "discord-api-types/v10";

type Bindings = {
	TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

async function api(c: Context<{ Bindings: Bindings }>, endpoint: string) {
	return (
		await fetch(`https://discord.com/api/v10${endpoint}`, {
			headers: {
				Authorization: `Bot ${c.env.TOKEN}`,
			},
		})
	).json();
}

function cdn(c: Context<{ Bindings: Bindings }>, endpoint: string) {
	const url = new URL(`https://cdn.discordapp.com${endpoint}`);
	new URL(c.req.url).searchParams.forEach((value, param) => url.searchParams.append(param, value));
	return fetch(url);
}

app.get(
	"/users/:id{[0-9]{1,20}}/:asset{(?:avatar|banner|avatar-decoration)(?:\\.png|\\.webp|\\.jpg|\\.jpeg|\\.gif)?}",
	async (c) => {
		const { id, asset: assetRaw } = c.req.param();
		const [asset, format = "webp"] = assetRaw.split(".");
		const user = (await api(c, `/users/${id}`)) as APIUser;
		const assetHash = user[asset.replaceAll("-", "_") as "avatar" | "banner" | "avatar_decoration"];
		return user.avatar == null && asset == "avatar"
			? cdn(
					c,
					`/embed/avatars/${
						user.discriminator == "0" ? (BigInt(id) >> 22n) % 6n : parseInt(user.discriminator) % 5
					}.png`
			  )
			: cdn(c, `/${asset}s/${id}/${assetHash}.${assetHash?.startsWith("a_") ? "gif" : format}`);
	}
);

// can't do guilds, even discoverable ones, bc of DAPI limitations. sry :(

// Applications?
// Icon
// Cover
// Achievement Icons

export default app;
