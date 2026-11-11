// Builds the website's data (docs/data, docs/icons) from the game's own files.
// Usage: bun build.mjs      Settings are in ../config.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadAll } from './lib/load.mjs';
import { ItemBuilder, STAT, SLOT, QUALITY } from './lib/items.mjs';
import { decodeBLP } from './lib/blp.mjs';
import { CACHE } from './lib/gamedata.mjs';

const ROOT = path.join(CACHE, '..', '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.join(ROOT, 'docs', 'data');
const STATE = path.join(ROOT, 'state');
const CHUNK = 500; // tooltips per file
const CELL = 64, COLUMNS = 32, ROWS = 32, SHOWN = 44; // icon sheets

const hotfixFile = path.join(config.wow_path, 'Cache', 'ADB', config.locale ?? 'enUS', 'DBCache.bin');
const { gd, tables, gameTables } = await loadAll({ region: config.region, product: config.product, hotfixFile, stateDir: STATE });
const builder = new ItemBuilder(tables, gameTables);

const records = [];
const tooltips = [];
const unknown = [];
for (const id of [...tables.Item.keys()].sort((a, b) => a - b)) {
	const built = builder.build(id);
	if (!built) { unknown.push(id); continue; }
	if (!built.record.n) continue;
	records.push(built.record);
	tooltips.push(built.lines);
}

// Icons: sheets of 1024, cut from the game's own textures.
const iconNames = [...new Set(records.map((r) => r.ic))].sort();
const iconFile = new Map(records.map((r) => [r.ic, r.icf]));
const iconIndex = new Map(iconNames.map((name, i) => [name, i]));
for (const record of records) {
	record.i = iconIndex.get(record.ic);
	delete record.ic;
	delete record.icf;
}

const iconDir = path.join(ROOT, 'docs', 'icons');
fs.mkdirSync(iconDir, { recursive: true });
const perSheet = COLUMNS * ROWS;
const sheets = Math.ceil(iconNames.length / perSheet);
const iconState = path.join(STATE, 'icons.json');
const previousIcons = fs.existsSync(iconState) ? fs.readFileSync(iconState, 'utf8') : '';
const currentIcons = JSON.stringify(iconNames);
if (previousIcons !== currentIcons || !fs.existsSync(path.join(iconDir, `sheet${sheets - 1}.jpg`))) {
	console.log(`icons: ${iconNames.length} in ${sheets} sheets`);
	for (let sheet = 0; sheet < sheets; sheet++) {
		const raw = Buffer.alloc(COLUMNS * CELL * ROWS * CELL * 3, 20);
		for (let slot = 0; slot < perSheet; slot++) {
			const name = iconNames[sheet * perSheet + slot];
			if (!name) break;
			let image;
			try {
				const file = await gd.file(iconFile.get(name), `icons/${iconFile.get(name)}.blp`);
				if (file) image = decodeBLP(file);
			} catch {
				// an icon this build does not ship: left blank
			}
			if (!image) continue;
			const ox = (slot % COLUMNS) * CELL, oy = Math.floor(slot / COLUMNS) * CELL;
			for (let y = 0; y < CELL; y++) {
				for (let x = 0; x < CELL; x++) {
					const sx = Math.floor((x * image.width) / CELL), sy = Math.floor((y * image.height) / CELL);
					const from = (sy * image.width + sx) * 4, to = ((oy + y) * COLUMNS * CELL + ox + x) * 3;
					raw[to] = image.pixels[from];
					raw[to + 1] = image.pixels[from + 1];
					raw[to + 2] = image.pixels[from + 2];
				}
			}
		}
		const rawFile = path.join(CACHE, `sheet${sheet}.rgb`);
		fs.writeFileSync(rawFile, raw);
		const result = spawnSync('magick', ['-size', `${COLUMNS * CELL}x${ROWS * CELL}`, '-depth', '8', `rgb:${rawFile}`,
			'-resize', `${COLUMNS * SHOWN}x${ROWS * SHOWN}`, '-quality', '86', path.join(iconDir, `sheet${sheet}.jpg`)], { encoding: 'utf8' });
		fs.rmSync(rawFile);
		if (result.status !== 0) throw new Error(`magick failed: ${result.stderr || result.error}`);
	}
	fs.writeFileSync(iconState, currentIcons);
}

// What changed since the previous build, per item.
const seenFile = path.join(STATE, 'seen.json');
const seen = fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, 'utf8')) : { build: null, hash: {}, changes: [] };
const firstRun = !seen.build;
const today = new Date().toISOString().slice(0, 10);
const added = [], changed = [];
const hashes = {};
records.forEach((record, i) => {
	const hash = Bun.hash(JSON.stringify([record, tooltips[i]])).toString(36);
	hashes[record.id] = hash;
	if (!(record.id in seen.hash)) added.push(record.id);
	else if (seen.hash[record.id] !== hash) changed.push(record.id);
});
const removed = Object.keys(seen.hash).map(Number).filter((id) => !(id in hashes));
if (!firstRun && (added.length || changed.length || removed.length)) {
	seen.changes.unshift({ date: today, build: gd.build, added, changed, removed });
	seen.changes = seen.changes.slice(0, 60);
}
fs.writeFileSync(seenFile, JSON.stringify({ build: gd.build, hash: hashes, changes: seen.changes }));

