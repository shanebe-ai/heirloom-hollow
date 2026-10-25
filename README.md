# Heirloom Hollow

A cosy farming life game for phones. Inherit your grandmother's overgrown farm, fall in love, raise a family, and one day hand the farm to your child, who carries on as the next player.

Live at http://37.27.80.77:3005

## What works so far

* Walk Hazel's farm by tapping where to go (arrow keys or WASD on a computer)
* Visitors wander about: tap them to talk, with their portrait
* Bramble the fox sits by the pond, and curls up asleep once night falls
* A day clock: a day lasts 12 real minutes and dusk falls from 6pm

## Running it

    npm ci
    npm run build
    npm start

Then open http://localhost:3005

## The art

Every character is drawn on a magenta background, then cleaned into true pixel art by the scripts in `art/tools`. To rebuild all portraits and sprites from the raw images in `art/source`:

    cd art && sh tools/build_all.sh

## Deploying

Every push to main deploys to server 1 through GitHub Actions (`.github/workflows/deploy.yml`), using the DEPLOY_HOST, DEPLOY_USER and DEPLOY_KEY repo secrets.
