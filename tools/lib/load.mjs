// Loads every table the item build needs.
//
// Many items are not in the client files at all: the server sends them when the client first asks
// for the item and the client keeps them in its hotfix cache (DBCache.bin). That cache is emptied on
// every patch, so rows learned from it are kept in state/rows/ and merged back in on later builds.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { GameData } from './gamedata.mjs';

export const TABLES = [
	'Item', 'ItemSparse', 'ItemEffect', 'ItemXItemEffect', 'ItemClass', 'ItemSubClass', 'ItemSet', 'ItemSetSpell',
	'ItemNameDescription', 'ItemLimitCategory', 'ItemXBonusTree', 'RandPropPoints', 'ArmorLocation', 'ItemArmorQuality',
	'ItemArmorShield', 'ItemArmorTotal', 'ItemDamageOneHand', 'ItemDamageOneHandCaster', 'ItemDamageTwoHand',
	'ItemDamageTwoHandCaster', 'ItemDamageRanged', 'ItemDamageThrown', 'ItemDamageWand', 'ItemDamageAmmo',
	'Spell', 'SpellName', 'SpellEffect', 'SpellMisc', 'SpellDuration', 'SpellRange', 'SpellRadius',
	'SpellAuraOptions', 'SpellCooldowns', 'SpellLevels', 'SkillLine', 'Faction', 'ChrClasses', 'ChrRaces',
	'ManifestInterfaceData', 'GlobalStrings', 'Map', 'AreaTable',
];
// Tables whose server-sent rows are worth keeping between builds.
const ARCHIVED = ['Item', 'ItemSparse', 'ItemEffect', 'ItemXItemEffect', 'Spell', 'SpellName', 'SpellEffect',
	'SpellMisc', 'SpellAuraOptions', 'SpellCooldowns', 'SpellLevels', 'ItemSet', 'ItemSetSpell', 'ItemXBonusTree'];
export const GAME_TABLES = ['CombatRatings'];

const json = (value) => JSON.stringify(value, (key, v) => (typeof v === 'bigint' ? Number(v) : v));

function readArchive(file) {
	if (!fs.existsSync(file)) return {};
	return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
}

export async function loadAll({ region, product, hotfixFile, stateDir, log = console.log }) {
	const gd = await new GameData(region, product).open();
	log(`${product} ${gd.build}`);

	const base = {};
	for (const name of TABLES) base[name] = await gd.table(name);

	const hotfix = gd.useHotfixes(hotfixFile);
	if (!hotfix) log('no hotfix cache found: using client files and saved server rows only');
	else if (!hotfix.applied) log(`hotfix cache is from build ${hotfix.build}, not ${gd.version.BuildId}: ignored (log in to the game once to refresh it)`);
	else log(`hotfix cache: ${hotfix.entries} entries`);

	const tables = {};
	const rowsDir = path.join(stateDir, 'rows');
	fs.mkdirSync(rowsDir, { recursive: true });
	for (const name of TABLES) {
		const live = hotfix?.applied && ARCHIVED.includes(name) ? await gd.table(name) : base[name];
		if (!ARCHIVED.includes(name)) { tables[name] = live; continue; }

		// Rows the server changed or added, compared with the client files.
		const file = path.join(rowsDir, `${name}.json.gz`);
		const archive = readArchive(file);
		let learned = 0;
		if (hotfix?.applied) {
			for (const [id, row] of live) {
				const text = json(row);
				const original = base[name].get(id);
				if (original && json(original) === text) continue;
				if (archive[id]?.row !== text) { archive[id] = { row: text, build: gd.build }; learned++; }
			}
			if (learned) fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(archive)));
		}
		const merged = new Map(base[name]);
		for (const [id, entry] of Object.entries(archive)) merged.set(Number(id), JSON.parse(entry.row));
		if (hotfix?.applied) for (const [id, row] of live) merged.set(id, row);
		tables[name] = merged;
		const extra = merged.size - base[name].size;
		if (extra || learned) log(`  ${name}: ${base[name].size} in client files, ${extra} more from the server${learned ? ` (${learned} new or changed)` : ''}`);
	}

	const gameTables = {};
	for (const name of GAME_TABLES) gameTables[name] = await gd.gameTable(name);
	return { gd, tables, gameTables };
}
