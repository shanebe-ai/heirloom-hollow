# Heirloom Hollow

A cosy farming life game for phones. Inherit your grandmother's overgrown farm, fall in love, raise a family, and one day hand the farm to your child, who carries on as the next player.

Live at http://37.27.80.77:3005

## What works so far

**Moving in**
* Choose your farmer (Rosa, Rowan, Ivy or Reed), a name of your own and a backpack, a purse or no bag. Names are kind and one of a kind: Rosie belongs to the florist
* A password keeps the farm yours. Log in on any phone with your farmer's name and password, log out from the Farm menu, or carry the farm code across
* Hazel's letter and a first steps guide for new farmers

**The farm**
* Tap to walk (arrow keys or WASD on a computer). Hoe, plant, water from the pond, and pick ripe crops: turnips, strawberries, potatoes and pink tulips
* The shipping box pays overnight; sleep in the farmhouse bed, or pass out at 2am and lose a few coins
* A day lasts 12 real minutes, dusk falls from 6pm, and seasons turn every 14 days
* Marigold's flower stall stands on the farm, and Bramble the fox sits by the pond
* Saves live on the server, keyed by the farm

**Hollow Square**
* Walk off the east edge of the farm into town: a square with a fountain and noticeboard, the river, a bridge and a dock
* Building fronts with hanging signs: the General Store, Café, Bakery, Library, Mayor's House, Clinic, Smithy, Weaving Shop, Tea House, Pottery and two cottages. Tap a door for its shop, or a sign saying when it opens
* The General Store sells seeds, fertiliser (one extra stage on the first watered night) and a bigger watering can that holds 40. It keeps 9 to 5 and shuts on rest days
* Meals restore energy: tea and pie at the café (once each a day), bread at the bakery

**June's ranch**
* East of town along the ranch road: June's ranch house, the barn, a paddock of cows and hens, and Hugo's beehives
* Hugo's honey shed sells honey on toast

**Everyone**
* All 24 townsfolk keep daily schedules (`shared/schedules.js`): they walk between their spots as the clock passes the times, go home at night, and two of them stroll out to the farm each day
* Names show above people when you are near or tap them
* Tap anyone to talk. They answer in their own voice with a face to match, and know where they are and what they are doing

## The townsfolk's voices

Townsfolk talk through free AI providers, tried in order: ai&, then Groq, then Gemini. If none answer, they use their written lines, so the game never waits on the AI. The game decides everything else; the AI only chooses what they say and which face they make.

* Each character's personality is in `server/characters.js`
* Replies are checked before they are shown: short, in character, no swearing or anything unsuitable, and never "as an AI"
* Each player gets a few lines a minute, with a daily cap for the whole server
* Characters remember the last few things said to them, kept in the farm's save so it follows the farmer to any phone
* `/api/health` shows which voices are switched on and how their last call went, never the keys

Keys go in `.env` (copy `.env.example`). Leave them blank and everyone uses written lines.

## Running it

    npm ci
    npm run build
    npm start

Then open http://localhost:3005

Tests: `npm test`

## The art

Every character is drawn on a magenta background, then cleaned into true pixel art by the scripts in `art/tools`. To rebuild all portraits and sprites from the raw images in `art/source`:

    cd art && sh tools/build_all.sh

## Deploying

Server 1 checks GitHub every minute (`scripts/autodeploy.sh`, run from root's crontab). When main has new commits it pulls them, rebuilds and restarts the game with pm2. Its log is in /var/log/heirloom-deploy.log.
