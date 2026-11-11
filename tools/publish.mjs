// Publishes docs/ to the gh-pages branch, and restores state/ from it on a fresh clone.
//
// site/ is its own git checkout of gh-pages. Every publish replaces that branch's single commit
// (amend + force push), so repeated uploads of a few megabytes of data do not grow the repository.
// A copy of state/ (rows the server sent, kept across patches) is published under _state/.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CACHE } from './lib/gamedata.mjs';

const ROOT = path.join(CACHE, '..', '..');
const SITE = path.join(ROOT, 'site');
const STATE = path.join(ROOT, 'state');
const BRANCH = 'gh-pages';

function git(args, cwd = ROOT, check = true) {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
	if (check && result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
	return result;
}

function ensureSiteRepo() {
	fs.mkdirSync(SITE, { recursive: true });
	if (fs.existsSync(path.join(SITE, '.git'))) return;
	const remote = git(['remote', 'get-url', 'origin']).stdout.trim();
	git(['init', '-q', '-b', BRANCH], SITE);
	git(['remote', 'add', 'origin', remote], SITE);
	if (git(['fetch', '-q', '--depth', '1', 'origin', BRANCH], SITE, false).status === 0) {
		git(['reset', '-q', '--soft', 'FETCH_HEAD'], SITE);
	}
}

// Brings state/ back from the published copy when this checkout has none. Returns true if it did.
export function restoreState() {
	if (fs.existsSync(path.join(STATE, 'rows'))) return false;
	if (git(['remote', 'get-url', 'origin'], ROOT, false).status !== 0) return false;
	ensureSiteRepo();
	if (git(['checkout', '-q', 'FETCH_HEAD', '--', '_state'], SITE, false).status !== 0) return false;
	fs.cpSync(path.join(SITE, '_state'), STATE, { recursive: true });
	return true;
}

// Returns false when nothing changed.
export function publish(message) {
	ensureSiteRepo();
	for (const name of fs.readdirSync(SITE)) {
		if (name !== '.git') fs.rmSync(path.join(SITE, name), { recursive: true, force: true });
	}
	fs.cpSync(path.join(ROOT, 'docs'), SITE, { recursive: true });
	fs.cpSync(STATE, path.join(SITE, '_state'), { recursive: true });
	fs.rmSync(path.join(SITE, '_state', 'update.log'), { force: true });
	fs.writeFileSync(path.join(SITE, '.nojekyll'), '');
	git(['add', '-A'], SITE);
	const hasHead = git(['rev-parse', '--verify', '-q', 'HEAD'], SITE, false).status === 0;
	if (hasHead && git(['diff', '--cached', '--quiet'], SITE, false).status === 0) return false;
	git(['commit', '-q', ...(hasHead ? ['--amend'] : []), '-m', message], SITE);
	git(['push', '-q', '--force', 'origin', `HEAD:${BRANCH}`], SITE);
	git(['reflog', 'expire', '--expire=now', '--all'], SITE, false);
	git(['gc', '-q', '--prune=now'], SITE, false);
	return true;
}
