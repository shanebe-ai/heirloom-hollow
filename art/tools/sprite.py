"""A Gemini walking sheet in, a game ready sprite sheet out.

Usage: python3 sprite.py sheet.jpg outdir name width height
The sheet is 3 rows of 4 frames: walking down, walking right, walking up. Left is right mirrored.
Writes outdir/name_walk.png: 4 rows (down, left, right, up) of 4 frames, each width by height,
plus name_walk_preview.gif, a big animated preview."""
import sys
import os
import tempfile
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from split_sheet import split, is_bg
from pixelize import OUTLINE

ROWS = ['down', 'right', 'up']


def cut_frames(src: str) -> list[list[np.ndarray]]:
    tmp = tempfile.mkdtemp()
    names = [f'{r}{i}' for r in ROWS for i in range(4)]
    split(src, tmp, 'f', [4, 4, 4], names)
    return [[np.asarray(Image.open(os.path.join(tmp, f'f_{r}{i}.png')).convert('RGB')) for i in range(4)] for r in ROWS]


def shrink(frame: np.ndarray, scale: float, w: int, h: int) -> np.ndarray:
    """Area averages the figure down and stands it on the bottom centre of a w by h cell."""
    # Grow the background a little so the pink halo around the figure goes with it.
    # Also any pixel tinted towards magenta (green well below both red and blue): that's the JPEG halo,
    # never her own colour.
    f = frame.astype(int)
    # Measured against the weaker of red and blue, so lilac hair (plenty of green) is safe.
    lo = np.minimum(f[..., 0], f[..., 2])
    tint = (lo > 110) & (f[..., 1] < 0.45 * lo)
    # Only next to the background: a pink flower in the middle of an apron is hers.
    near_bg = np.asarray(Image.fromarray((is_bg(frame) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    tint &= near_bg
    bg = Image.fromarray(((is_bg(frame) | tint) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    solid = np.asarray(bg) == 0
    # Keep only the figure itself: stray specks (a see through veil, a sparkle) are dropped.
    from scipy import ndimage
    lab, n = ndimage.label(solid)
    if n > 1:
        solid = lab == np.bincount(lab[lab > 0]).argmax()
    ys, xs = np.where(solid)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([frame[y0:y1, x0:x1] * solid[y0:y1, x0:x1, None], solid[y0:y1, x0:x1] * 255]).astype(np.uint8)
    nw, nh = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    small = np.asarray(Image.fromarray(rgba, 'RGBA').resize((nw, nh), Image.BOX)).astype(np.float32)
    al = small[..., 3:4]
    small[..., :3] = small[..., :3] / np.maximum(al / 255, 1e-3)
    cell = np.zeros((h, w, 4), np.float32)
    ox, oy = (w - nw) // 2, h - 1 - nh  # one pixel left under the feet for the outline
    cell[max(0, oy):oy + nh, max(0, ox):ox + nw] = small[max(0, -oy):, max(0, -ox):][: h - max(0, oy), : w - max(0, ox)]
    return cell


def finish(sheet: np.ndarray, w: int, h: int) -> np.ndarray:
    """Shared palette, halo cleanup and outline for a grid of w by h cells."""
    solid = sheet[..., 3] > 110
    # One palette for the whole sheet, so a colour never flickers between frames.
    # The palette is picked from her pixels only, so empty space doesn't use up colours.
    rgb = Image.fromarray(np.clip(sheet[..., :3], 0, 255).astype(np.uint8), 'RGB')
    rgb = np.asarray(ImageEnhance.Color(rgb).enhance(float(os.environ.get('HH_SAT', 1.2))))
    px = Image.fromarray(rgb[solid][None, :, :], 'RGB')
    pal = px.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = np.asarray(Image.fromarray(rgb, 'RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'))
    out = np.zeros(sheet.shape, np.uint8)
    out[..., :3] = q
    out[..., 3] = np.where(solid, 255, 0)
    # Any edge pixel still tinted pink from the background becomes outline instead.
    o = out[..., :3].astype(int)
    lo = np.minimum(o[..., 0], o[..., 2])
    pink = np.zeros_like(solid)
    # On the very edge, anything pink at all is halo (red hair next to magenta blends into it).
    near = np.zeros_like(solid)
    for r in range(sheet.shape[0] // h):
        for c in range(sheet.shape[1] // w):
            s_ = solid[r * h:(r + 1) * h, c * w:(c + 1) * w]
            p_ = np.pad(~s_, 1)
            near[r * h:(r + 1) * h, c * w:(c + 1) * w] = s_ & (p_[:-2, 1:-1] | p_[2:, 1:-1] | p_[1:-1, :-2] | p_[1:-1, 2:])
    pink |= near & (o[..., 2] > o[..., 1] + 30) & (o[..., 0] > o[..., 1] + 60)
    pink |= near & (lo > 100) & (o[..., 1] < 0.5 * lo)
    # Pure magenta anywhere (a gap between the legs) is background that got trapped.
    pink |= solid & (lo > 120) & (o[..., 1] < 0.35 * lo)
    out[pink, :3] = OUTLINE
    # Outline per cell so neighbours never join up.
    for r in range(sheet.shape[0] // h):
        for c in range(sheet.shape[1] // w):
            s = solid[r * h:(r + 1) * h, c * w:(c + 1) * w]
            pad = np.pad(s, 1)
            edge = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~s
            blk = out[r * h:(r + 1) * h, c * w:(c + 1) * w]
            blk[edge, :3] = OUTLINE
            blk[edge, 3] = 255
    return out


def build(src: str, outdir: str, name: str, w: int, h: int) -> None:
    rows = cut_frames(src)
    heights = [np.ptp(np.where((~is_bg(f)).any(1))[0]) + 1 for r in rows for f in r]
    scale = (h - 2) / max(heights)  # the tallest frame fills the cell, with room for the outline
    cells = [[shrink(f, scale, w - 2, h) for f in r] for r in rows]
    cells = [[np.pad(c, ((0, 0), (1, 1), (0, 0))) for c in r] for r in cells]
    cells = {'down': cells[0], 'right': cells[1], 'up': cells[2], 'left': [c[:, ::-1] for c in cells[1]]}
    order = ['down', 'left', 'right', 'up']
    sheet = np.concatenate([np.concatenate(cells[d], 1) for d in order], 0)
    out = finish(sheet, w, h)
    os.makedirs(outdir, exist_ok=True)
    Image.fromarray(out, 'RGBA').save(os.path.join(outdir, f'{name}_walk.png'))
    # Preview: all four directions walking side by side, big, on grass.
    z = 8
    frames = []
    for i in [0, 1, 2, 3]:
        canvas = Image.new('RGB', (4 * w * z + 50, h * z + 20), (152, 196, 112))
        for k, d in enumerate(order):
            cell = Image.fromarray(out[order.index(d) * h:(order.index(d) + 1) * h, i * w:(i + 1) * w], 'RGBA')
            canvas.paste(cell.resize((w * z, h * z), Image.NEAREST), (10 + k * (w * z + 10), 10), cell.resize((w * z, h * z), Image.NEAREST))
        frames.append(canvas)
    frames[0].save(os.path.join(outdir, f'{name}_walk_preview.gif'), save_all=True, append_images=frames[1:], duration=160, loop=0)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]))
