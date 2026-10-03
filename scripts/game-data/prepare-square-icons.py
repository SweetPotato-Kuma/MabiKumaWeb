"""Build centered 128px WebP item icons from local image data.

Uses Pillow and NumPy from the analyst Python environment. Does not run client
code, upload files, or change the source images. Existing icon hashes remain
the lookup keys; output filenames depend on the new image bytes.

Client inventory icons are neutral layers placed side by side in one texture,
one frame per dye slot. The game tints frame k with color k as
clamp(2 * grey + color - 256) and stacks the frames in order. Item colors are
picked per item from large palettes, so the colors are read back from the
registered image and the client layers are tinted with them.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import io
import json
import os
from pathlib import Path
import re
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image

MIN_IOU = .99
MAX_ERROR = 3.


def trim(image):
    image = image.convert('RGBA')
    box = image.getchannel('A').getbbox()
    if box is None:
        raise ValueError('Empty transparent image')
    return image.crop(box)


def square(image, size=128, padding=4):
    cropped = trim(image)
    ratio = (size - padding * 2) / max(cropped.size)
    scaled = cropped.resize(tuple(max(1, round(n * ratio)) for n in cropped.size), Image.Resampling.LANCZOS)
    scaled = trim(scaled)
    result = Image.new('RGBA', (size, size))
    result.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return result


def compare(candidate, reference):
    """Silhouette overlap and mean RGB error where both images are opaque."""
    a, b = candidate[..., 3] > 0, reference[..., 3] > 0
    iou = (a & b).sum() / max(1, (a | b).sum())
    both = (candidate[..., 3] == 255) & (reference[..., 3] == 255)
    if not both.any():
        return float(iou), 255.
    diff = np.abs(candidate[..., :3][both].astype(np.int32) - reference[..., :3][both].astype(np.int32))
    return float(iou), float(diff.mean())


def compose(frames, colors):
    """Tint each neutral frame with its dye color and stack them in order."""
    h, w = frames[0].shape[:2]
    rgb, alpha = np.zeros((h, w, 3)), np.zeros((h, w, 1))
    for frame, color in zip(frames, colors):
        tinted = np.clip(2 * frame[..., :3].astype(np.float64) + np.array(color) - 256, 0, 255)
        a = frame[..., 3:4] / 255.
        rgb = tinted * a + rgb * (1 - a)
        alpha = a + alpha * (1 - a)
    out = np.zeros((h, w, 4))
    out[..., :3] = np.divide(rgb, alpha, out=np.zeros_like(rgb), where=alpha > 0)
    out[..., 3:] = alpha * 255
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def fit_colors(frames, reference):
    """Read each frame's dye color from pixels where that frame is on top."""
    colors = []
    for k, frame in enumerate(frames):
        mask = (frame[..., 3] == 255) & (reference[..., 3] == 255)
        for later in frames[k + 1:]:
            mask &= later[..., 3] == 0
        color = []
        for c in range(3):
            target = reference[..., c][mask].astype(np.int32)
            grey = frame[..., c][mask].astype(np.int32)
            # Clamped pixels say nothing about the color.
            usable = (target > 0) & (target < 255)
            if not usable.any():
                break
            color.append(int(np.median(target[usable] - 2 * grey[usable] + 256)))
        colors.append(tuple(color) if len(color) == 3 else None)
    return colors


def rebuild(layers, reference):
    """Best tinted stack of client frames, dropping effect frames the registered image leaves out."""
    frames = [f for f in layers if f[..., 3].any()]

    def attempt(chosen):
        colors = fit_colors(chosen, reference)
        kept = [(f, c) for f, c in zip(chosen, colors) if c is not None]
        if not kept:
            return None
        image = compose([f for f, _ in kept], [c for _, c in kept])
        iou, error = compare(image, reference)
        return error + (1 - iou) * 100, image, iou, error, [f for f, _ in kept]

    best = attempt(frames) if frames else None
    while best is not None and len(best[4]) > 1:
        trials = [attempt([f for j, f in enumerate(best[4]) if j != k]) for k in range(len(best[4]))]
        trials = [t for t in trials if t is not None]
        better = min(trials, key=lambda t: t[0], default=None)
        if better is None or better[0] >= best[0]:
            break
        best = better
    return best


