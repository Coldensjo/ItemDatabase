// Item database: loads data/items.json (one record per item) and data/meta.json, filters and sorts
// in the browser, and fetches tooltip lines in chunks when an item is hovered or opened.
(() => {
	'use strict';

	const $ = (id) => document.getElementById(id);
	const el = (tag, cls, text) => {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const ROW = 38;

	let ITEMS = [];
	let META = null;
	const byID = new Map(); // item id -> position in ITEMS
	const chunks = new Map(); // chunk number -> promise of tooltip lines

	// Filters. Everything here is written to the address bar, so a view can be shared.
	const blank = () => ({
		q: '', quality: new Set(), cls: null, sub: new Set(), slot: new Set(),
		il: [null, null], rl: [null, null], usable: 0, bind: '', flags: new Set(),
		rules: [], change: '', sort: 'il', dir: -1, item: 0, cols: null,
	});
	let state = blank();
	let results = [];

	// ---- Fields -------------------------------------------------------------------------------

	// Numeric fields usable in conditions, as columns and in the search box. Stats are added on load.
	const FIELDS = {
		id: { label: 'Item ID', get: (r) => r.id },
		il: { label: 'Item level', short: 'iLvl', get: (r) => r.il },
		rl: { label: 'Required level', short: 'Req', get: (r) => r.rl },
		dps: { label: 'Damage per second', short: 'DPS', get: (r) => r.dps || 0, decimals: 2 },
		sp: { label: 'Speed', get: (r) => r.sp || 0, decimals: 2 },
		d1: { label: 'Minimum damage', short: 'Min dmg', get: (r) => r.d1 || 0 },
		d2: { label: 'Maximum damage', short: 'Max dmg', get: (r) => r.d2 || 0 },
		a: { label: 'Armor', get: (r) => r.a || 0 },
		bl: { label: 'Block', get: (r) => r.bl || 0 },
		du: { label: 'Durability', short: 'Dur', get: (r) => r.du || 0 },
		slots: { label: 'Bag slots', short: 'Slots', get: (r) => r.slots || 0 },
		stk: { label: 'Stack size', short: 'Stack', get: (r) => r.stk || 1 },
		sell: { label: 'Sell price', short: 'Sell', get: (r) => r.sell || 0, money: true },
		buy: { label: 'Buy price', short: 'Buy', get: (r) => r.buy || 0, money: true },
		skr: { label: 'Required skill rank', short: 'Skill', get: (r) => r.skr || 0 },
		nfx: { label: 'Number of effects', short: 'Effects', get: (r) => (r.fx ? r.fx.length : 0) },
	};
	// Words accepted in the search box for a field.
	const ALIAS = {
		id: 'id', ilvl: 'il', itemlevel: 'il', level: 'rl', lvl: 'rl', req: 'rl', reqlevel: 'rl', dps: 'dps', speed: 'sp',
		mindmg: 'd1', maxdmg: 'd2', armor: 'a', block: 'bl', durability: 'du', dur: 'du', slots: 'slots', stack: 'stk',
		sell: 'sell', buy: 'buy', skill: 'skr', effects: 'nfx',
		agi: 'st3', agility: 'st3', str: 'st4', strength: 'st4', int: 'st5', intellect: 'st5', spi: 'st6', spirit: 'st6',
		sta: 'st7', stam: 'st7', stamina: 'st7', mana: 'st0', health: 'st1', hp: 'st1', def: 'st12', defense: 'st12',
		dodge: 'st13', parry: 'st14', blockchance: 'st15', hit: 'st31', crit: 'st32', haste: 'st36', expertise: 'st37',
		ap: 'st38', attackpower: 'st38', rap: 'st39', heal: 'st41', healing: 'st41', spelldmg: 'st42', mp5: 'st43',
		arp: 'st44', sp: 'st45', spellpower: 'st45', hp5: 'st46', spen: 'st47', blockvalue: 'st48', bonusarmor: 'st50',
		fire: 'st51', fireres: 'st51', frost: 'st52', frostres: 'st52', holyres: 'st53', shadow: 'st54', shadowres: 'st54',
		nature: 'st55', natureres: 'st55', arcane: 'st56', arcaneres: 'st56', allres: 'st124', weapondmg: 'st83',
	};
	const FLAGS = {
		unique: ['Unique', (r) => r.u === 1 || r.ue === 1],
		set: ['Part of a set', (r) => !!r.set],
		random: ['Random enchantment', (r) => !!r.re],
		use: ['Use effect', (r) => !!r.fx && r.fx.some((t) => t.startsWith('Use:'))],
		equip: ['Equip effect', (r) => !!r.fx && r.fx.some((t) => t.startsWith('Equip:'))],
		proc: ['Chance on hit', (r) => !!r.fx && r.fx.some((t) => t.startsWith('Chance on hit:'))],
		quest: ['Starts a quest', (r) => !!r.quest],
		reagent: ['Crafting reagent', (r) => !!r.rg],
		conjured: ['Conjured', (r) => !!r.conj],
		classonly: ['Class restricted', (r) => !!r.cm],
		raceonly: ['Race restricted', (r) => !!r.rm],
		rep: ['Requires reputation', (r) => !!r.fa],
		profession: ['Requires a skill', (r) => !!r.sk],
		recipe: ['Teaches a recipe', (r) => !!r.mk],
		readable: ['Readable', (r) => !!r.read],
		openable: ['Openable', (r) => !!r.open],
		locked: ['Locked', (r) => !!r.lock],
		timed: ['Limited duration', (r) => !!r.dur],
		vendor: ['Sold by vendors (has a buy price)', (r) => !!r.buy],
		nosell: ['No sell price', (r) => !r.sell],
		nojunk: ['Hide test and unused items', (r) => !JUNK.test(r.n)],
	};
	// Names the developers give to items that are not meant to be seen.
	const JUNK = /\[PH\]|TEST|^Test |\(Test\)|Deprecated|DEPRECATED|^OLD|^zz|DEBUG|^Monster - |UNUSED|^QA|\(old\d*\)|^\[|DND|DNT|NYI/;
	const DEFAULT_COLUMNS = ['il', 'rl', 'slot', 'type'];

	const className = (r) => META.classes[r.c] || '';
	const subName = (r) => META.subclasses[`${r.c}:${r.s}`] || '';
	const slotName = (r) => META.slots[r.v] || '';
	const TEXT_COLUMNS = {
		slot: { label: 'Slot', get: slotName },
		type: { label: 'Type', get: (r) => subName(r) || className(r) },
		cls: { label: 'Category', get: className },
		src: { label: 'Requires', get: (r) => [r.sk && `${r.sk}${r.skr ? ` (${r.skr})` : ''}`, r.fa].filter(Boolean).join(', ') },
	};

	// ---- Formatting ---------------------------------------------------------------------------

	function money(copper) {
		const span = el('span', 'money');
		if (!copper) return span;
		const parts = [[Math.floor(copper / 10000), 'g'], [Math.floor(copper / 100) % 100, 's'], [copper % 100, 'c']];
		for (const [amount, unit] of parts) {
			if (!amount) continue;
			const part = el('i', unit, `${amount}${unit} `);
			span.append(part);
		}
		return span;
	}

	function icon(index, size) {
		const node = el('span', 'icon');
		const { columns, perSheet, size: cell } = META.icons;
		const sheet = Math.floor(index / perSheet), at = index % perSheet;
		const scale = size / cell;
		node.style.width = node.style.height = `${size}px`;
		node.style.backgroundImage = `url(icons/sheet${sheet}.jpg)`;
		node.style.backgroundSize = `${columns * cell * scale}px auto`;
		node.style.backgroundPosition = `-${(at % columns) * size}px -${Math.floor(at / columns) * size}px`;
		return node;
	}

	function formatField(key, r) {
		const field = FIELDS[key];
		const value = field.get(r);
		if (!value) return '';
		if (field.money) return money(value);
		return field.decimals ? value.toFixed(field.decimals) : String(value);
	}

	// ---- Search box syntax --------------------------------------------------------------------

	// "sword ilvl>=40 agi>10 q:rare is:set "chance on hit"" -> list of tests
	function parseQuery(text) {
		const tests = [];
		const tokens = text.match(/"[^"]*"|\S+/g) || [];
		for (const raw of tokens) {
			if (raw.startsWith('"')) {
				const phrase = raw.replace(/"/g, '').toLowerCase();
				if (phrase) tests.push((r) => searchText(r).includes(phrase));
				continue;
			}
			const m = /^(-?)([a-z0-9]+)(>=|<=|!=|=|>|<|:)(.+)$/i.exec(raw);
			if (m) {
				const [, not, word, op, valueText] = m;
				const test = fieldTest(word.toLowerCase(), op, valueText.toLowerCase());
				if (test) {
					tests.push(not ? (r) => !test(r) : test);
					continue;
				}
			}
			const negative = raw.startsWith('-') && raw.length > 1;
			const term = (negative ? raw.slice(1) : raw).toLowerCase();
			tests.push(negative ? (r) => !r._n.includes(term) : (r) => r._n.includes(term));
		}
		return tests;
	}

	function compare(op, a, b) {
		switch (op) {
			case '>': return a > b;
			case '<': return a < b;
			case '>=': return a >= b;
			case '<=': return a <= b;
			case '!=': return a !== b;
			default: return a === b;
		}
	}

	function fieldTest(word, op, valueText) {
		const names = (map, want) => Object.entries(map).filter(([, name]) => String(name).toLowerCase().includes(want)).map(([id]) => id);
		if (word === 'q' || word === 'quality') {
			let quality = Number(valueText);
			if (Number.isNaN(quality)) quality = META.quality.findIndex((name) => name.toLowerCase().startsWith(valueText));
			if (quality < 0) return null;
			return (r) => compare(op === ':' ? '=' : op, r.q, quality);
		}
		if (word === 'slot') { const ids = new Set(names(META.slots, valueText).map(Number)); return (r) => ids.has(r.v); }
		if (word === 'type') {
			const subs = new Set(names(META.subclasses, valueText));
			const classes = new Set(names(META.classes, valueText).map(Number));
			return (r) => subs.has(`${r.c}:${r.s}`) || classes.has(r.c);
		}
		if (word === 'class') {
			const id = Number(names(META.chrClasses, valueText)[0]);
			if (!id) return null;
			return (r) => !r.cm || (r.cm & (1 << (id - 1))) !== 0;
		}
		if (word === 'is' || word === 'has') {
			if (valueText === 'boe') return (r) => r.b === 2;
			if (valueText === 'bop') return (r) => r.b === 1;
			if (FLAGS[valueText]) return FLAGS[valueText][1];
			const key = ALIAS[valueText];
			return key ? (r) => !!FIELDS[key].get(r) : null;
		}
		if (word === 'set') {
			const ids = new Set(Object.entries(META.sets).filter(([, set]) => set.n.toLowerCase().includes(valueText)).map(([id]) => Number(id)));
			return (r) => ids.has(r.set);
		}
		if (word === 'text') return (r) => searchText(r).includes(valueText);
		const key = ALIAS[word] || (FIELDS[word] ? word : null);
		if (!key) return null;
		const number = Number(valueText);
		if (Number.isNaN(number)) return null;
		const get = FIELDS[key].get;
		return (r) => compare(op === ':' ? '=' : op, get(r), number);
	}

	// Name plus everything written on the tooltip that is kept in the record.
	function searchText(r) {
		if (r._t === undefined) r._t = [r.n, r.de, ...(r.fx || []), r.nd, r.sk, r.fa, r.ab].filter(Boolean).join('\n').toLowerCase();
		return r._t;
	}

	// ---- Filtering ----------------------------------------------------------------------------

	function applyFilters() {
		const tests = parseQuery(state.q);
		const s = state;
		if (s.quality.size) tests.push((r) => s.quality.has(r.q));
		if (s.cls !== null) tests.push((r) => r.c === s.cls);
		if (s.sub.size) tests.push((r) => s.sub.has(r.s));
		if (s.slot.size) tests.push((r) => s.slot.has(r.v));
		if (s.il[0] !== null) tests.push((r) => r.il >= s.il[0]);
		if (s.il[1] !== null) tests.push((r) => r.il <= s.il[1]);
		if (s.rl[0] !== null) tests.push((r) => r.rl >= s.rl[0]);
		if (s.rl[1] !== null) tests.push((r) => r.rl <= s.rl[1]);
		if (s.usable) tests.push((r) => !r.cm || (r.cm & (1 << (s.usable - 1))) !== 0);
		if (s.bind !== '') { const bind = Number(s.bind); tests.push((r) => (bind === 4 ? r.b >= 4 : r.b === bind)); }
		for (const flag of s.flags) if (FLAGS[flag]) tests.push(FLAGS[flag][1]);
		for (const rule of s.rules) {
			const field = FIELDS[rule.f];
			if (!field || rule.v === '' || rule.v === null) continue;
			const value = Number(rule.v);
			tests.push((r) => compare(rule.op, field.get(r), value));
		}
		if (s.change) {
			const change = META.changes[Number(s.change)];
			if (change) { const ids = new Set([...change.added, ...change.changed]); tests.push((r) => ids.has(r.id)); }
		}

		results = ITEMS.filter((r) => tests.every((test) => test(r)));
		sortResults();
		$('count').innerHTML = `<b>${results.length.toLocaleString()}</b> of ${ITEMS.length.toLocaleString()} items`;
		$('viewport').scrollTop = 0;
		renderHead();
		renderRows(true);
		writeHash();
	}

	function sortResults() {
		const key = state.sort, dir = state.dir;
		let get;
		if (key === 'name') get = (r) => r._n;
		else if (key === 'q') get = (r) => r.q;
		else if (TEXT_COLUMNS[key]) get = TEXT_COLUMNS[key].get;
		else get = (FIELDS[key] || FIELDS.il).get;
		results.sort((a, b) => {
			const x = get(a), y = get(b);
			if (x < y) return -dir;
			if (x > y) return dir;
			return b.q - a.q || a.id - b.id;
		});
	}

	// ---- List ---------------------------------------------------------------------------------

	function columns() {
		if (state.cols) return state.cols;
		// Fields being filtered on are shown without being asked for.
		const extra = state.rules.map((rule) => rule.f).filter((f) => FIELDS[f]);
		if (FIELDS[state.sort]) extra.push(state.sort);
		return [...new Set([...DEFAULT_COLUMNS, ...extra])];
	}

	function columnLabel(key) {
		if (TEXT_COLUMNS[key]) return TEXT_COLUMNS[key].label;
		return FIELDS[key].short || FIELDS[key].label;
	}

	function renderHead() {
		const head = $('head');
		head.textContent = '';
		const add = (key, label, cls) => {
			const cell = el('div', `cell ${cls}${state.sort === key ? ' sorted' : ''}`, label + (state.sort === key ? (state.dir > 0 ? ' ▲' : ' ▼') : ''));
			cell.title = `Sort by ${label}`;
			cell.onclick = () => {
				if (state.sort === key) state.dir = -state.dir;
				else { state.sort = key; state.dir = key === 'name' || TEXT_COLUMNS[key] ? 1 : -1; }
				sortResults();
				renderHead();
				renderRows(true);
				writeHash();
			};
			head.append(cell);
		};
		add('name', 'Name', 'name');
		for (const key of columns()) add(key, columnLabel(key), TEXT_COLUMNS[key] ? 'text hide-small' : '');
	}

	let rendered = new Map(); // result index -> row element

	function renderRows(reset) {
		const viewport = $('viewport'), spacer = $('spacer');
		if (reset) { spacer.textContent = ''; rendered = new Map(); }
		spacer.style.height = `${results.length * ROW}px`;
		if (!results.length) {
			spacer.style.height = 'auto';
			spacer.append(el('div', 'empty', 'No items match these filters.'));
			return;
		}
		const first = Math.max(0, Math.floor(viewport.scrollTop / ROW) - 8);
		const last = Math.min(results.length, Math.ceil((viewport.scrollTop + viewport.clientHeight) / ROW) + 8);
		for (const [index, row] of rendered) {
			if (index < first || index >= last) { row.remove(); rendered.delete(index); }
		}
		const cols = columns();
		for (let index = first; index < last; index++) {
			if (rendered.has(index)) continue;
			const r = results[index];
			const row = el('div', `row${r.id === state.item ? ' selected' : ''}`);
			row.style.top = `${index * ROW}px`;
			row.dataset.id = r.id;
			const name = el('div', 'cell name');
			name.append(icon(r.i, 28), el('span', `q${r.q}`, r.n));
			row.append(name);
			for (const key of cols) {
				const cell = el('div', TEXT_COLUMNS[key] ? 'cell text hide-small' : 'cell');
				const value = TEXT_COLUMNS[key] ? TEXT_COLUMNS[key].get(r) : formatField(key, r);
				cell.append(value);
				row.append(cell);
			}
			spacer.append(row);
			rendered.set(index, row);
		}
	}

	// ---- Tooltips -----------------------------------------------------------------------------

	function tooltipLines(id) {
		const position = byID.get(id);
		if (position === undefined) return Promise.resolve(null);
		const chunk = Math.floor(position / META.chunk);
		if (!chunks.has(chunk)) {
			chunks.set(chunk, fetch(`data/tt/${chunk}.json`).then((response) => response.json()));
		}
		return chunks.get(chunk).then((lines) => lines[position % META.chunk]);
	}

	async function buildTooltip(id, nested) {
		const r = ITEMS[byID.get(id)];
		const box = el('div', nested ? 'nested' : 'tooltip');
		if (!r) return box;
		box.append(el('div', `tt-name q${r.q}`, r.n));
		const lines = (await tooltipLines(id)) || [];
		const made = [];
		for (const line of lines) {
			if (line[0] === 'set') { appendSet(box, line[1]); continue; }
			if (line[0] === 'item') { made.push(line[1]); continue; }
			const row = el('div', `line s${line[0]}`);
			row.append(el('span', '', line[1]));
			if (line[2]) row.append(el('span', '', line[2]));
			box.append(row);
		}
		if (r.sell && !nested) {
			const row = el('div', 'line');
			const left = el('span', '', 'Sell Price: ');
			left.append(money(r.sell));
			row.append(left);
			box.append(row);
		}
		// A recipe ends with the item it creates.
		if (!nested) for (const other of made) box.append(await buildTooltip(other, true));
		return box;
	}

	function appendSet(box, setID) {
		const set = META.sets[setID];
		if (!set) return;
		box.append(el('div', 'gap'));
		box.append(el('div', 'line s3', `${set.n} (0/${set.items.length})`));
		for (const itemID of set.items) {
			const member = ITEMS[byID.get(itemID)];
			box.append(el('div', 'line s2', `  ${member ? member.n : `Item ${itemID}`}`));
		}
		if (set.bonuses.length) box.append(el('div', 'gap'));
		for (const [count, text] of set.bonuses) box.append(el('div', 'line s2', `(${count}) Set: ${text}`));
	}

	let hoverID = 0;
	async function showTip(id, x, y) {
		hoverID = id;
		const tip = $('tip');
		const content = await buildTooltip(id);
		if (hoverID !== id) return;
		tip.textContent = '';
		tip.append(...content.childNodes);
		tip.hidden = false;
		moveTip(x, y);
	}

	function moveTip(x, y) {
		const tip = $('tip');
		if (tip.hidden) return;
		const box = tip.getBoundingClientRect();
		let left = x + 18, top = y + 14;
		if (left + box.width > innerWidth - 8) left = x - box.width - 18;
		if (top + box.height > innerHeight - 8) top = Math.max(8, innerHeight - box.height - 8);
		tip.style.left = `${Math.max(8, left)}px`;
		tip.style.top = `${top}px`;
	}

	function hideTip() {
		hoverID = 0;
		$('tip').hidden = true;
	}

	// ---- Detail panel -------------------------------------------------------------------------

	async function openDetail(id) {
		const r = ITEMS[byID.get(id)];
		const panel = $('detail');
		if (!r) { panel.hidden = true; state.item = 0; writeHash(); return; }
		state.item = id;
		panel.textContent = '';
		panel.hidden = false;
		const head = el('div', 'detail-head');
		head.append(icon(r.i, 44), el('h2', `q${r.q}`, r.n));
		const close = el('button', 'ghost', '✕');
		close.onclick = () => { panel.hidden = true; state.item = 0; writeHash(); renderRows(true); };
		head.append(close);
		panel.append(head, await buildTooltip(id));

		const actions = el('div', 'actions');
		const link = el('button', 'ghost', 'Copy link to item');
		link.onclick = () => copy(`${location.origin}${location.pathname}#item=${id}`, link);
		const copyID = el('button', 'ghost', `Copy ID ${id}`);
		copyID.onclick = () => copy(String(id), copyID);
		actions.append(link, copyID);
		if (r.set) {
			const same = el('button', 'ghost', 'Show whole set');
			same.onclick = () => { const item = state.item; state = blank(); state.item = item; state.q = `set:${META.sets[r.set].n.toLowerCase().split(' ').pop()}`; syncControls(); applyFilters(); };
			actions.append(same);
		}
		if (r.mk && byID.has(r.mk)) {
			const made = el('button', 'ghost', 'Open created item');
			made.onclick = () => openDetail(r.mk);
			actions.append(made);
		}
		panel.append(actions);

		const table = el('table');
		const row = (label, value) => {
			if (value === undefined || value === '' || value === null || value === 0) return;
			const tr = el('tr');
			const cell = el('td');
			cell.append(value);
			tr.append(el('td', '', label), cell);
			table.append(tr);
		};
		row('Item ID', String(r.id));
		row('Quality', META.quality[r.q]);
		row('Category', className(r));
		row('Type', subName(r));
		row('Slot', slotName(r));
		for (const key of ['il', 'rl', 'd1', 'd2', 'sp', 'dps', 'a', 'bl', 'du', 'slots', 'stk', 'sell', 'buy']) row(FIELDS[key].label, formatField(key, r));
		for (const [stat, value] of Object.entries(r.st || {})) row(META.stats[stat] || `Stat ${stat}`, String(value));
		row('Unique', r.u ? String(r.u) : r.ue ? 'Equipped' : '');
		row('Required skill', r.sk ? `${r.sk}${r.skr ? ` (${r.skr})` : ''}` : '');
		row('Required reputation', r.fa);
		row('Required ability', r.ab);
		row('Set', r.set ? META.sets[r.set].n : '');
		row('Duration', r.dur ? `${r.dur} sec` : '');
		row('Icon', META.icons.names[r.i]);
		row('Flags', r.f.map((flag) => `0x${(flag >>> 0).toString(16)}`).join(' '));
		const change = META.changes.find((c) => c.added.includes(id) || c.changed.includes(id));
		row('Last update', change ? `${change.added.includes(id) ? 'Added' : 'Changed'} ${change.date} (build ${change.build})` : '');
		panel.append(table);
		renderRows(true);
		writeHash();
	}

	function copy(text, button) {
		navigator.clipboard.writeText(text).then(() => {
			const old = button.textContent;
			button.textContent = 'Copied';
			setTimeout(() => { button.textContent = old; }, 1200);
		});
	}

	// ---- Address bar --------------------------------------------------------------------------

	function writeHash() {
		const s = state, p = new URLSearchParams();
		if (s.q) p.set('q', s.q);
		if (s.quality.size) p.set('ql', [...s.quality].join('.'));
		if (s.cls !== null) p.set('c', s.cls);
		if (s.sub.size) p.set('s', [...s.sub].join('.'));
		if (s.slot.size) p.set('v', [...s.slot].join('.'));
		if (s.il[0] !== null || s.il[1] !== null) p.set('il', `${s.il[0] ?? ''}-${s.il[1] ?? ''}`);
		if (s.rl[0] !== null || s.rl[1] !== null) p.set('rl', `${s.rl[0] ?? ''}-${s.rl[1] ?? ''}`);
		if (s.usable) p.set('u', s.usable);
		if (s.bind !== '') p.set('b', s.bind);
		if (s.flags.size) p.set('fl', [...s.flags].join('.'));
		const rules = s.rules.filter((rule) => rule.v !== '' && rule.v !== null);
		if (rules.length) p.set('r', rules.map((rule) => `${rule.f}${rule.op}${rule.v}`).join(';'));
		if (s.change) p.set('ch', s.change);
		if (s.sort !== 'il' || s.dir !== -1) p.set('sort', `${s.sort}${s.dir > 0 ? '+' : '-'}`);
		if (s.cols) p.set('cols', s.cols.join('.'));
		if (s.item) p.set('item', s.item);
		const hash = p.toString();
		history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
	}

	function readHash() {
		const p = new URLSearchParams(location.hash.slice(1));
		const s = blank();
		const list = (key) => (p.get(key) ? p.get(key).split('.') : []);
		const range = (key) => {
			const m = /^(\d*)-(\d*)$/.exec(p.get(key) || '');
			return m ? [m[1] === '' ? null : Number(m[1]), m[2] === '' ? null : Number(m[2])] : [null, null];
		};
		s.q = p.get('q') || '';
		s.quality = new Set(list('ql').map(Number));
		s.cls = p.has('c') ? Number(p.get('c')) : null;
		s.sub = new Set(list('s').map(Number));
		s.slot = new Set(list('v').map(Number));
		s.il = range('il');
		s.rl = range('rl');
		s.usable = Number(p.get('u')) || 0;
		s.bind = p.get('b') ?? '';
		s.flags = new Set(list('fl').filter((flag) => FLAGS[flag]));
		for (const text of (p.get('r') || '').split(';')) {
			const m = /^(\w+?)(>=|<=|!=|=|>|<)(-?[\d.]+)$/.exec(text);
			if (m && FIELDS[m[1]]) s.rules.push({ f: m[1], op: m[2], v: m[3] });
		}
		s.change = p.get('ch') || '';
		const sort = /^(\w+)([+-])$/.exec(p.get('sort') || '');
		if (sort) { s.sort = sort[1]; s.dir = sort[2] === '+' ? 1 : -1; }
		const cols = list('cols').filter((key) => FIELDS[key] || TEXT_COLUMNS[key]);
		if (cols.length) s.cols = cols;
		s.item = Number(p.get('item')) || 0;
		state = s;
	}

	// ---- Controls -----------------------------------------------------------------------------

	function chip(container, label, cls, isOn, toggle) {
		const node = el('span', `chip ${cls}${isOn() ? ' on' : ''}`, label);
		node.onclick = () => { toggle(); node.classList.toggle('on', isOn()); applyFilters(); };
		container.append(node);
	}

	function toggleIn(set, value) {
		if (set.has(value)) set.delete(value);
		else set.add(value);
	}

	function buildControls() {
		const quality = $('f-quality');
		quality.textContent = '';
		const present = new Set(ITEMS.map((r) => r.q));
		META.quality.forEach((name, q) => {
			if (present.has(q)) chip(quality, name, `q${q}`, () => state.quality.has(q), () => toggleIn(state.quality, q));
		});

		const slots = $('f-slot');
		slots.textContent = '';
		const names = new Map();
		for (const r of ITEMS) if (r.v && META.slots[r.v]) names.set(r.v, META.slots[r.v]);
		for (const [id, name] of [...names].sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0])) {
			// Two slot IDs can share a name (Chest and Robe); one chip covers both.
			if ([...names].some(([other, otherName]) => otherName === name && other < id)) continue;
			const ids = [...names].filter(([, otherName]) => otherName === name).map(([other]) => other);
			chip(slots, name, '', () => state.slot.has(id), () => ids.forEach((other) => toggleIn(state.slot, other)));
		}

		const flags = $('f-flags');
		flags.textContent = '';
		for (const [key, [label]] of Object.entries(FLAGS)) chip(flags, label, '', () => state.flags.has(key), () => toggleIn(state.flags, key));

		const usable = $('f-usable');
		usable.innerHTML = '<option value="0">Any class</option>';
		for (const [id, name] of Object.entries(META.chrClasses)) usable.append(new Option(name, id));
		usable.value = String(state.usable);
		usable.onchange = () => { state.usable = Number(usable.value); applyFilters(); };

		$('f-bind').value = state.bind;
		$('f-bind').onchange = () => { state.bind = $('f-bind').value; applyFilters(); };

		for (const [key, index, id] of [['il', 0, 'f-il-min'], ['il', 1, 'f-il-max'], ['rl', 0, 'f-rl-min'], ['rl', 1, 'f-rl-max']]) {
			const input = $(id);
			input.value = state[key][index] ?? '';
			input.oninput = () => { state[key][index] = input.value === '' ? null : Number(input.value); applyFilters(); };
		}

		const change = $('f-change');
		$('changes-section').hidden = !META.changes.length;
		change.innerHTML = '<option value="">All items</option>';
		META.changes.forEach((c, i) => change.append(new Option(`${c.date}: ${c.added.length} new, ${c.changed.length} changed`, String(i))));
		change.value = state.change;
		change.onchange = () => { state.change = change.value; applyFilters(); };

		buildTree();
		buildRules();
	}

	function buildTree() {
		const tree = $('f-class');
		tree.textContent = '';
		const counts = new Map(), subCounts = new Map();
		for (const r of ITEMS) {
			counts.set(r.c, (counts.get(r.c) || 0) + 1);
			const key = `${r.c}:${r.s}`;
			subCounts.set(key, (subCounts.get(key) || 0) + 1);
		}
		const line = (label, count, cls, on, click) => {
			const node = el('div', `${cls}${on ? ' on' : ''}`);
			node.append(el('span', '', label), el('small', '', count.toLocaleString()));
			node.onclick = click;
			tree.append(node);
		};
		line('All items', ITEMS.length, '', state.cls === null, () => { state.cls = null; state.sub.clear(); buildTree(); applyFilters(); });
		for (const [id, count] of [...counts].sort((a, b) => (META.classes[a[0]] || '').localeCompare(META.classes[b[0]] || ''))) {
			line(META.classes[id] || `Class ${id}`, count, '', state.cls === id && !state.sub.size, () => {
				state.cls = state.cls === id && !state.sub.size ? null : id;
				state.sub.clear();
				buildTree();
				applyFilters();
			});
			if (state.cls !== id) continue;
			const subs = [...subCounts].filter(([key]) => key.startsWith(`${id}:`)).map(([key, n]) => [Number(key.split(':')[1]), n]);
			if (subs.length < 2) continue;
			for (const [sub, n] of subs.sort((a, b) => (META.subclasses[`${id}:${a[0]}`] || '').localeCompare(META.subclasses[`${id}:${b[0]}`] || ''))) {
				line(META.subclasses[`${id}:${sub}`] || `Type ${sub}`, n, 'sub', state.sub.has(sub), () => { toggleIn(state.sub, sub); buildTree(); applyFilters(); });
			}
		}
	}

	function fieldOptions(select, value) {
		const general = el('optgroup'); general.label = 'Values';
		const stats = el('optgroup'); stats.label = 'Stats';
		for (const [key, field] of Object.entries(FIELDS)) (key.startsWith('st') && key !== 'stk' ? stats : general).append(new Option(field.label, key));
		select.append(stats, general);
		select.value = value;
	}

	function buildRules() {
		const box = $('f-rules');
		box.textContent = '';
		state.rules.forEach((rule, index) => {
			const row = el('div', 'rule');
			const field = el('select');
			fieldOptions(field, rule.f);
			const op = el('select');
			for (const symbol of ['>=', '<=', '=', '!=', '>', '<']) op.append(new Option(symbol, symbol));
			op.value = rule.op;
			const value = el('input');
			value.type = 'number';
			value.step = 'any';
			value.placeholder = 'value';
			value.value = rule.v;
			const remove = el('button', 'ghost', '✕');
			field.onchange = () => { rule.f = field.value; applyFilters(); };
			op.onchange = () => { rule.op = op.value; applyFilters(); };
			value.oninput = () => { rule.v = value.value; applyFilters(); };
			remove.onclick = () => { state.rules.splice(index, 1); buildRules(); applyFilters(); };
			row.append(field, op, value, remove);
			box.append(row);
		});
	}

	function buildColumnsMenu() {
		const menu = $('columns-menu');
		menu.textContent = '';
		const active = new Set(columns());
		const keys = [...Object.keys(TEXT_COLUMNS), ...Object.keys(FIELDS)];
		for (const key of keys) {
			const label = el('label');
			const box = el('input');
			box.type = 'checkbox';
			box.checked = active.has(key);
			box.onchange = () => {
				const now = new Set(columns());
				if (box.checked) now.add(key); else now.delete(key);
				state.cols = keys.filter((k) => now.has(k));
				renderHead();
				renderRows(true);
				writeHash();
			};
			label.append(box, ` ${TEXT_COLUMNS[key] ? TEXT_COLUMNS[key].label : FIELDS[key].label}`);
			menu.append(label);
		}
	}

	function syncControls() {
		$('query').value = state.q;
		buildControls();
	}

	function buildHelp() {
		$('help').innerHTML = `
			<h3>Search syntax</h3>
			<p>Words match the item name. Everything can be combined; put <code>-</code> in front to exclude.</p>
			<table>
				<tr><td><code>thunder blade</code></td><td>name contains both words</td></tr>
				<tr><td><code>"chance on hit"</code></td><td>text anywhere on the tooltip (effects, description)</td></tr>
				<tr><td><code>ilvl>=60 level&lt;=40</code></td><td>item level, required level</td></tr>
				<tr><td><code>agi>10 sta>=15 crit>0</code></td><td>stats: agi str int spi sta ap rap sp heal spelldmg mp5 hp5 hit crit dodge parry def haste expertise fireres frostres natureres shadowres arcaneres allres</td></tr>
				<tr><td><code>dps>40 speed&lt;=1.8 armor>300</code></td><td>also block, durability, slots, stack, sell, buy (copper), mindmg, maxdmg, id</td></tr>
				<tr><td><code>q:epic</code> <code>q>=3</code></td><td>quality by name or number (0 poor to 5 legendary)</td></tr>
				<tr><td><code>slot:head type:sword</code></td><td>equipment slot, item type or category</td></tr>
				<tr><td><code>class:hunter</code></td><td>usable by that class</td></tr>
				<tr><td><code>is:boe is:bop is:set is:unique is:random</code></td><td>also use, equip, proc, quest, reagent, recipe, vendor, conjured</td></tr>
				<tr><td><code>has:fireres</code></td><td>has any amount of a stat or value</td></tr>
				<tr><td><code>set:gladiator</code></td><td>items of a set</td></tr>
			</table>
			<p>Click a column header to sort. Use "Stats and values" on the left for the same conditions without typing.</p>`;
	}

	// ---- Start --------------------------------------------------------------------------------

	async function start() {
		const [items, meta] = await Promise.all([
			fetch('data/items.json').then((response) => response.json()),
			fetch('data/meta.json').then((response) => response.json()),
		]);
		ITEMS = items;
		META = meta;
		ITEMS.forEach((r, i) => { byID.set(r.id, i); r._n = r.n.toLowerCase(); });
		for (const [id, name] of Object.entries(META.stats)) {
			FIELDS[`st${id}`] = { label: name, get: (r) => (r.st && r.st[id]) || 0, decimals: name.endsWith('%') ? 1 : 0 };
			ALIAS[name.toLowerCase().replace(/[^a-z0-9]/g, '')] = `st${id}`;
		}

		document.title = META.title;
		$('site-title').textContent = META.title;
		const date = new Date(META.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
		$('build-info').textContent = `Game build ${META.build} · updated ${date}`;
		$('foot-info').textContent = `${ITEMS.length.toLocaleString()} items read from the game files${META.unknown ? `; ${META.unknown.toLocaleString()} more exist but have not been sent by the server yet` : ''}. `;

		readHash();
		buildHelp();
		syncControls();
		applyFilters();
		if (state.item) openDetail(state.item);

		let timer;
		$('query').oninput = () => {
			clearTimeout(timer);
			timer = setTimeout(() => { state.q = $('query').value.trim(); applyFilters(); }, 120);
		};
		$('add-rule').onclick = () => { state.rules.push({ f: 'st7', op: '>=', v: '' }); buildRules(); };
		$('reset').onclick = () => { const item = state.item; state = blank(); state.item = item; syncControls(); applyFilters(); };
		$('share').onclick = () => copy(location.href, $('share'));
		$('menu').onclick = () => $('sidebar').classList.toggle('open');
		$('help-button').onclick = (event) => { event.stopPropagation(); $('help').hidden = !$('help').hidden; };
		$('columns-button').onclick = (event) => { event.stopPropagation(); buildColumnsMenu(); $('columns-menu').hidden = !$('columns-menu').hidden; };
		document.addEventListener('click', (event) => {
			if (!$('help').contains(event.target)) $('help').hidden = true;
			if (!$('columns-menu').contains(event.target)) $('columns-menu').hidden = true;
		});
		document.addEventListener('keydown', (event) => {
			if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('query').focus(); }
			if (event.key === 'Escape') { $('help').hidden = true; $('columns-menu').hidden = true; $('sidebar').classList.remove('open'); }
		});

		const viewport = $('viewport');
		viewport.addEventListener('scroll', () => { renderRows(false); hideTip(); $('head').scrollLeft = viewport.scrollLeft; }, { passive: true });
		new ResizeObserver(() => renderRows(false)).observe(viewport);
		viewport.addEventListener('mousemove', (event) => {
			const row = event.target.closest('.row');
			if (!row) { hideTip(); return; }
			const id = Number(row.dataset.id);
			if (id !== hoverID) showTip(id, event.clientX, event.clientY);
			else moveTip(event.clientX, event.clientY);
		});
		viewport.addEventListener('mouseleave', hideTip);
		viewport.addEventListener('click', (event) => {
			const row = event.target.closest('.row');
			if (row) { hideTip(); openDetail(Number(row.dataset.id)); }
		});
		window.addEventListener('hashchange', () => { readHash(); syncControls(); applyFilters(); if (state.item) openDetail(state.item); else $('detail').hidden = true; });
	}

	start().catch((error) => {
		$('spacer').append(el('div', 'empty', `Could not load the item data: ${error.message}`));
	});
})();
