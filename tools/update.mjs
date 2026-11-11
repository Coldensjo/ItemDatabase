// Builds the site data and publishes it.
//   bun update.mjs            once
//   bun update.mjs --watch    keep running: rebuild when the game is patched or its cache changes
//   bun update.mjs --no-push  build only
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CASCClient } from '@rhyster/wow-casc-dbc';
import { CACHE } from './lib/gamedata.mjs';
import { publish, restoreState } from './publish.mjs';

const ROOT = path.join(CACHE, '..', '..');
const HERE = path.join(CACHE, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const watch = process.argv.includes('--watch');
const push = config.push !== false && !process.argv.includes('--no-push');
const cacheFile = path.join(config.wow_path, 'Cache', 'ADB', config.locale ?? 'enUS', 'DBCache.bin');
const logFile = path.join(ROOT, 'state', 'update.log');

function log(text) {
	const line = `${new Date().toLocaleString('sv-SE')} ${text}`;
	console.log(line);
	fs.mkdirSync(path.dirname(logFile), { recursive: true });
	fs.appendFileSync(logFile, line + '\n');
}

// Every build refreshes the list of missing items; keep an installed copy of the addon current.
function refreshInstalledAddon() {
	const target = path.join(config.wow_path, 'Interface', 'AddOns', 'ItemHarvest');
	if (!fs.existsSync(target)) return;
	fs.cpSync(path.join(ROOT, 'addon', 'ItemHarvest'), target, { recursive: true });
}

function run() {
	if (restoreState()) log('restored saved state from the published site');
	const build = spawnSync('bun', ['build.mjs'], { cwd: HERE, encoding: 'utf8', windowsHide: true });
	for (const line of `${build.stdout}${build.stderr}`.split('\n')) if (line.trim()) log(line.trimEnd());
	if (build.status !== 0) throw new Error('build failed');
	refreshInstalledAddon();
	if (!push) return;
	const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'data', 'meta.json'), 'utf8'));
	log(publish(`Items for build ${meta.build}`) ? 'published' : 'nothing changed, not published');
}

// What a rebuild depends on: the live game version and the game cache file.
async function fingerprint() {
	let version = '';
	try {
		version = (await CASCClient.getProductVersion(config.region, config.product))?.VersionsName ?? '';
	} catch {
		// offline: skip this round
	}
	const cache = fs.existsSync(cacheFile) ? fs.statSync(cacheFile).mtimeMs : 0;
	return version ? `${version}|${cache}` : '';
}

if (!watch) {
	run();
} else {
	const seenFile = path.join(ROOT, 'state', 'watch.txt');
	const minutes = config.check_interval_minutes ?? 15;
	log(`watching for patches and cache changes every ${minutes} minutes`);
	for (;;) {
		try {
			const now = await fingerprint();
			const before = fs.existsSync(seenFile) ? fs.readFileSync(seenFile, 'utf8') : '';
			if (now && now !== before) {
				log('change detected');
				run();
				fs.writeFileSync(seenFile, now);
			}
		} catch (error) {
			log(`failed: ${error.message}; will try again`);
		}
		await new Promise((resolve) => setTimeout(resolve, minutes * 60000));
	}
}