// Output
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tt'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(records));
for (let i = 0; i < tooltips.length; i += CHUNK) {
	fs.writeFileSync(path.join(OUT, 'tt', `${i / CHUNK}.json`), JSON.stringify(tooltips.slice(i, i + CHUNK)));
}
const classes = {};
for (const [id, name] of builder.className) classes[id] = name;
const subclasses = {};
for (const [key, row] of builder.subclass) subclasses[key] = row.VerboseName_lang || row.DisplayName_lang;
const usedStats = new Set(records.flatMap((r) => Object.keys(r.st ?? {})));
const meta = {
	title: config.site_title,
	product: config.product,
	build: gd.build,
	generated: new Date().toISOString(),
	chunk: CHUNK,
	icons: { names: iconNames, columns: COLUMNS, perSheet, size: SHOWN },
	quality: QUALITY,
	classes,
	subclasses,
	slots: SLOT,
	stats: Object.fromEntries(Object.entries(STAT).filter(([id]) => usedStats.has(id)).map(([id, def]) => [id, def[0]])),
	chrClasses: Object.fromEntries(builder.classes.map((row) => [row.ID, row.Name_lang])),
	chrRaces: Object.fromEntries(builder.races.map((row) => [row.ID, row.Name_lang])),
	sets: builder.sets(),
	unknown: unknown.length,
	changes: seen.changes,
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));

// Items the client knows exist but has never been sent: the addon asks the server for them.
const ranges = [];
for (const id of unknown) {
	const last = ranges[ranges.length - 1];
	if (last && last[1] === id - 1) last[1] = id;
	else ranges.push([id, id]);
}
const addonDir = path.join(ROOT, 'addon', 'ItemHarvest');
fs.mkdirSync(addonDir, { recursive: true });
fs.writeFileSync(path.join(addonDir, 'Missing.lua'), [
	`-- Generated by tools/build.mjs for build ${gd.build}: item IDs whose data only the server has.`,
	'ItemHarvestMissing = {',
	...ranges.map(([from, to]) => `\t{${from},${to}},`),
	'}',
	`ItemHarvestMissingCount = ${unknown.length}`,
	'',
].join('\n'));

const megabytes = (file) => `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`;
console.log(`${records.length} items built (${megabytes(path.join(OUT, 'items.json'))}), ${unknown.length} known only to the server so far`);
if (!firstRun) console.log(`since last build: ${added.length} new, ${changed.length} changed, ${removed.length} removed`);
