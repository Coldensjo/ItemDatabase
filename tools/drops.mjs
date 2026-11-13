// Which creatures and chests drop each item, read from a VMaNGOS world database (the 1.12 loot tables) and
// written to tools/data/drops.json, which the build reads. Loot lives on the server, not in the
// game files, so this is the one part of the site that does not come from the client.
// Usage: bun drops.mjs      The database is set by "drops" in ../config.json; it must be running.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(import.meta.dir, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const db = { host: '127.0.0.1', port: 3307, user: 'root', database: 'mangos', patch: 10, ...config.drops };
const OUT = path.join(ROOT, 'tools', 'data', 'drops.json');
const KEEP = 40; // sources kept per item, the likeliest first

function query(sql) {
	const args = ['-h', db.host, '-P', String(db.port), '-u', db.user, '--skip-ssl-verify-server-cert', '--batch', '--raw', '-N', db.database, '-e', sql];
	if (db.password) args.splice(6, 0, `-p${db.password}`);
	const result = spawnSync('mariadb', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
	if (result.status !== 0) throw new Error(`mariadb: ${result.stderr || result.error}`);
	return result.stdout.split('\n').filter(Boolean).map((line) => line.split('\t'));
}

const atPatch = `${db.patch} between patch_min and patch_max`;
// A row per patch: keep the newest one up to the chosen patch.
const latest = (table) => `select t.* from ${table} t join (select entry, max(patch) patch from ${table} where patch <= ${db.patch} group by entry) n on n.entry = t.entry and n.patch = t.patch`;

function lootTable(table) {
	const entries = new Map();
	for (const [entry, item, chance, group, minOrRef, max] of query(`select entry, item, ChanceOrQuestChance, groupid, mincountOrRef, maxcount from ${table} where ${atPatch}`)) {
		const key = Number(entry);
		if (!entries.has(key)) entries.set(key, []);
		entries.get(key).push({ item: Number(item), chance: Number(chance), group: Number(group), ref: Number(minOrRef) < 0 ? -Number(minOrRef) : 0, max: Number(max) });
	}
	return entries;
}
const creatureLoot = lootTable('creature_loot_template');
const objectLoot = lootTable('gameobject_loot_template');
const referenceLoot = lootTable('reference_loot_template');

// Chance (0 to 1) of each item from one loot entry, following references. The rules are the
// server's: ungrouped rows roll on their own; a group gives at most one item, rows without a
// chance sharing what the others leave; a negative chance is a quest drop. A reference row
// rolls its chance once on its own, its group ignored, then the referenced table max count times.
// scale: chance that this table is reached; rolls: how many times it is rolled.
function expand(rows, scale, rolls, out, depth) {
	if (!rows || depth > 6) return;
	const groups = new Map();
	for (const row of rows) {
		if (row.ref) {
			const chance = row.chance ? Math.abs(row.chance) / 100 : 1;
			expand(referenceLoot.get(row.ref), scale * chance, rolls * Math.max(1, row.max), out, depth + 1);
			continue;
		}
		if (!groups.has(row.group)) groups.set(row.group, []);
		groups.get(row.group).push(row);
	}
	for (const [group, members] of groups) {
		let equal = 1;
		if (group) {
			const fixed = members.filter((row) => row.chance).reduce((sum, row) => sum + Math.abs(row.chance), 0);
			const shared = members.filter((row) => !row.chance).length;
			equal = shared ? Math.max(0, 100 - fixed) / shared / 100 : 0;
		}
		for (const row of members) {
			const once = row.chance ? Math.abs(row.chance) / 100 : group ? equal : 1;
			const chance = (1 - (1 - Math.min(1, once)) ** rolls) * scale;
			const known = out.get(row.item);
			out.set(row.item, { chance: 1 - (1 - (known?.chance ?? 0)) * (1 - chance), quest: (known ? known.quest : true) && row.chance < 0 });
		}
	}
}

const maps = new Map(query(`select entry, map_name from (${latest('map_template')}) m`).map(([id, name]) => [Number(id), name]));
// Sources are creatures by their ID and objects (chests, ore veins, herbs) by minus their ID.
const spawnedOn = new Map(); // source -> set of maps
const spawn = (source, map) => {
	if (!spawnedOn.has(source)) spawnedOn.set(source, new Set());
	spawnedOn.get(source).add(Number(map));
};
for (const [map, ...ids] of query(`select map, id, id2, id3, id4, id5 from creature where ${atPatch}`)) {
	for (const id of ids.map(Number).filter(Boolean)) spawn(id, map);
}
for (const [map, id] of query(`select map, id from gameobject where ${atPatch}`)) spawn(-Number(id), map);

const npcs = {}; // source -> [name, min level, max level, rank, maps]; objects have no level
const items = new Map(); // item -> [source, chance, quest]
function addSource(source, info, lootRows) {
	const loot = new Map();
	expand(lootRows, 1, 1, loot, 0);
	if (!loot.size) return;
	const where = [...(spawnedOn.get(source) ?? [])].map((map) => maps.get(map)).filter(Boolean);
	npcs[source] = [...info, where.join(', ')];
	for (const [item, { chance, quest }] of loot) {
		if (!items.has(item)) items.set(item, []);
		items.get(item).push([source, chance, quest]);
	}
}
for (const [entry, name, low, high, rank, lootID] of query(`select entry, name, level_min, level_max, \`rank\`, loot_id from (${latest('creature_template')}) c where loot_id > 0`)) {
	addSource(Number(entry), [name, Number(low), Number(high), Number(rank)], creatureLoot.get(Number(lootID)));
}
const CHEST = 3;
for (const [entry, name, lootID] of query(`select entry, name, data1 from (${latest('gameobject_template')}) g where type = ${CHEST} and data1 > 0`)) {
	addSource(-Number(entry), [name, 0, 0, 0], objectLoot.get(Number(lootID)));
}

// The likeliest sources of each item, spawned ones first; chances as percentages.
const out = {};
const used = new Set();
for (const [item, sources] of [...items].sort((a, b) => a[0] - b[0])) {
	sources.sort((a, b) => (spawnedOn.has(b[0]) - spawnedOn.has(a[0])) || b[1] - a[1]);
	out[item] = { n: sources.length, s: sources.slice(0, KEEP).map(([id, chance, quest]) => {
		used.add(id);
		const percent = Number((chance * 100).toPrecision(chance < 0.001 ? 1 : 2));
		return quest ? [id, percent, 1] : [id, percent];
	}) };
}
const keptNpcs = Object.fromEntries(Object.entries(npcs).filter(([id]) => used.has(Number(id))));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: 'VMaNGOS', patch: db.patch, generated: new Date().toISOString().slice(0, 10), npcs: keptNpcs, items: out }));
console.log(`${Object.keys(out).length} items dropped by ${Object.keys(keptNpcs).length} creatures and objects (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
