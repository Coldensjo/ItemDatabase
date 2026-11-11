// Turns a spell's description template ("Restores $s1 health over $d.") into the text the game shows.
// The values come from the spell tables; this resolves the placeholders the client resolves.

function byKey(rows, key) {
	const map = new Map();
	for (const row of rows.values()) {
		const k = row[key];
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(row);
	}
	return map;
}

// The row for the normal difficulty when a spell has several.
function first(rows) {
	if (!rows) return undefined;
	return rows.find((row) => !row.DifficultyID) ?? rows[0];
}

export class SpellText {
	constructor(tables) {
		this.spell = tables.Spell;
		this.name = tables.SpellName;
		this.duration = tables.SpellDuration;
		this.range = tables.SpellRange;
		this.radius = tables.SpellRadius;
		this.effects = byKey(tables.SpellEffect, 'SpellID');
		this.misc = byKey(tables.SpellMisc, 'SpellID');
		this.aura = byKey(tables.SpellAuraOptions, 'SpellID');
		this.cooldowns = byKey(tables.SpellCooldowns, 'SpellID');
		this.levels = byKey(tables.SpellLevels, 'SpellID');
		this.cache = new Map();
	}

	spellName(id) {
		return this.name.get(id)?.Name_lang ?? '';
	}

	effect(spellID, index) {
		const rows = this.effects.get(spellID);
		if (!rows) return undefined;
		return rows.find((row) => row.EffectIndex === index - 1 && !row.DifficultyID)
			?? rows.find((row) => row.EffectIndex === index - 1);
	}

	durationMs(spellID) {
		const misc = first(this.misc.get(spellID));
		return misc ? this.duration.get(misc.DurationIndex)?.Duration ?? 0 : 0;
	}

	// Cooldown in milliseconds the spell has by itself (items may override it).
	cooldownMs(spellID) {
		const row = first(this.cooldowns.get(spellID));
		if (!row) return 0;
		return Math.max(row.RecoveryTime ?? 0, row.CategoryRecoveryTime ?? 0);
	}

	// The item a spell creates, following "learn this spell" one step (a recipe teaches the spell that crafts).
	createdItem(spellID, depth = 0) {
		for (const effect of this.effects.get(spellID) ?? []) {
			if (effect.Effect === 24 && effect.EffectItemType) return effect.EffectItemType;
		}
		if (depth < 1) {
			for (const effect of this.effects.get(spellID) ?? []) {
				if (effect.Effect === 36 && effect.EffectTriggerSpell) {
					const made = this.createdItem(effect.EffectTriggerSpell, depth + 1);
					if (made) return made;
				}
			}
		}
		return 0;
	}

	static formatDuration(ms) {
		if (ms < 0) return 'until cancelled';
		const seconds = ms / 1000;
		const trim = (n) => String(Math.round(n * 100) / 100);
		if (seconds < 60) return `${trim(seconds)} sec`;
		if (seconds < 3600) return `${trim(seconds / 60)} min`;
		if (seconds < 86400) {
			const hours = seconds / 3600;
			return `${trim(hours)} ${hours === 1 ? 'hour' : 'hrs'}`;
		}
		const days = seconds / 86400;
		return `${trim(days)} ${days === 1 ? 'day' : 'days'}`;
	}

	// [min, max] of an effect's displayed amount.
	amount(spellID, index) {
		const effect = this.effect(spellID, index);
		if (!effect) return [0, 0];
		const base = effect.EffectBasePointsF ?? 0;
		const variance = effect.Variance ?? 0;
		if (!variance) return [base, base];
		const low = base * (1 - variance / 2);
		const high = base * (1 + variance / 2);
		return [Math.min(low, high), Math.max(low, high)];
	}

