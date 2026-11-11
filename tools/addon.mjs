// Copies the Item Harvest addon into the game's AddOns folder. Usage: bun addon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { CACHE } from './lib/gamedata.mjs';

const ROOT = path.join(CACHE, '..', '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const addons = path.join(config.wow_path, 'Interface', 'AddOns');
if (!fs.existsSync(addons)) throw new Error(`no AddOns folder at ${addons}: check wow_path in config.json`);
if (!fs.existsSync(path.join(ROOT, 'addon', 'ItemHarvest', 'Missing.lua'))) throw new Error('run update.bat first: it writes the list of missing items');
const target = path.join(addons, 'ItemHarvest');
fs.cpSync(path.join(ROOT, 'addon', 'ItemHarvest'), target, { recursive: true });
console.log(`Installed to ${target}`);
console.log('Restart the game (or /reload), then type /harvest.');
