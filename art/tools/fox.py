"""Bramble the fox: a Gemini sheet of 4 trotting, 4 sitting and 4 sleeping frames (one row each,
an extra row is ignored) in, a sprite sheet out: trot right, trot left, sit, sleep, in 32 by 32 cells.

Usage: python3 fox.py sheet.jpg outdir"""
import sys
import os
import tempfile
import numpy as np
from PIL import Image
from split_sheet import split, is_bg
from sprite import shrink, finish

W = H = 32


def build(src: str, outdir: str, rows_in_sheet: list[int]) -> None:
    tmp = tempfile.mkdtemp()
    names = [f'{r}_{i}' for r, n in enumerate(rows_in_sheet) for i in range(n)]
    split(src, tmp, 'f', rows_in_sheet, names)
    rows = [[np.asarray(Image.open(os.path.join(tmp, f'f_{r}_{i}.png')).convert('RGB')) for i in range(4)] for r in range(3)]
    # One scale for every pose so the fox doesn't grow when he sits down.
    def extent(f):
        ys, xs = np.where(~is_bg(f))
        return max(np.ptp(ys), np.ptp(xs)) + 1
    scale = (W - 2) / max(extent(f) for r in rows for f in r)
    cells = [[np.pad(shrink(f, scale, W - 2, H), ((0, 0), (1, 1), (0, 0))) for f in r] for r in rows]
    grid = [cells[0], [c[:, ::-1] for c in cells[0]], cells[1], cells[2]]
    sheet = np.concatenate([np.concatenate(r, 1) for r in grid], 0)
    out = finish(sheet, W, H)
    os.makedirs(outdir, exist_ok=True)
    Image.fromarray(out, 'RGBA').save(os.path.join(outdir, 'bramble.png'))
    z = 8
    frames = []
    for i in range(4):
        canvas = Image.new('RGB', (4 * W * z + 50, H * z + 20), (152, 196, 112))
        for k in range(4):
            cell = Image.fromarray(out[k * H:(k + 1) * H, i * W:(i + 1) * W], 'RGBA').resize((W * z, H * z), Image.NEAREST)
            canvas.paste(cell, (10 + k * (W * z + 10), 10), cell)
        frames.append(canvas)
    frames[0].save(os.path.join(outdir, 'bramble_preview.gif'), save_all=True, append_images=frames[1:], duration=200, loop=0)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else [4, 4, 4])
