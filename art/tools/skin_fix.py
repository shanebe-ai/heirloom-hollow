"""Gemini sometimes paints a light skin tone bright yellow. This shifts strong yellows
toward a warm light tan, leaving everything else alone.

Usage: python3 skin_fix.py in.jpg out.png"""
import sys
import numpy as np
from PIL import Image

im = Image.open(sys.argv[1]).convert('RGB')
hsv = np.asarray(im.convert('HSV')).astype(np.float32)
h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
yellow = (h > 33) & (h < 66) & (s > 0.3) & (v > 0.4)
hsv[..., 0] = np.where(yellow, 26 * 255 / 360, hsv[..., 0])
hsv[..., 1] = np.where(yellow, s * 0.55 * 255, hsv[..., 1])
hsv[..., 2] = np.where(yellow, np.minimum(1, v * 1.02) * 255, hsv[..., 2])
Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB').save(sys.argv[2])
