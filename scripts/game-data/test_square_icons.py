import importlib.util
import unittest
from pathlib import Path
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('square_icons', Path(__file__).with_name('prepare-square-icons.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SquareIconTests(unittest.TestCase):
    def test_tall_wide_and_small_icons_keep_ratio_and_center(self):
        for width, height in [(12, 60), (60, 12), (17, 31), (1, 1)]:
            with self.subTest(size=(width, height)):
                src = Image.new('RGBA', (100, 100))
                src.paste((120, 180, 230, 255), (3, 5, 3 + width, 5 + height))
                out = m.square(src)
                self.assertEqual(out.size, (128, 128))
                l, t, r, b = out.getchannel('A').getbbox()
                self.assertEqual(max(r-l, b-t), 120)
                self.assertLessEqual(abs(l - (128-r)), 1)
                self.assertLessEqual(abs(t - (128-b)), 1)
                self.assertLessEqual(abs((r-l) - width * 120/max(width,height)), .5)
                self.assertLessEqual(abs((b-t) - height * 120/max(width,height)), .5)
                self.assertEqual(out.getpixel((0, 0))[3], 0)

    def test_empty_image_is_not_published(self):
        with self.assertRaisesRegex(ValueError, 'Empty'):
            m.square(Image.new('RGBA', (48, 48)))

    def test_neutral_layers_are_tinted_with_the_read_back_colors(self):
        base = np.zeros((24, 24, 4), np.uint8)
        base[2:10, 2:10] = (100, 100, 100, 255)
        trim_layer = np.zeros((24, 24, 4), np.uint8)
        trim_layer[12:20, 12:20] = (140, 140, 140, 255)
        ref = m.compose([base, trim_layer], [(163, 211, 156), (180, 189, 194)])
        self.assertEqual(tuple(ref[5, 5]), (107, 155, 100, 255))
        self.assertEqual(m.fit_colors([base, trim_layer], ref), [(163, 211, 156), (180, 189, 194)])
        found = m.rebuild([base, trim_layer], ref)
        self.assertEqual(found[2:4], (1., 0.))

    def test_effect_frames_missing_from_the_registered_image_are_dropped(self):
        body = np.zeros((24, 24, 4), np.uint8)
        body[4:20, 4:20] = (120, 120, 120, 255)
        glow = np.zeros((24, 24, 4), np.uint8)
        glow[2:22, 2] = (200, 200, 200, 255)
        ref = m.compose([body], [(90, 60, 30)])
        found = m.rebuild([body, glow], ref)
        self.assertEqual(len(found[4]), 1)
        self.assertEqual(found[2:4], (1., 0.))

    def test_wrong_silhouette_and_color_are_measured(self):
        ref = np.full((24, 24, 4), (255, 0, 0, 255), np.uint8)
        other = np.full((24, 24, 4), (0, 255, 0, 255), np.uint8)
        self.assertGreater(m.compare(other, ref)[1], m.MAX_ERROR)
        other = np.zeros((24, 24, 4), np.uint8)
        other[:, :12] = (255, 0, 0, 255)
        self.assertLess(m.compare(other, ref)[0], m.MIN_IOU)

    def test_inventory_image_names(self):
        self.assertEqual(m.image_names('item_book_001'), [['item_book_001']])
        self.assertEqual(m.image_names('item_book_001;item_book_001_seal'),
                         [['item_book_001'], ['item_book_001_seal'], ['item_book_001', 'item_book_001_seal']])
        self.assertEqual(m.image_names(';item_coin_001<10;item_coin_002<100;item_coin_003'),
                         [['item_coin_001'], ['item_coin_002'], ['item_coin_003']])

if __name__ == '__main__':
    unittest.main()
