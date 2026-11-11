// Development aid: writes tables as JSON to cache/json/ for inspection. Usage: bun dump.mjs Item ItemSparse ...
// Set DBCACHE to a DBCache.bin path to include rows from the game cache.
import { GameData, CACHE } from './lib/gamedata.mjs';
import fs from 'node:fs';
import path from 'node:path';
const gd = await new GameData('eu', 'wowf').open();
console.log(gd.useHotfixes(process.env.DBCACHE));
fs.mkdirSync(path.join(CACHE, 'json'), { recursive: true });
for (const name of process.argv.slice(2)) {
	try {
		const rows = await gd.table(name);
		fs.writeFileSync(path.join(CACHE, 'json', name + '.json'), JSON.stringify([...rows.values()], (k, v) => typeof v === 'bigint' ? Number(v) : v));
		console.log(name, rows.size);
	} catch (e) { console.log(name, 'FAILED', e.message); }
}
