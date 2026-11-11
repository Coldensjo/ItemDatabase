// Serves docs/ on http://localhost:8377 for a local look at the site. Usage: bun serve.mjs
import path from 'node:path';
import { CACHE } from './lib/gamedata.mjs';

const root = path.join(CACHE, '..', '..', 'docs');
Bun.serve({
	port: 8377,
	async fetch(request) {
		const url = new URL(request.url);
		const file = Bun.file(path.join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
		return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
	},
});
console.log('http://localhost:8377');
