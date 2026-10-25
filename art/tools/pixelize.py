"""Turns a Gemini "pixel art" image into true pixel art: cut out the magenta, shrink to a real
pixel grid, cut the colours down to a small palette, and give it a clean warm outline."""
import sys
import os
import numpy as np
from PIL import Image

OUTLINE = (74, 40, 38)  # deep warm brown


def magenta_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Magenta and the pink halo it bleeds into the edges: red and blue high, green well below both.
    # Only true magenta: a lilac bow or a pink blush is not background.
    # Gemini's magenta has almost no green; purple scarves and pink flowers do, so keep the bar low.
    m = (r > 170) & (b > 170) & (g < 70) & (np.abs(r - b) < 90)
    # The outer few pixels of a generated image are often a stray frame line: treat them as background.
    m[:12, :] = m[-12:, :] = True
    m[:, :12] = m[:, -12:] = True
    return m


def pixelize(src: str, size: int, colours: int, out: str, side: int | None = None) -> Image.Image:
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    bg = magenta_mask(a)
    # Pull the edge in by a few pixels so no pink halo survives the shrink.
    from PIL import ImageFilter
    grow = Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    bg = np.asarray(grow) > 0
    # Frame on the head, not the whole image, so every portrait of a character matches:
    # find the top of the head, measure how wide the head is, and size the frame from that.
    solid_full = ~bg
    rows = np.where(solid_full.any(1))[0]
    top = rows.min()
    widest, head_left, head_right = 0, 0, 0
    for y in range(top, min(top + 2000, a.shape[0])):
        xs = np.where(solid_full[y])[0]
        if len(xs) and xs.max() - xs.min() > widest:
            widest, head_left, head_right = xs.max() - xs.min(), xs.min(), xs.max()
        if widest and y - top > 1.0 * widest:
            break
    # Faces cut from one sheet were drawn at one scale: pass the same side to all of them so they match.
    side = side or int(widest * 1.55)
    cx = (head_left + head_right) // 2
    box = (cx - side // 2, top - int(side * 0.05), cx - side // 2 + side, top - int(side * 0.05) + side)
    rgba = np.dstack([a, (~bg).astype(np.float32) * 255]).astype(np.uint8)
    crop = Image.fromarray(rgba, 'RGBA').crop(box)
    # Area average down to the real grid, alpha weighted so the magenta never mixes in.
    c = np.asarray(crop).astype(np.float32)
    alpha = c[..., 3:4] / 255
    pre = Image.fromarray(np.clip(np.dstack([c[..., :3] * alpha, alpha * 255]), 0, 255).astype(np.uint8), 'RGBA')
    small = np.asarray(pre.resize((size, size), Image.BOX)).astype(np.float32)
    al = small[..., 3]
    colour = small[..., :3] / np.maximum(al[..., None] / 255, 1e-3)
    solid = al > 140
    # A small palette, picked from the subject itself.
    from PIL import ImageEnhance
    pal_img = Image.fromarray(np.clip(colour, 0, 255).astype(np.uint8), 'RGB')
    # Shrinking averages colours together and dulls them; give back a little life.
    pal_img = ImageEnhance.Color(pal_img).enhance(float(os.environ.get('HH_SAT', 1.25)))
    pal_img = ImageEnhance.Contrast(pal_img).enhance(1.05)
    q = pal_img.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    qa = np.asarray(q).copy()
    out_a = np.zeros((size, size, 4), np.uint8)
    out_a[..., :3] = qa
    out_a[..., 3] = np.where(solid, 255, 0)
    # Outline: any empty pixel touching the subject gets the warm brown, so no edge is left soft.
    # Neighbours without wrapping round, so a subject cut off at the bottom doesn't outline the top.
    pad = np.pad(solid, 1)
    edge = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    edge &= ~solid
    out_a[edge, :3] = OUTLINE
    out_a[edge, 3] = 255
    result = Image.fromarray(out_a, 'RGBA')
    result.save(out)
    return result


if __name__ == '__main__':
    src, size, colours, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    pixelize(src, size, colours, out, int(sys.argv[5]) if len(sys.argv) > 5 else None)
