// Builds one record per item from the client tables: the values the list filters on, and the lines
// of the in-game tooltip. Items store formulas rather than numbers (a share of a stat budget, a
// damage table per item level), so the numbers are computed here the way the client computes them.
import { SpellText } from './spelltext.mjs';

export const QUALITY = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact', 'Heirloom'];

export const SLOT = {
	1: 'Head', 2: 'Neck', 3: 'Shoulder', 4: 'Shirt', 5: 'Chest', 6: 'Waist', 7: 'Legs', 8: 'Feet', 9: 'Wrist',
	10: 'Hands', 11: 'Finger', 12: 'Trinket', 13: 'One-Hand', 14: 'Off Hand', 15: 'Ranged', 16: 'Back',
	17: 'Two-Hand', 18: 'Bag', 19: 'Tabard', 20: 'Chest', 21: 'Main Hand', 22: 'Off Hand',
	23: 'Held In Off-hand', 24: 'Ammo', 25: 'Thrown', 26: 'Ranged', 27: 'Quiver', 28: 'Relic',
};

// Which column of the stat budget table (RandPropPoints) an equipment slot uses.
const BUDGET_COLUMN = {
	1: 0, 5: 0, 7: 0, 17: 0, 20: 0,
	3: 1, 6: 1, 8: 1, 10: 1, 12: 1,
	2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2,
	13: 3, 21: 3, 22: 3,
	15: 4, 25: 4, 26: 4, 28: 4,
};

const SCHOOL = ['Physical', 'Holy', 'Fire', 'Nature', 'Frost', 'Shadow', 'Arcane'];
const CREATURE = ['HUMANOID', 'ELEMENTAL', 'DEMON', 'UNDEAD', 'DRAGONKIN', 'GIANT', 'BEAST', 'MECHANICAL'];
const WEAPON_SKILL = ['TWO-HANDED_AXES', 'TWO-HANDED_MACES', 'TWO-HANDED_SWORDS', 'AXES', 'BOWS', 'CROSSBOWS', 'DAGGERS',
	'DUAL_WIELDING', 'FIST_WEAPONS', 'GUNS', 'MACES', 'POLEARMS', 'STAVES', 'SWORDS', 'THROWN_WEAPONS', 'WANDS'];
const PROFESSION = ['ALCHEMY', 'BLACKSMITHING', 'ENCHANTING', 'ENGINEERING', 'LEATHERWORKING', 'TAILORING',
	'HERBALISM', 'MINING', 'SKINNING', 'COOKING', 'FIRST_AID', 'FISHING'];