	// Value of one placeholder as a number (or [min, max]); undefined when it is not known.
	value(spellID, code, index) {
		const effect = this.effect(spellID, index || 1);
		const aura = first(this.aura.get(spellID));
		const misc = first(this.misc.get(spellID));
		switch (code) {
			case 's': case 'S': {
				const [low, high] = this.amount(spellID, index || 1);
				return low === high ? low : [low, high];
			}
			case 'm': return this.amount(spellID, index || 1)[0];
			case 'M': return this.amount(spellID, index || 1)[1];
			case 'o': case 'O': {
				const period = effect?.EffectAuraPeriod || 0;
				const duration = this.durationMs(spellID);
				// Health regeneration auras (food) have no period of their own: they tick every 5 seconds.
				const every = period > 0 ? period : effect?.EffectAura === 84 ? 5000 : 0;
				const ticks = every > 0 && duration > 0 ? duration / every : 1;
				const [low, high] = this.amount(spellID, index || 1);
				return low === high ? low * ticks : [low * ticks, high * ticks];
			}
			case 't': case 'T': return (effect?.EffectAuraPeriod ?? 0) / 1000;
			case 'a': case 'A': return this.radius.get(effect?.EffectRadiusIndex?.[0])?.Radius
				?? this.radius.get(effect?.EffectRadiusIndex?.[1])?.Radius ?? 0;
			case 'x': case 'X': return effect?.EffectChainTargets ?? 0;
			case 'q': case 'Q': return effect?.EffectMiscValue?.[0] ?? 0;
			case 'b': case 'B': return effect?.EffectPointsPerResource ?? 0;
			case 'e': case 'E': return effect?.EffectAmplitude ?? 0;
			case 'f': case 'F': return effect?.EffectChainAmplitude ?? 0;
			case 'h': case 'H': return aura?.ProcChance ?? 0;
			case 'n': case 'N': return aura?.ProcCharges ?? 0;
			case 'u': case 'U': return aura?.CumulativeAura ?? 0;
			case 'r': case 'R': return this.range.get(misc?.RangeIndex)?.RangeMax?.[0] ?? 0;
			case 'i': case 'I': return 0;
			case 'v': case 'V': return first(this.levels.get(spellID))?.MaxLevel ?? 0;
			case 'D': case 'd': return undefined; // durations are text, handled by the caller
			default: return undefined;
		}
	}

	static formatNumber(value, decimals) {
		const one = (n) => {
			n = Math.abs(n);
			if (decimals !== undefined) return n.toFixed(decimals);
			const rounded = Math.round(n);
			// Small fractions (0.5 sec, 1.5%) keep a decimal; everything else is whole.
			if (Math.abs(n - rounded) > 0.05 && n < 10) return String(Math.round(n * 10) / 10);
			return String(rounded);
		};
		if (Array.isArray(value)) return `${one(value[0])} to ${one(value[1])}`;
		return one(value);
	}

	description(spellID, depth = 0) {
		if (depth === 0 && this.cache.has(spellID)) return this.cache.get(spellID);
		const template = this.spell.get(spellID)?.Description_lang ?? '';
		const text = this.render(template, spellID, depth);
		if (depth === 0) this.cache.set(spellID, text);
		return text;
	}

