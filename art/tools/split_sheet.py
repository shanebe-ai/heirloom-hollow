"""Cuts a Gemini sheet of portraits on magenta into one image per portrait.

Usage: python3 split_sheet.py sheet.jpg outdir name 3,2 expr1 expr2 ...
The 3,2 is how many portraits sit in each row, top to bottom. Writes outdir/name_expr1.png and so on,
in reading order. Each piece keeps a magenta border so pixelize.py can clean it like a single portrait.
Portraits may touch (shoulders often do): each row is cut where the least of the drawing crosses."""
import sys
import os
import numpy as np
from PIL import Image
from scipy import ndimage

MAGENTA = (255, 0, 255)


def is_bg(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 170) & (b > 170) & (g < 70) & (np.abs(r - b) < 90)


def bands(solid_1d: np.ndarray, count: int) -> list[tuple[int, int]]:
    """Splits a 1D profile into `count` spans, cutting at the emptiest point near each even division."""
    n = len(solid_1d)
    nz = np.where(solid_1d > 0)[0]
    lo, hi = nz.min(), nz.max() + 1
    cuts = [lo]
    for k in range(1, count):
        guess = lo + (hi - lo) * k // count
        win = max(10, (hi - lo) // (count * 3))
        a, b = max(lo, guess - win), min(hi, guess + win)
        cuts.append(a + int(np.argmin(solid_1d[a:b])))
    cuts.append(hi)
    return [(cuts[i], cuts[i + 1]) for i in range(count)]


def split(src: str, outdir: str, name: str, layout: list[int], exprs: list[str]) -> None:
    im = np.asarray(Image.open(src).convert('RGB'))
    solid = ~is_bg(im)
    solid[:12], solid[-12:], solid[:, :12], solid[:, -12:] = False, False, False, False
    if sum(layout) != len(exprs):
        sys.exit(f'layout holds {sum(layout)} portraits but {len(exprs)} names were given')
    os.makedirs(outdir, exist_ok=True)
    names = iter(exprs)
    for (y0, y1), per_row in zip(bands(solid.sum(1), len(layout)), layout):
        row = solid[y0:y1]
        for x0, x1 in bands(row.sum(0), per_row):
            cell = row[:, x0:x1]
            # Keep only the biggest drawing in the cell, so a neighbour's elbow doesn't come along.
            labels, n = ndimage.label(ndimage.binary_closing(cell, iterations=4))
            own = labels == np.bincount(labels[labels > 0]).argmax()
            piece = im[y0:y1, x0:x1].copy()
            piece[~own] = MAGENTA
            pad = 40
            out = np.full((piece.shape[0] + 2 * pad, piece.shape[1] + 2 * pad, 3), MAGENTA, np.uint8)
            out[pad:-pad, pad:-pad] = piece
            Image.fromarray(out).save(os.path.join(outdir, f'{name}_{next(names)}.png'))


if __name__ == '__main__':
    split(sys.argv[1], sys.argv[2], sys.argv[3], [int(x) for x in sys.argv[4].split(',')], sys.argv[5:])