// Item stat types: [short name for filters, kind, client string key or label, rating column].
// kind: 'base' = white "+N Name" line, 'equip' = green line from TOOLTIP_ITEM_STAT_<key>_INCREASE,
// 'pct' = the same but the stored rating is shown as a percentage.
function statTypes() {
	const t = {
		0: ['Mana', 'base', 'Mana'], 1: ['Health', 'base', 'Health'],
		3: ['Agility', 'base', 'Agility'], 4: ['Strength', 'base', 'Strength'], 5: ['Intellect', 'base', 'Intellect'],
		6: ['Spirit', 'base', 'Spirit'], 7: ['Stamina', 'base', 'Stamina'],
		12: ['Defense', 'equip', 'DEFENSE'],
		13: ['Dodge %', 'pct', 'DODGE_PCT', 'Dodge'], 14: ['Parry %', 'pct', 'PARRY_PCT', 'Parry'],
		15: ['Block %', 'pct', 'BLOCK_CHANCE', 'Block'], 31: ['Hit %', 'pct', 'HIT_PERCENT', 'Hit - Melee'],
		32: ['Crit %', 'pct', 'CRIT_PERCENT', 'Crit - Melee'], 36: ['Haste %', 'pct', 'HASTE_PCT', 'Haste - Melee'],
		37: ['Expertise %', 'pct', 'EXPERTISE_PCT', 'Expertise'],
		38: ['Attack Power', 'equip', 'ATTACK_POWER'], 39: ['Ranged Attack Power', 'equip', 'RANGED_ATTACK_POWER'],
		41: ['Healing', 'equip', 'SPELL_HEALING'], 42: ['Spell Damage', 'equip', 'SPELL_DAMAGE'],
		43: ['Mana per 5 sec', 'equip', 'MANA_REGEN'], 44: ['Armor Penetration', 'equip', 'ARMOR_PENETRATION'],
		45: ['Spell Power', 'equip', 'SPELL_POWER'], 46: ['Health per 5 sec', 'equip', 'HEALTH_REGEN'],
		47: ['Spell Penetration', 'equip', 'SPELL_PENETRATION'], 48: ['Block Value', 'equip', 'BLOCK_VALUE'],
		50: ['Bonus Armor', 'base', 'Armor'],
		51: ['Fire Resistance', 'base', 'Fire Resistance'], 52: ['Frost Resistance', 'base', 'Frost Resistance'],
		53: ['Holy Resistance', 'base', 'Holy Resistance'], 54: ['Shadow Resistance', 'base', 'Shadow Resistance'],
		55: ['Nature Resistance', 'base', 'Nature Resistance'], 56: ['Arcane Resistance', 'base', 'Arcane Resistance'],
		83: ['Weapon Damage', 'equip', 'WEAPON_DAMAGE'],
		124: ['All Resistances', 'base', 'to All Resistances'],
	};
	['Holy', 'Fire', 'Nature', 'Frost', 'Shadow', 'Arcane'].forEach((school, i) => {
		t[84 + i] = [`${school} Spell Damage`, 'equip', `${school.toUpperCase()}_DAMAGE`];
		if (i > 0) t[118 + i] = [`${school} Penetration`, 'equip', `${school.toUpperCase()}_PENETRATION`];
	});
	const title = (key) => key.toLowerCase().replace(/_/g, ' ').replace(/(^|[ -])\w/g, (c) => c.toUpperCase());
	WEAPON_SKILL.forEach((key, i) => { t[90 + i] = [`${title(key)} Skill`, 'equip', `SKILL_${key}`]; });
	PROFESSION.forEach((key, i) => { t[106 + i] = [`${title(key)} Skill`, 'equip', `SKILL_${key}`]; });
	CREATURE.forEach((key, i) => {
		t[125 + i] = [`Attack Power vs ${title(key)}`, 'equip', `AP_VS_${key}`];
		t[133 + i] = [`Spell Damage vs ${title(key)}`, 'equip', `SD_VS_${key}`];
	});
	return t;
}
export const STAT = statTypes();

// Share of the durability base, by armor material (ItemSubClass) and slot (InventoryType).
const DURABILITY_ARMOR = {
	1: { 1: 0.374, 3: 0.374, 5: 0.592, 6: 0.216, 7: 0.4715, 8: 0.2945, 9: 0.216, 10: 0.216 },
	2: { 1: 0.432, 3: 0.432, 5: 0.728, 6: 0.2545, 7: 0.551, 8: 0.374, 9: 0.2545, 10: 0.2485 },
	3: { 1: 0.5115, 3: 0.5115, 5: 0.856, 6: 0.2945, 7: 0.649, 8: 0.432, 9: 0.2945, 10: 0.297 },
	4: { 1: 0.591, 3: 0.593, 5: 0.9845, 6: 0.334, 7: 0.728, 8: 0.4635, 9: 0.334, 10: 0.334 },
};
const DURABILITY_WEAPON = { 0: 0.89, 1: 1.01, 2: 0.765, 3: 0.765, 4: 0.89, 5: 1.01, 6: 1.01, 7: 0.89, 8: 1.01, 10: 1.01,
	13: 0.765, 15: 0.643, 18: 0.765, 19: 0.655, 20: 0.664 };
// Shield block value of an Uncommon shield by item level (index).
const BLOCK_BY_LEVEL = [1, 1, 1, 1, 1, 1, 2, 3, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 9, 9, 10, 10, 11, 11,
	12, 12, 13, 13, 14, 14, 15, 15, 16, 17, 17, 18, 19, 20, 20, 21, 22, 23, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];

// Line styles of the tooltip.
export const STYLE = { white: 0, green: 1, grey: 2, gold: 3, yellow: 4, red: 5 };

const roundHalfUp = (n) => Math.floor(n + 0.5);

