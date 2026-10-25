#!/bin/sh
# Rebuilds every portrait and sprite from the raw Gemini images in source/.
# Run from the art folder: sh tools/build_all.sh
set -e
T=tools
F5="neutral happy shy sad surprised"
for c in rosie; do for e in neutral happy shy sad surprised; do python3 $T/pixelize.py source/${c}_$e.jpg 96 40 portraits/${c}_$e.png; done; done
for c in kai mira theo silas; do python3 $T/sheet.py source/${c}_sheet.jpg portraits $c 3,2 $F5; done
HH_SAT=1.0 python3 $T/sheet.py source/june_sheet.jpg portraits june 3,2 $F5
town() { s=$1; shift; a=""; for n in "$@"; do a="$a ${n}_neutral ${n}_happy ${n}_sad"; done; python3 $T/sheet.py source/${s}_sheet.jpg portraits . 3,3,3 $a; }
town town1 mayor pip poppy
town town2 fennick ines tibbs
town town3 wren ollie clementine
town town4 benji gull lottie
# Wide hats fool the head measurement on this sheet; set the frame by hand.
HH_FRAME=760 town town5 hugo jed marigold
tmp=$(mktemp -d)
for c in rosie kai mira theo silas mayor pip tibbs ines fennick wren clementine benji lottie marigold jed hugo gull ollie poppy; do python3 $T/sprite.py source/${c}_walk_sheet.jpg $tmp $c 32 48; cp $tmp/${c}_walk.png sprites/; done
HH_SAT=1.0 python3 $T/sprite.py source/june_walk_sheet.jpg $tmp june 32 48; cp $tmp/june_walk.png sprites/
# Where Gemini drew a frame facing the wrong way, reuse a good frame from the same row.
# fix NAME ROW TO FROM   (rows: 0 down, 1 left, 2 right, 3 up; frames 0 to 3)
fix() { python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('sprites/$1_walk.png')).copy(); r,t,f=$2,$3,$4
a[r*48:(r+1)*48,t*32:(t+1)*32]=a[r*48:(r+1)*48,f*32:(f+1)*32]; Image.fromarray(a).save('sprites/$1_walk.png')"; }
fix tibbs 3 2 0
fix ines 3 2 0
fix benji 0 3 1
fix fennick 0 3 1
fix hugo 3 2 0
fix ollie 3 2 0
python3 $T/fox.py source/bramble_sheet.jpg $tmp 4,4,4,4; cp $tmp/bramble.png sprites/
