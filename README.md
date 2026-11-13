# Item Database

Every World of Warcraft Forever item in one filterable list with in-game tooltips, hosted on GitHub Pages.
The data is read from the game's own files. Nothing is scraped from other websites. The one exception is
where items drop, which only the server knows: that comes from a local VMaNGOS database (see below).

## Using the site

- **Search box**: words match the name. Conditions can be typed too, for example
  `sword ilvl>=40 agi>10 q:rare is:boe "chance on hit"`. The `?` button lists the syntax. Press `/` to focus it.
- **Filters** on the left: quality, type and subtype, slot, item level, required level, usable by class,
  binding, properties (set piece, random enchantment, use effect, starts a quest and so on), and
  **Stats and values**, where any stat or number (damage per second, armor, speed, sell price...) can be
  compared with a value.
- **Columns**: click a header to sort. The Columns button adds any stat or value as a column. A stat you
  filter on is shown automatically.
- Hover an item for its tooltip, click it for a panel with the tooltip, every value, and the creatures and
  chests it drops from with their chances. The **Wowhead** link on each row opens the item on Wowhead.
- **Copy link** copies the address with all filters in it.
- `-is:test` (or the "Hide test and unused items" filter) hides developer items; `is:drop` lists items that
  drop from creatures or chests.

## Updating

| Script | What it does |
| --- | --- |
| `update.bat` | Build the data from the game files and publish the site |
| `preview.bat` | Build without publishing and open the site locally |
| `install-addon.bat` | Copy the Item Harvest addon into the game |
| `install-autostart.bat` | Run the watcher hidden at every Windows login: it rebuilds and publishes when the game is patched or the game cache changes |
| `uninstall-autostart.bat` | Stop the watcher and remove it from startup |
| `drops.bat` | Read where items drop from the VMaNGOS database into `tools/data/drops.json` |

Requires [bun](https://bun.sh), git and ImageMagick (`magick`). The first run of `update.bat` downloads the
tables (about 450 MB, kept in `tools/cache/`); later runs take about a minute.

### Items the server has not sent yet

About 12,700 items, most of the equipment, are **not in the game files**. The server sends an item the first
time the client asks about it, and the client keeps the answer in its cache. The build reads that cache, so
it only knows the items your client has seen. To get the rest:

1. Run `install-addon.bat` once and restart the game.
2. In game, type `/harvest`. It asks the server for every missing item, a few at a time (about 3 minutes).
3. Exit the game (the cache is written on exit), then run `update.bat`.

The footer of the site says how many items are still missing. Some IDs never get an answer because the
item does not exist on the server.

### When items change

- **Patch**: the build compares the live game version with the one it last built. A new version downloads
  the changed tables and rebuilds everything.
- **Hotfix** (a change without a patch): the game writes these to the same cache as above, after you have
  logged in. The next build picks them up.
- The game empties its cache on every patch. Rows learned from it are kept in `state/rows/`, so nothing is
  lost; an item changed on the server is corrected the next time your client is sent it (`/harvest reset`
  then `/harvest` asks for everything again).
- Every build records which items are new or changed. The site lists these under **Updates** in the filters,
  and an item's panel shows when it last changed.

### Drops

Loot tables are not in the game files. `tools/drops.mjs` reads them from a VMaNGOS world database (the
1.12 loot of creatures and chests, following reference tables and loot groups the way the server rolls them)
and writes `tools/data/drops.json`, which is committed; the build adds it to the site. So `update.bat` does
not need the database. Run `drops.bat` with the database running only to refresh the file.

## How it works

- `tools/lib/gamedata.mjs` downloads the client tables (DB2 files) for the live build from Blizzard's CDN,
  the same files the game installs, and applies the game cache (`Cache/ADB/enUS/DBCache.bin`).
- `tools/lib/items.mjs` turns the tables into item records and tooltip lines. Items do not store their
  numbers; they store formulas, which are computed the way the client does:
  - **Stats**: a share of the stat budget for the item level, quality and slot (`RandPropPoints`).
  - **Weapon damage**: damage per second by item level and quality (`ItemDamage*`), times speed, spread by
    the item's damage range.
  - **Armor**: `ItemArmorTotal` x `ItemArmorQuality` x `ArmorLocation`; shields from `ItemArmorShield`.
  - **Ratings** (dodge, crit, hit...) are shown as percentages using the `CombatRatings` game table.
  - **Stat wording** comes from the client's own strings (`TOOLTIP_ITEM_STAT_*`).
- `tools/lib/spelltext.mjs` fills in spell descriptions (`Restores $s1 health over $d.`) for Use, Equip and
  Chance on hit effects and set bonuses.
- Icons are cut from the game's textures into sheets (`docs/icons/`).
- `docs/` is the site: plain HTML, CSS and JavaScript, no build step. `tools/publish.mjs` pushes it to the
  `gh-pages` branch as a single commit that is replaced on every upload, so the repository does not grow.
- `state/` is not in git. A copy is published with the site under `_state/` and restored automatically on a
  fresh clone.

### Known limits

- **Durability** and **shield block** are not in the client files. They are modelled from known items:
  durability is exact for about four in five items and 5 off for the rest, mostly below item level 30.
- **Random enchantments**: the tooltip says `<Random enchantment>`; the possible suffixes are not listed.
- A few placeholders in spell text depend on the player (level, attack power) and are left out.
- Recipes show the item they create below their own tooltip.
- **Drops** are VMaNGOS's version of 1.12 loot, not Forever's own: items new in Forever have none, and
  Forever may have changed some chances. Each item lists its 40 likeliest sources; world drops have hundreds.
  Vendors, quest rewards and crafting are not listed as sources.

## Settings (`config.json`)

- `wow_path`: the game folder containing `Cache` and `Interface`.
- `product`, `region`, `locale`: which game and language to read (`wowf` is World of Warcraft Forever).
- `site_title`: header title.
- `push`: `false` to only build.
- `check_interval_minutes`: how often the watcher checks (default 15).
- `drops`: the VMaNGOS database for `drops.bat`, default
  `{"host": "127.0.0.1", "port": 3307, "user": "root", "database": "mangos", "patch": 10}` (add `password`
  if needed). Requires the `mariadb` command line client.

## Development

- `bun tools/dump.mjs ItemSparse Spell ...` writes tables as JSON to `tools/cache/json/` for inspection.
- `bun tools/verify.mjs` compares the built tooltips with a file of reference tooltips
  (`tools/cache/ah_items.json`, `{id: {name, tt}}`) and lists the most common differences.