// C style format with the few forms the client strings use: %d %s %1$d %1$.1f %%.
function format(template, ...args) {
	let next = 0;
	return template.replace(/%(?:(\d)\$)?(?:\.(\d))?([dsfc%])/g, (all, position, decimals, type) => {
		if (type === '%') return '%';
		const value = args[position ? Number(position) - 1 : next++];
		if (type === 'f') return Number(value).toFixed(decimals ? Number(decimals) : 6);
		return String(value);
	});
}

function cooldownText(ms) {
	const seconds = ms / 1000;
	if (seconds >= 3600) {
		const hours = Math.round(seconds / 360) / 10;
		return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'}`;
	}
	if (seconds >= 60) return `${Math.round(seconds / 6) / 10} Min`;
	return `${Math.round(seconds * 10) / 10} Sec`;
}

function durationText(seconds) {
	if (seconds >= 86400) { const d = Math.round(seconds / 8640) / 10; return `${d} ${d === 1 ? 'day' : 'days'}`; }
	if (seconds >= 3600) { const h = Math.round(seconds / 360) / 10; return `${h} ${h === 1 ? 'hour' : 'hrs'}`; }
	if (seconds >= 60) return `${Math.round(seconds / 6) / 10} min`;
	return `${seconds} sec`;
}

export class ItemBuilder {
	constructor(tables, gameTables) {
		this.t = tables;
		this.spells = new SpellText(tables);
		this.strings = new Map();
		for (const row of tables.GlobalStrings.values()) this.strings.set(row.BaseTag, row.TagText_lang ?? '');
		this.ratings = gameTables.CombatRatings[59] ?? gameTables.CombatRatings[0];

		this.effectsByItem = new Map();
		for (const link of tables.ItemXItemEffect.values()) {
			const effect = tables.ItemEffect.get(link.ItemEffectID);
			if (!effect) continue;
			if (!this.effectsByItem.has(link.ItemID)) this.effectsByItem.set(link.ItemID, []);
			this.effectsByItem.get(link.ItemID).push(effect);
		}
		for (const list of this.effectsByItem.values()) list.sort((a, b) => a.LegacySlotIndex - b.LegacySlotIndex || a.ID - b.ID);

		this.subclass = new Map();
		for (const row of tables.ItemSubClass.values()) this.subclass.set(`${row.ClassID}:${row.SubClassID}`, row);
		this.className = new Map();
		for (const row of tables.ItemClass.values()) this.className.set(row.ClassID, row.ClassName_lang);

		this.classes = [...tables.ChrClasses.values()].filter((row) => row.ID <= 11).sort((a, b) => a.ID - b.ID);
		this.races = [...tables.ChrRaces.values()].filter((row) => row.ID <= 8).sort((a, b) => a.ID - b.ID);
		this.allClasses = this.classes.reduce((mask, row) => mask | (1 << (row.ID - 1)), 0);
		this.allRaces = this.races.reduce((mask, row) => mask | (1 << (row.ID - 1)), 0);

		this.icons = new Map();
		for (const row of tables.ManifestInterfaceData.values()) {
			if (/icons/i.test(row.FilePath)) this.icons.set(row.ID, row.FileName.replace(/\.blp$/i, '').toLowerCase());
		}

		this.randomEnchant = new Set();
		for (const row of tables.ItemXBonusTree.values()) this.randomEnchant.add(row.ItemID);

		this.setBonuses = new Map();
		for (const row of tables.ItemSetSpell.values()) {
			if (!this.setBonuses.has(row.ItemSetID)) this.setBonuses.set(row.ItemSetID, []);
			this.setBonuses.get(row.ItemSetID).push(row);
		}
	}

	string(key, fallback = '') {
		return this.strings.get(key) || fallback;
	}

	budget(sparse) {
		const row = this.t.RandPropPoints.get(sparse.ItemLevel);
		const column = BUDGET_COLUMN[sparse.InventoryType];
		if (!row || column === undefined) return 0;
		const quality = sparse.OverallQualityID;
		const points = quality >= 4 ? row.Epic : quality === 3 ? row.Superior : row.Good;
		return points[column];
	}

