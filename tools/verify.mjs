// Development aid: compares the built tooltips with reference tooltips (cache/ah_items.json) and
// prints the most common differences. Usage: bun verify.mjs [show=N] [filter=text]
import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from './lib/load.mjs';
import { ItemBuilder } from './lib/items.mjs';
import { CACHE } from './lib/gamedata.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const config = JSON.parse(fs.readFileSync(path.join(CACHE, '..', '..', 'config.json'), 'utf8'));
const { tables, gameTables } = await loadAll({
	region: config.region,
	product: config.product,
	hotfixFile: path.join(config.wow_path, 'Cache', 'ADB', config.locale ?? 'enUS', 'DBCache.bin'),
	stateDir: path.join(CACHE, '..', '..', 'state'),
	log: () => {},
});
const builder = new ItemBuilder(tables, gameTables);
const ref = JSON.parse(fs.readFileSync(path.join(CACHE, 'ah_items.json'), 'utf8'));
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&');
function refLines(tt) {
	let t = tt.replace(/<div class="whtt-extra whtt-(droppedby|dropchance|maxstack)">.*?<\/div>/g, '');
	t = t.replace(/<div class="whtt-sellprice">.*?<\/div>/g, '');
	t = t.replace(/<span class="q1 whtt-extra whtt-reagents">.*$/s, '');
	t = t.replace(/<\/t[dh]>\s*<t[dh][^>]*>/g, '\t');
	t = t.replace(/<br\s*\/?>|<\/div>|<div[^>]*>|<\/tr>|<table[^>]*>|<\/table>/g, '\n');
	t = decode(t.replace(/<[^>]+>/g, ''));
	return t.split('\n').map((l) => l.replace(/ +/g, ' ').replace(/ ?\t ?/g, '\t').trim()).filter(Boolean).map((l) => l.replace(/\t$/, ''));
}
const kind = (l) => l.replace(/\d+(\.\d+)?/g, '#').slice(0, 60);
let same = 0, total = 0;
const missing = new Map(), extra = new Map(), samples = new Map();
for (const [id, meta] of Object.entries(ref)) {
	if (meta.missing) continue;
	const built = builder.build(Number(id));
	if (!built) continue;
	total++;
	const made = built.lines.find((l) => l[0] === 'item'); const madeBuilt = made && builder.build(made[1]);
	const mine = [built.record.n, ...built.lines.concat(madeBuilt ? [[0, madeBuilt.record.n], ...madeBuilt.lines] : []).filter((l) => l[0] !== 'set' && l[0] !== 'item').flatMap((l) => (l[2] !== undefined ? `${l[1]}\t${l[2]}`.replace(/\t$/, '') : l[1]).split('\n'))].map((l) => l.replace(/ +/g, ' ').trim()).filter(Boolean);
	let theirs = refLines(meta.tt);
	if (built.record.set) { const at = theirs.findIndex((l) => /\(\d+\/\d+\)$/.test(l)); if (at >= 0) { let end = theirs.findIndex((l, i) => i > at && /^"|^Sell|^Use|^Equip/.test(l) && !/Set:/.test(l)); theirs = theirs.slice(0, at).concat(end > 0 ? theirs.slice(end) : []); } }
	const a = new Set(mine), b = new Set(theirs);
	const miss = theirs.filter((l) => !a.has(l)), ext = mine.filter((l) => !b.has(l));
	if (!miss.length && !ext.length) { same++; continue; }
	for (const l of miss) { const k = kind(l); missing.set(k, (missing.get(k) ?? 0) + 1); if (!samples.has('-' + k)) samples.set('-' + k, `${id} ${meta.name}: ${l}`); }
	for (const l of ext) { const k = kind(l); extra.set(k, (extra.get(k) ?? 0) + 1); if (!samples.has('+' + k)) samples.set('+' + k, `${id} ${meta.name}: ${l}`); }
	if (args.filter && [...miss, ...ext].some((l) => l.includes(args.filter)) && (args.n = (args.n ?? 0) + 1) <= 4) console.log(id, meta.name, '\n  REF :', theirs.join(' | '), '\n  MINE:', mine.join(' | '));
}
console.log(`identical ${same} of ${total} (${(100 * same / total).toFixed(1)}%)`);
const top = (m, sign) => [...m].sort((x, y) => y[1] - x[1]).slice(0, Number(args.show ?? 25)).forEach(([k, c]) => console.log(`${sign} ${String(c).padStart(5)}  ${k}   e.g. ${samples.get(sign + k)}`));
console.log('--- in reference, not built'); top(missing, '-');
console.log('--- built, not in reference'); top(extra, '+');
