/**
 * Every route prerenders, so Worker script invocations approach zero. On Cloudflare Workers
 * static assets, asset requests are free and unlimited — only script invocations are metered.
 */
export const prerender = true;