	// [[statType, value]] in the item's own order. Percent stats keep one decimal.
	stats(sparse) {
		const budget = this.budget(sparse);
		const out = [];
		for (let i = 0; i < 10; i++) {
			const type = sparse.StatModifier_bonusStat[i];
			const share = sparse.StatPercentEditor[i];
			if (type < 0 || !share) continue;
			const points = (share * budget) / 10000;
			const def = STAT[type];
			if (def?.[1] === 'pct') {
				const per = this.ratings[def[3]] || 1;
				out.push([type, Math.round((roundHalfUp(points) / per) * 10) / 10]);
			} else {
				out.push([type, points < 0 ? -roundHalfUp(-points) : roundHalfUp(points)]);
			}
		}
		return out.filter(([, value]) => value !== 0);
	}

	damage(item, sparse) {
		if (item.ClassID !== 2 && item.ClassID !== 6) return null;
		const t = this.t;
		const inv = sparse.InventoryType;
		const caster = (sparse.Flags[1] & 0x200) !== 0;
		let table;
		if (item.ClassID === 6) table = t.ItemDamageAmmo;
		else if (inv === 13 || inv === 21 || inv === 22) table = caster ? t.ItemDamageOneHandCaster : t.ItemDamageOneHand;
		else if (inv === 17) table = caster ? t.ItemDamageTwoHandCaster : t.ItemDamageTwoHand;
		else if (inv === 25) table = t.ItemDamageThrown;
		else if (inv === 15 || inv === 26) table = item.SubclassID === 19 ? t.ItemDamageWand : t.ItemDamageRanged;
		const dps = table?.get(sparse.ItemLevel)?.Quality?.[sparse.OverallQualityID];
		if (!dps) return null;
		if (item.ClassID === 6) return { ammo: Math.round(dps * 10) / 10 };
		if (!sparse.ItemDelay) return null;
		const speed = sparse.ItemDelay / 1000;
		const average = dps * speed;
		const min = Math.floor(average * (1 - sparse.DmgVariance / 2));
		const max = roundHalfUp(average * (1 + sparse.DmgVariance / 2));
		if (max <= 0) return null;
		return { min, max, speed, dps: (min + max) / 2 / speed };
	}

	armor(item, sparse) {
		if (item.ClassID !== 4) return 0;
		const t = this.t;
		const quality = sparse.OverallQualityID;
		const level = sparse.ItemLevel;
		if (item.SubclassID === 6) return t.ItemArmorShield.get(level)?.Quality?.[quality] ?? 0;
		const kind = { 1: ['Cloth', 'Clothmodifier'], 2: ['Leather', 'Leathermodifier'], 3: ['Mail', 'Chainmodifier'], 4: ['Plate', 'Platemodifier'] }[item.SubclassID];
		const location = t.ArmorLocation.get(sparse.InventoryType === 20 ? 5 : sparse.InventoryType);
		const total = t.ItemArmorTotal.get(level);
		const mod = t.ItemArmorQuality.get(level)?.Qualitymod?.[quality];
		if (!kind || !location || !total || !mod) return 0;
		return roundHalfUp(mod * total[kind[0]] * location[kind[1]]);
	}

	// Maximum durability. The client files hold no durability value, so this is a model fitted to
	// known items: a base per slot and material, scaled by quality, reduced below item level 30.
	// About four in five items come out exact; the rest are 5 off.
	durability(item, sparse) {
		const quality = [0.92, 0.92, 0.92, 1.11, 1.32, 1.61][sparse.OverallQualityID] ?? 0;
		const level = sparse.ItemLevel;
		const penalty = level > 29 ? 1 : 0.996 - (29 - level) / 54;
		let units = 0;
		if (item.ClassID === 4) {
			const slot = sparse.InventoryType === 20 ? 5 : sparse.InventoryType;
			const share = item.SubclassID === 6 ? (slot === 14 ? 0.728 : 0) : DURABILITY_ARMOR[item.SubclassID]?.[slot];
			if (share) units = roundHalfUp(25 * quality * share * penalty);
		} else if (item.ClassID === 2) {
			const share = DURABILITY_WEAPON[item.SubclassID];
			if (share) units = roundHalfUp(18 * quality * share * penalty);
		}
		return Math.max(units, 0) * 5;
	}

