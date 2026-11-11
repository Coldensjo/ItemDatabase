// Reads World of Warcraft client tables (DB2) for one product straight from Blizzard's CDN, the same
// files the game client installs. Downloads are kept in tools/cache/<build>/ so each is fetched once.
import { CASCClient, WDCReader, DBDParser, ADBReader } from '@rhyster/wow-casc-dbc';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
export const CACHE = path.join(HERE, '..', 'cache');

export class GameData {
	constructor(region, product) {
		this.region = region;
		this.product = product;
		this.client = null;
		this.adb = null;
	}

	async open() {
		this.version = await CASCClient.getProductVersion(this.region, this.product);
		if (!this.version) throw new Error(`no version found for ${this.product} in ${this.region}`);
		this.build = this.version.VersionsName;
		this.dir = path.join(CACHE, this.build);
		fs.mkdirSync(this.dir, { recursive: true });
		return this;
	}

	// DBCache.bin from a game client holds hotfixes: rows changed on the server without a patch.
	// It only applies when it was written by the same build as the tables.
	useHotfixes(file) {
		if (!file || !fs.existsSync(file)) return null;
		const adb = new ADBReader(fs.readFileSync(file));
		if (String(adb.build) !== String(this.version.BuildId)) {
			return { applied: false, build: adb.build, entries: adb.entries.length };
		}
		this.adb = adb;
		return { applied: true, build: adb.build, entries: adb.entries.length };
	}

	async #client() {
		if (!this.client) {
			this.client = new CASCClient(this.region, this.product, this.version, CASCClient.LogLevel.warn);
			await this.client.init();
			await this.client.loadRemoteTACTKeys();
		}
		return this.client;
	}

	// File IDs of every table in this build, by lower case table name.
	async #tableIDs() {
		if (this.ids) return this.ids;
		const file = path.join(this.dir, 'tables.json');
		if (fs.existsSync(file)) return (this.ids = JSON.parse(fs.readFileSync(file, 'utf8')));
		const client = await this.#client();
		await client.loadRemoteListFile();
		const ids = {};
		for (const [name, id] of client.name2FileDataID) {
			if (name.startsWith('dbfilesclient/') && name.endsWith('.db2') && client.getContentKeysByFileDataID(id)) {
				ids[name.slice(14, -4)] = id;
			} else if (name.startsWith('gametables/') && name.endsWith('.txt') && client.getContentKeysByFileDataID(id)) {
				ids['gt:' + name.slice(11, -4)] = id; // tab separated tables, one row per level
			}
		}
		fs.writeFileSync(file, JSON.stringify(ids));
		return (this.ids = ids);
	}

	// Raw bytes of a game file by its file ID (enUS where the file is localized).
	async file(fileDataID, cacheName) {
		const file = path.join(this.dir, cacheName ?? `${fileDataID}.bin`);
		if (fs.existsSync(file)) return fs.readFileSync(file);
		const client = await this.#client();
		const keys = client.getContentKeysByFileDataID(fileDataID);
		if (!keys?.length) return null;
		const key = keys.find((k) => k.localeFlags & CASCClient.LocaleFlags.enUS) ?? keys[0];
		const result = await client.getFileByContentKey(key.cKey, true);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, result.buffer);
		return result.buffer;
	}

	// A game table (GameTables/<name>.txt): rows of numbers, {column: value}, in file order.
	async gameTable(name) {
		const ids = await this.#tableIDs();
		const id = ids['gt:' + name.toLowerCase()];
		if (!id) throw new Error(`game table ${name} is not in build ${this.build}`);
		const text = (await this.file(id, `gt_${name.toLowerCase()}.txt`)).toString('utf8');
		const [head, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
		const columns = head.split('\t');
		return lines.map((line) => {
			const cells = line.split('\t');
			return Object.fromEntries(columns.map((column, i) => [column, Number(cells[i])]));
		});
	}

	// Every row of a table as {column: value}, keyed by row ID.
	async table(name) {
		const ids = await this.#tableIDs();
		const id = ids[name.toLowerCase()];
		if (!id) throw new Error(`table ${name} is not in build ${this.build}`);
		const buffer = await this.file(id, `${name.toLowerCase()}.db2`);
		const reader = new WDCReader(buffer, { detectIsZeroedByData: true, adb: this.adb ?? undefined });
		const parser = await DBDParser.parse(reader);
		const rows = new Map();
		// Rows that only exist as a hotfix (sent by the server, never shipped in the client files) are not
		// in the table's own ID list.
		const rowIDs = new Set(parser.getAllIDs());
		for (const [rowID, hotfix] of reader.hotfixes) {
			if (hotfix.type === 'modify') rowIDs.add(rowID);
		}
		for (const rowID of rowIDs) {
			let row;
			try {
				row = parser.getRowData(rowID);
			} catch {
				continue; // a hotfix record written for another layout
			}
			if (row) rows.set(rowID, row);
		}
		return rows;
	}
}
