# Heirloom Hollow

A cosy farming life game for phones. Inherit your grandmother's overgrown farm, fall in love, raise a family, and one day hand the farm to your child, who carries on as the next player.

Live at http://37.27.80.77:3005

## What works so far

* Walk Hazel's farm by tapping where to go (arrow keys or WASD on a computer)
* Visitors wander about: tap them to chat, type anything, and they answer in their own voice with a face to match
* Bramble the fox sits by the pond, and curls up asleep once night falls
* A day clock: a day lasts 12 real minutes and dusk falls from 6pm

## The townsfolk's voices

Townsfolk talk through free AI providers, tried in order: ai&, then Groq, then Gemini. If none answer, they use their written lines, so the game never waits on the AI. The game decides everything else; the AI only chooses what they say and which face they make.

* Each character's personality is in `server/characters.js`
* Replies are checked before they are shown: short, in character, no swearing or anything unsuitable, and never "as an AI"
* Each player gets a few lines a minute, with a daily cap for the whole server
* Characters remember the last few things said to them (kept in the player's browser)
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