	// Block value of a shield: also not stored. It follows the item level, shifted by quality.
	block(item, sparse) {
		if (item.ClassID !== 4 || item.SubclassID !== 6) return 0;
		const level = sparse.ItemLevel + ([-7, -2, 0, 5, 10, 15][sparse.OverallQualityID] ?? 0);
		if (level < 1) return 1;
		if (level >= BLOCK_BY_LEVEL.length) return BLOCK_BY_LEVEL[BLOCK_BY_LEVEL.length - 1] + level - BLOCK_BY_LEVEL.length + 1;
		return BLOCK_BY_LEVEL[level];
	}

	statLine(type, value, extra) {
		const def = STAT[type];
		if (!def) return [STYLE.green, `Equip: +${value} (stat ${type})`];
		const [, kind, key] = def;
		const sign = value < 0 ? '-' : '+';
		const shown = Math.abs(value);
		if (kind === 'base') return [STYLE.white, `${sign}${shown} ${key}`];
		const template = this.string(`TOOLTIP_ITEM_STAT_${key}_${value < 0 ? 'DECREASE' : 'INCREASE'}`)
			|| this.string(`TOOLTIP_ITEM_STAT_${key}_INCREASE`);
		if (!template) return [STYLE.green, `Equip: ${sign}${shown} ${def[0]}.`];
		return [STYLE.green, format(template, shown, extra)];
	}

