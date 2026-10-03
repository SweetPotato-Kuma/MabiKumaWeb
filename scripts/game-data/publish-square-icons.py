"""Install validated WebP files into the website without a browser-side lookup table."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from PIL import Image


def publish(args):
    aliases = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    root = args.root.resolve()
    output = root / 'public/data/item-icons'
    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.resolve().is_relative_to(root):
        raise ValueError('Output must stay inside the repository')
    # Validate everything before changing any website asset.
    verified = set()
    for old, new in aliases.items():
        if not re.fullmatch(r'[a-f0-9]{16}\.png', old):
            raise ValueError(f'Invalid registered filename: {old}')
        if not re.fullmatch(r'[a-f0-9]{20}\.webp', new):
            raise ValueError(f'Invalid generated filename: {new}')
        if new in verified:
            continue
        source = args.source / new
        if hashlib.sha256(source.read_bytes()).hexdigest()[:20] + '.webp' != new:
            raise ValueError(f'Generated content hash mismatch: {new}')
        with Image.open(source) as image:
            if image.size != (128, 128):
                raise ValueError(f'Wrong dimensions: {new}')
            box = image.convert('RGBA').getchannel('A').getbbox()
            if box is None:
                raise ValueError(f'Empty icon: {new}')
            left, top, right, bottom = box
            if (abs(left - (128 - right)) > 1 or abs(top - (128 - bottom)) > 1
                    or max(right - left, bottom - top) > 120):
                raise ValueError(f'Wrong alignment: {new}')
        verified.add(new)
    # Build outside the watched public directory, then switch directories once.
    cache = root / '.cache/square-icon-publish'
    cache.mkdir(parents=True, exist_ok=True)
    if not cache.resolve().is_relative_to(root):
        raise ValueError('Staging must stay inside the repository')
    staged = Path(tempfile.mkdtemp(prefix='next-', dir=cache))
    for old, new in aliases.items():
        target = staged / (Path(old).stem + '.webp')
        try:
            os.link(args.source / new, target)
        except OSError:
            shutil.copyfile(args.source / new, target)
    backup = cache / (staged.name + '-previous')
    try:
        if output.exists():
            output.rename(backup)
        staged.rename(output)
    except PermissionError:
        # A file watcher can hold the public directory open on Windows. Swap file by file instead.
        if backup.exists() and not output.exists():
            backup.rename(output)
        keep = {p.name for p in staged.iterdir()}
        for path in staged.iterdir():
            os.replace(path, output / path.name)
        for path in output.iterdir():
            if path.name not in keep:
                path.unlink()
        staged.rmdir()
    version = hashlib.sha256(json.dumps(aliases, sort_keys=True).encode()).hexdigest()[:16]
    version_file = root / 'src/features/itemcard/generated/squareIconVersion.json'
    version_file.parent.mkdir(parents=True, exist_ok=True)
    version_file.write_text(json.dumps(version) + '\n', encoding='utf-8')
    print(json.dumps(dict(aliases=len(aliases), unique_images=len(verified), version=version)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    publish(parser.parse_args())
