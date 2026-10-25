"""One Gemini sheet of a character's faces in, finished 96 by 96 portraits out.

Usage: python3 sheet.py sheet.jpg portraits_dir name 3,2 neutral happy shy sad surprised
Cuts the sheet, then cleans every face at one shared frame size so they all line up.
For a sheet of several villagers, pass . as the name and full names: . 3,3,3 mayor_neutral mayor_happy ..."""
import sys
import os
import tempfile
import numpy as np
from PIL import Image, ImageFilter
from split_sheet import split
from pixelize import pixelize, magenta_mask


def head_side(path: str) -> int:
    """The frame size pixelize would pick for this face on its own."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    bg = np.asarray(Image.fromarray((magenta_mask(a) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    solid = ~bg
    top = np.where(solid.any(1))[0].min()
    widest = 0
    for y in range(top, a.shape[0]):
        xs = np.where(solid[y])[0]
        if len(xs):
            widest = max(widest, xs.max() - xs.min())
        if widest and y - top > widest:
            break
    return int(widest * 1.55)


if __name__ == '__main__':
    src, outdir, name, layout, exprs = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:]
    tmp = tempfile.mkdtemp()
    split(src, tmp, name, [int(x) for x in layout.split(',')], exprs)
    full = [e if name == '.' else f'{name}_{e}' for e in exprs]
    pieces = [os.path.join(tmp, f'{name}_{e}.png') for e in exprs]
    # Spiky hair or a turned head can fool one face's measurement; the middle value of the set is steady.
    side = int(os.environ.get('HH_FRAME') or np.median([head_side(p) for p in pieces]))
    for p, f in zip(pieces, full):
        pixelize(p, 96, 40, os.path.join(outdir, f'{f}.png'), side)
    print(f'{name}: {len(exprs)} faces, frame {side}px')