	build(id) {
		const item = this.t.Item.get(id);
		const sparse = this.t.ItemSparse.get(id);
		if (!item || !sparse) return null;
		const quality = sparse.OverallQualityID;
		const inv = sparse.InventoryType;
		const sub = this.subclass.get(`${item.ClassID}:${item.SubclassID}`);
		const flags = sparse.Flags;
		const lines = [];
		const add = (style, text, right) => lines.push(right ? [style, text, right] : [style, text]);

		const record = {
			id,
			n: sparse.Display_lang,
			q: quality,
			il: sparse.ItemLevel,
			rl: sparse.RequiredLevel,
			c: item.ClassID,
			s: item.SubclassID,
			v: inv,
			ic: this.icons.get(item.IconFileDataID) ?? 'inv_misc_questionmark',
			icf: item.IconFileDataID,
		};

		const nameDescription = this.t.ItemNameDescription.get(sparse.ItemNameDescriptionID)?.Description_lang;
		if (nameDescription) { add(STYLE.green, nameDescription); record.nd = nameDescription; }
		if (sparse.ItemLevel) add(STYLE.yellow, `Item Level ${sparse.ItemLevel}`);

		const map = sparse.InstanceBound ? this.t.Map.get(sparse.InstanceBound)?.MapName_lang : '';
		if (map) { add(STYLE.white, map); record.map = map; }
		const zone = sparse.ZoneBound?.[0] ? this.t.AreaTable.get(sparse.ZoneBound[0])?.AreaName_lang : '';
		if (zone) { add(STYLE.white, zone); record.zone = zone; }
		if (flags[0] & 0x2) add(STYLE.white, 'Conjured Item');

		const bind = ['', 'Binds when picked up', 'Binds when equipped', 'Binds when used', 'Quest Item', 'Quest Item'][sparse.Bonding];
		if (bind) add(STYLE.white, bind);
		record.b = sparse.Bonding;

		const limit = this.t.ItemLimitCategory.get(sparse.LimitCategory);
		if (sparse.MaxCount === 1) add(STYLE.white, 'Unique');
		else if (sparse.MaxCount > 1) add(STYLE.white, `Unique (${sparse.MaxCount})`);
		else if (limit) add(STYLE.white, `${limit.Flags & 1 ? 'Unique-Equipped' : 'Unique'}: ${limit.Name_lang} (${limit.Quantity})`);
		if (flags[0] & 0x80000) add(STYLE.white, 'Unique-Equipped');
		if (sparse.MaxCount) record.u = sparse.MaxCount;
		if (flags[0] & 0x80000) record.ue = 1;

		if (sparse.StartQuestID) { add(STYLE.white, 'This Item Begins a Quest'); record.quest = sparse.StartQuestID; }
		if (sparse.LockID) { add(STYLE.red, 'Locked'); record.lock = 1; }
		if (flags[1] & 0x80000000) { add(STYLE.white, 'Crafting Reagent'); record.rg = 1; }

		// Slot and type
		const equippable = inv > 0 && inv !== 18 && SLOT[inv];
		if (item.ClassID === 1 || item.ClassID === 11 || inv === 18 || inv === 27) {
			if (sparse.ContainerSlots) {
				add(STYLE.white, `${sparse.ContainerSlots} Slot ${sub?.DisplayName_lang || 'Bag'}`);
				record.slots = sparse.ContainerSlots;
			}
		} else if (equippable) {
			const showType = (item.ClassID === 2 && item.SubclassID !== 14) || (item.ClassID === 4 && item.SubclassID !== 0 && inv !== 16) || item.ClassID === 6;
			add(STYLE.white, SLOT[inv], showType ? sub?.DisplayName_lang || '' : '');
		}

		const damage = this.damage(item, sparse);
		if (damage?.ammo) {
			add(STYLE.white, `Adds ${damage.ammo} damage per second`);
			record.dps = damage.ammo;
		} else if (damage) {
			const school = sparse.DamageType ? `${SCHOOL[sparse.DamageType]} ` : '';
			add(STYLE.white, `${damage.min} - ${damage.max} ${school}Damage`, `Speed ${damage.speed.toFixed(2)}`);
			add(STYLE.white, `(${damage.dps.toFixed(2)} damage per second)`);
			record.d1 = damage.min;
			record.d2 = damage.max;
			record.sp = damage.speed;
			record.dps = Math.round(damage.dps * 100) / 100;
			if (sparse.DamageType) record.dt = sparse.DamageType;
		}

		const armor = this.armor(item, sparse);
		if (armor) { add(STYLE.white, `${armor} Armor`); record.a = armor; }
		const block = this.block(item, sparse);
		if (block) { add(STYLE.white, `${block} Block`); record.bl = block; }

		// Stats: the white ones first, the green "Equip:" ones after the requirements.
		const stats = this.stats(sparse);
		const equipLines = [];
		const healing = stats.find(([type]) => type === 41);
		const spellDamage = stats.find(([type]) => type === 42);
		for (const [type, value] of stats) {
			const kind = STAT[type]?.[1];
			if (kind === 'base') { lines.push(this.statLine(type, value)); continue; }
			if (type === 42 && healing) continue;
			if (type === 41 && spellDamage) {
				const key = healing[1] < 0
					? (spellDamage[1] < 0 ? 'SPELL_HEALING_DECREASE_DAMAGE_DECREASE' : 'SPELL_HEALING_DECREASE_DAMAGE_INCREASE')
					: 'SPELL_HEALING_INCREASE_DAMAGE_INCREASE';
				const template = this.string(`TOOLTIP_ITEM_STAT_${key}`);
				equipLines.push([STYLE.green, format(template, Math.abs(healing[1]), Math.abs(spellDamage[1]))]);
				continue;
			}
			equipLines.push(this.statLine(type, kind === 'pct' ? value.toFixed(1) : value));
		}
		if (stats.length) record.st = Object.fromEntries(stats);

		// The suffix ("of the Bear") and its stats are rolled when the item drops.
		if (this.randomEnchant.has(id)) { add(STYLE.green, '<Random enchantment>'); record.re = 1; }

		const durability = equippable ? this.durability(item, sparse) : 0;
		if (durability) { add(STYLE.white, `Durability ${durability} / ${durability}`); record.du = durability; }

		// Requirements
		const classMask = sparse.AllowableClass & this.allClasses;
		if (sparse.AllowableClass !== -1 && classMask && classMask !== this.allClasses) {
			add(STYLE.white, `Classes: ${this.classes.filter((row) => classMask & (1 << (row.ID - 1))).map((row) => row.Name_lang).join(', ')}`);
			record.cm = classMask;
		}
		const raceBits = Number(BigInt.asUintN(32, BigInt(sparse.AllowableRace?.[0] ?? -1)));
		const raceMask = raceBits & this.allRaces;
		if (raceMask && raceMask !== this.allRaces) {
			add(STYLE.white, `Races: ${this.races.filter((row) => raceMask & (1 << (row.ID - 1))).map((row) => row.Name_lang).join(', ')}`);
			record.rm = raceMask;
		}
		if (sparse.RequiredLevel > 1) add(STYLE.white, `Requires Level ${sparse.RequiredLevel}`);
		const skill = this.t.SkillLine.get(sparse.RequiredSkill);
		if (skill) {
			add(STYLE.white, `Requires ${skill.DisplayName_lang}${sparse.RequiredSkillRank ? ` (${sparse.RequiredSkillRank})` : ''}`);
			record.sk = skill.DisplayName_lang;
			record.skr = sparse.RequiredSkillRank;
		}
		if (sparse.RequiredAbility) {
			const ability = this.spells.spellName(sparse.RequiredAbility);
			if (ability) { add(STYLE.white, `Requires ${ability}`); record.ab = ability; }
		}
		const faction = this.t.Faction.get(sparse.MinFactionID);
		if (faction) {
			const standing = ['Hated', 'Hostile', 'Unfriendly', 'Neutral', 'Friendly', 'Honored', 'Revered', 'Exalted'][sparse.MinReputation] ?? '';
			add(STYLE.white, `Requires ${faction.Name_lang} - ${standing}`);
			record.fa = faction.Name_lang;
			record.rep = sparse.MinReputation;
		}

		lines.push(...equipLines);

		// Spell effects
		const effectTexts = [];
		for (const effect of this.effectsByItem.get(id) ?? []) {
			const text = this.spells.description(effect.SpellID);
			if (!text) continue;
			const trigger = effect.TriggerType;
			const label = trigger === 1 ? 'Equip:' : trigger === 2 ? 'Chance on hit:' : 'Use:';
			let line = `${label} ${text}`;
			if (label === 'Use:') {
				let cooldown = effect.CoolDownMSec > 0 ? effect.CoolDownMSec : 0;
				if (effect.CategoryCoolDownMSec > cooldown) cooldown = effect.CategoryCoolDownMSec;
				if (cooldown > 1500) line += ` (${cooldownText(cooldown)} Cooldown)`;
			}
			add(STYLE.green, line);
			effectTexts.push(line);
			if (Math.abs(effect.Charges) > 1) add(STYLE.white, `${Math.abs(effect.Charges)} Charges`);
		}
		if (effectTexts.length) record.fx = effectTexts;

		// A recipe shows the item it makes.
		if (item.ClassID === 9) {
			for (const effect of this.effectsByItem.get(id) ?? []) {
				const made = this.spells.createdItem(effect.SpellID);
				if (made && made !== id && this.t.ItemSparse.has(made)) { lines.push(['item', made]); record.mk = made; break; }
			}
		}

		if (sparse.ItemSet && this.t.ItemSet.has(sparse.ItemSet)) {
			lines.push(['set', sparse.ItemSet]);
			record.set = sparse.ItemSet;
		}

		if (sparse.Description_lang && !effectTexts.some((text) => text.endsWith(sparse.Description_lang))) {
			add(STYLE.gold, `"${sparse.Description_lang}"`);
			record.de = sparse.Description_lang;
		}
		if (sparse.PageID) add(STYLE.green, '<Right Click to Read>');
		if (flags[0] & 0x4) add(STYLE.green, '<Right Click to Open>');
		if (sparse.DurationInInventory) {
			add(STYLE.white, `Duration: ${durationText(sparse.DurationInInventory)}`);
			record.dur = sparse.DurationInInventory;
		}

		if (sparse.SellPrice) record.sell = sparse.SellPrice;
		if (sparse.BuyPrice) record.buy = sparse.BuyPrice;
		if (sparse.Stackable > 1) record.stk = sparse.Stackable;
		if (flags[0] & 0x2) record.conj = 1;
		if (sparse.PageID) record.read = 1;
		if (flags[0] & 0x4) record.open = 1;
		record.f = flags.slice(0, 4);

		return { record, lines };
	}

	sets() {
		const out = {};
		for (const set of this.t.ItemSet.values()) {
			const bonuses = (this.setBonuses.get(set.ID) ?? [])
				.sort((a, b) => a.Threshold - b.Threshold || a.ID - b.ID)
				.map((row) => [row.Threshold, this.spells.description(row.SpellID)])
				.filter(([, text]) => text);
			out[set.ID] = { n: set.Name_lang, items: set.ItemID.filter((itemID) => itemID), bonuses };
		}
		return out;
	}
}