	render(template, spellID, depth = 0) {
		if (!template) return '';
		let out = '';
		let lastNumber = 1;
		let i = 0;
		const src = template;

		// Reads "[...]" with nesting, returns [content, nextIndex].
		const bracket = (at) => {
			let level = 0;
			for (let j = at; j < src.length; j++) {
				if (src[j] === '[') level++;
				else if (src[j] === ']' && --level === 0) return [src.slice(at + 1, j), j + 1];
			}
			return [src.slice(at + 1), src.length];
		};

		while (i < src.length) {
			const ch = src[i];
			if (ch === '|') {
				// Colour codes and plural forms from the UI markup.
				const colour = /^\|c(?:[0-9a-fA-F]{8}|n[^:|]*:)/.exec(src.slice(i, i + 40));
				if (colour) { i += colour[0].length; continue; }
				const texture = /^\|([TA])[^|]*\|[ta]/.exec(src.slice(i, i + 200));
				if (texture) { i += texture[0].length; continue; }
				if (src[i + 1] === 'r' || src[i + 1] === 'R') { i += 2; continue; }
				const plural = /^\|4([^:;]*):([^;]*);/.exec(src.slice(i));
				if (plural) {
					out += lastNumber === 1 ? plural[1] : plural[2];
					i += plural[0].length;
					continue;
				}
			}
			if (ch !== '$') { out += ch; i++; continue; }
			const rest = src.slice(i + 1);
			let m;

			// ${expression} with an optional ".N" number of decimals
			if (rest[0] === '{') {
				let level = 0, j = i + 1;
				for (; j < src.length; j++) {
					if (src[j] === '{') level++;
					else if (src[j] === '}' && --level === 0) break;
				}
				const expression = src.slice(i + 2, j);
				i = j + 1;
				let decimals;
				const dm = /^\.(\d)/.exec(src.slice(i));
				if (dm) { decimals = Number(dm[1]); i += 2; }
				const value = this.evaluate(expression, spellID);
				if (value === undefined) out += '?';
				else { lastNumber = Math.abs(Math.round(value)); out += SpellText.formatNumber(value, decimals); }
				continue;
			}
			// $?condition[then][else]: the player-independent branch is the last one
			if (rest[0] === '?') {
				let j = i + 2;
				let chosen = '';
				for (;;) {
					while (j < src.length && src[j] !== '[') j++;
					const [, afterThen] = bracket(j);
					j = afterThen;
					if (src[j] === '?') { j++; continue; }
					if (src[j] === '[') { [chosen, j] = bracket(j); }
					break;
				}
				out += this.render(chosen, spellID, depth);
				i = j;
				continue;
			}
			// $@spelldesc123, $@spellname123, $@spellicon123, $@spellaura123
			if ((m = /^@(spelldesc|spellname|spellicon|spellaura|spelltooltip)(\d+)/.exec(rest))) {
				const other = Number(m[2]);
				if (m[1] === 'spellname') out += this.spellName(other);
				else if ((m[1] === 'spelldesc' || m[1] === 'spelltooltip') && depth < 4) out += this.description(other, depth + 1);
				else if (m[1] === 'spellaura' && depth < 4) out += this.render(this.spell.get(other)?.AuraDescription_lang ?? '', other, depth + 1);
				i += 1 + m[0].length;
				continue;
			}
			// $lsingular:plural; and $gmale:female;
			if ((m = /^[lL]([^:;]*):([^;]*);/.exec(rest))) {
				out += lastNumber === 1 ? m[1] : m[2];
				i += 1 + m[0].length;
				continue;
			}
			if ((m = /^[gG]([^:;]*):([^;]*);/.exec(rest))) {
				out += m[1];
				i += 1 + m[0].length;
				continue;
			}
			// $/10;s1 $*2;s1 $12345s1 $s1 $d $o2 ...
			if ((m = /^(?:([/*])(\d+(?:\.\d+)?);)?(\d+)?([a-zA-Z])(\d)?/.exec(rest))) {
				const [, op, operand, otherSpell, code, index] = m;
				const target = otherSpell ? Number(otherSpell) : spellID;
				if (code === 'd' || code === 'D') {
					out += SpellText.formatDuration(this.durationMs(target));
					lastNumber = 2;
					i += 1 + m[0].length;
					continue;
				}
				let value = this.value(target, code, index ? Number(index) : 0);
				if (value !== undefined) {
					if (op) {
						const apply = (n) => (op === '/' ? n / Number(operand) : n * Number(operand));
						value = Array.isArray(value) ? value.map(apply) : apply(value);
					}
					lastNumber = Math.abs(Math.round(Array.isArray(value) ? value[1] : value));
					out += SpellText.formatNumber(value);
					i += 1 + m[0].length;
					continue;
				}
			}
			// Named variables the client fills in from the player (level, attack power...).
			if ((m = /^[a-zA-Z]+\d*/.exec(rest))) {
				i += 1 + m[0].length;
				continue;
			}
			out += ch;
			i++;
		}
		return out.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim();
	}

	// Arithmetic inside ${...}; returns undefined when it depends on something only the player has.
	evaluate(expression, spellID) {
		let failed = false;
		const substituted = expression.replace(/\$(\d+)?([a-zA-Z]+)(\d)?/g, (all, otherSpell, code, index) => {
			if (code.length > 1) {
				const fn = code.toLowerCase();
				if (['max', 'min', 'floor', 'gt', 'gte', 'lt', 'lte', 'cond', 'clamp'].includes(fn)) return fn;
				failed = true;
				return '0';
			}
			let value = this.value(otherSpell ? Number(otherSpell) : spellID, code, index ? Number(index) : 0);
			if (code === 'd' || code === 'D') value = this.durationMs(otherSpell ? Number(otherSpell) : spellID) / 1000;
			if (value === undefined) { failed = true; return '0'; }
			if (Array.isArray(value)) value = (value[0] + value[1]) / 2;
			return `(${value})`;
		});
		if (failed || /[^0-9a-z+\-*/()., ]/i.test(substituted) || /[a-z]{2,}/i.test(substituted.replace(/\b(max|min|floor|gt|gte|lt|lte|cond|clamp)\b/g, ''))) return undefined;
		const fns = {
			max: Math.max, min: Math.min, floor: Math.floor,
			gt: (a, b) => (a > b ? 1 : 0), gte: (a, b) => (a >= b ? 1 : 0),
			lt: (a, b) => (a < b ? 1 : 0), lte: (a, b) => (a <= b ? 1 : 0),
			cond: (c, a, b) => (c ? a : b), clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
		};
		try {
			const result = Function(...Object.keys(fns), `"use strict"; return (${substituted});`)(...Object.values(fns));
			return Number.isFinite(result) ? result : undefined;
		} catch {
			return undefined;
		}
	}
}