def split_frames(texture, width, height):
    count = max(1, texture.shape[1] // width)
    frames = []
    for k in range(count):
        frame = np.zeros((height, width, 4), np.uint8)
        part = texture[:height, k * width:(k + 1) * width]
        frame[:part.shape[0], :part.shape[1]] = part
        frames.append(frame)
    return frames


def image_names(value):
    """Icon names in File_InvImage. `a;b` stacks images, `;a<10;b` picks one by count."""
    tokens = [t.split('<')[0].strip() for t in value.split(';')]
    names = [t.lower() for t in tokens if t]
    sets = [[n] for n in names]
    if len(names) > 1 and '<' not in value:
        sets.append(names)
    return sets


def client_candidate(reference, name_sets, client):
    w, h = reference.shape[1], reference.shape[0]
    textures = {}

    def load(path):
        if path not in textures:
            with Image.open(path) as image:
                textures[path] = np.asarray(image.convert('RGBA'))
        return textures[path]

    best = None
    for names in name_sets:
        # Same name can exist in both icon folders with different drawings.
        options = [[]]
        for name in names:
            options = [o + [p] for o in options for p in client.get(name, [])]
        for paths in options:
            layers = [f for p in paths for f in split_frames(load(p), w, h)]
            if not layers:
                continue
            found = rebuild(layers, reference)
            if found and found[2] >= MIN_IOU and found[3] <= MAX_ERROR and (best is None or found[0] < best[0]):
                best = (found[0], Image.fromarray(found[1], 'RGBA'), ';'.join(str(p) for p in paths),
                        round(found[2], 5), round(found[3], 3))
    return best


def index_client(root):
    found = defaultdict(list)
    for pattern in ('*/data/gfx/image/*', '*/data/gfx/image2/inven/**/*'):
        for path in sorted(root.glob(pattern)):
            if path.suffix.lower() == '.dds' and path.is_file():
                found[path.stem.lower()].append(path)
    return dict(found)


def load_itemdb(root):
    names = {}
    for path in sorted(root.rglob('*.xml')):
        if not re.fullmatch(r'itemdb(_\w+)?\.xml', path.name, re.I):
            continue
        raw = path.read_bytes()
        text = raw.decode('utf-16') if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else raw.decode('utf-8-sig')
        for match in re.finditer(r'<Mabi_Item\s([^>]*?)/?>', text):
            attrs = dict(re.findall(r'(\w+)="([^"]*)"', match.group(1)))
            if 'ID' in attrs and attrs.get('File_InvImage'):
                names.setdefault(attrs['ID'], attrs['File_InvImage'])
    return names


_client = None


def init_worker(client_root):
    global _client
    _client = index_client(client_root)


def process_icon(job):
    root, output, old_file, ids, name_sets, registered = job
    try:
        # Verify the cached image really belongs to the registered content hash.
        sources = ([registered / old_file] if registered else []) + [
            root / f'.cache/item-cards/icons/{i}.png' for i in ids]
        source = next((p for p in sources if p.is_file()
                       and hashlib.sha256(p.read_bytes()).hexdigest()[:16] + '.png' == old_file), None)
        if source is None:
            raise ValueError('No matching registered image bytes in local cache')
        with Image.open(source) as img:
            reference = img.convert('RGBA')
        if reference.getchannel('A').getbbox() is None:
            return dict(old=old_file, ids=ids, skipped='empty-transparent-reference')
        chosen = client_candidate(np.asarray(reference), name_sets, _client)
        image = chosen[1] if chosen else reference
        normalized = square(image)
        encoded = io.BytesIO()
        normalized.save(encoded, 'WEBP', lossless=True, exact=True, method=4)
        raw = encoded.getvalue()
        filename = hashlib.sha256(raw).hexdigest()[:20] + '.webp'
        dest = output / filename
        if not dest.exists():
            temporary = dest.with_suffix(f'.{os.getpid()}.tmp')
            temporary.write_bytes(raw)
            os.replace(temporary, dest)
        with Image.open(dest) as saved:
            rgba = saved.convert('RGBA')
            if rgba.size != (128, 128) or rgba.tobytes() != normalized.tobytes():
                raise ValueError('WebP pixel verification failed')
            left, top, right, bottom = rgba.getchannel('A').getbbox()
            if abs(left - (128 - right)) > 1 or abs(top - (128 - bottom)) > 1:
                raise ValueError('Visible bounds are not centered')
        return dict(old=old_file, new=filename, ids=ids,
                    method='client' if chosen else 'registered-fallback',
                    reference=str(source), source=chosen[2] if chosen else str(source),
                    iou=chosen[3] if chosen else None, error=chosen[4] if chosen else None,
                    source_candidates=len(name_sets), bbox=[left, top, right, bottom])
    except Exception as exc:
        return dict(old=old_file, ids=ids, error=str(exc))


def build(args):
    root = args.root.resolve()
    itemdb = load_itemdb(args.itemdb.resolve())
    if not itemdb:
        raise SystemExit(f'No ItemDB XML under {args.itemdb}')
    uploaded = json.loads((root / '.cache/item-cards/uploaded.json').read_text(encoding='utf-8'))
    groups = defaultdict(list)
    for item_id, name in uploaded.items():
        groups[name].append(item_id)
    if args.live_index:
        for entry in json.loads(args.live_index.read_text(encoding='utf-8-sig')):
            for item_id in entry['ids']:
                if item_id not in groups[entry['file']]:
                    groups[entry['file']].append(item_id)
            groups.setdefault(entry['file'], [])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    report_root = args.report.resolve()
    report_root.mkdir(parents=True, exist_ok=True)
    aliases, rows, errors, skipped = {}, [], [], []

    def name_sets(ids):
        sets = []
        for i in ids:
            for names in image_names(itemdb.get(i, '')):
                if names not in sets:
                    sets.append(names)
        return sets

    jobs = [(root, output, old, ids, name_sets(ids), args.live_icons)
            for old, ids in sorted(groups.items())]
    if args.limit:
        jobs = jobs[:args.limit]
    with ProcessPoolExecutor(max_workers=args.workers, initializer=init_worker,
                             initargs=(args.client_icons.resolve(),)) as pool:
        results = pool.map(process_icon, jobs, chunksize=16)
        for number, row in enumerate(results, 1):
            if 'new' in row:
                aliases[row['old']] = row['new']
                rows.append(row)
            elif 'skipped' in row:
                skipped.append(row)
            else:
                errors.append(row)
            if number % 250 == 0:
                print(json.dumps(dict(processed=number, total=len(jobs), methods=dict(Counter(r['method'] for r in rows)), errors=len(errors))), flush=True)
    manifest = args.manifest.resolve()
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(aliases, sort_keys=True, separators=(',', ':')) + '\n', encoding='utf-8')
    with (report_root / 'images.jsonl').open('w', encoding='utf-8') as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + '\n')
    report = dict(registered_hashes=len(jobs), mapped=len(aliases), unique_outputs=len(set(aliases.values())),
                  methods=dict(Counter(r['method'] for r in rows)), errors=errors, skipped=skipped,
                  min_iou=MIN_IOU, max_error=MAX_ERROR,
                  size=128, padding=4, max_visible_size=120, limit=args.limit,
                  client_code_executed=False, anti_cheat_started=False)
    (report_root / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('errors', 'skipped')}
                     | dict(errors=len(errors), skipped=len(skipped)), ensure_ascii=True), flush=True)
    return 1 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--client-icons', type=Path, required=True,
                        help='Extracted DDS tree: <package>/data/gfx/image/*.dds and <package>/data/gfx/image2/inven/**')
    parser.add_argument('--itemdb', type=Path, required=True, help='Folder containing ItemDB*.xml')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--live-index', type=Path, help='Registered entries: [{file, ids, names}]')
    parser.add_argument('--live-icons', type=Path, help='Verified registered PNGs named by content hash')
    parser.add_argument('--limit', type=int, default=0)
    return build(parser.parse_args())


if __name__ == '__main__':
    raise SystemExit(main())
