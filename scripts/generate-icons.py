"""Regenerate icons from logo.svg on macOS: python3 scripts/generate-icons.py."""
from pathlib import Path
import struct
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='rubik-icons-') as temp:
    renderer = Path(temp) / 'render-icon'
    subprocess.run(['swiftc', '-module-cache-path', temp + '/cache', str(root / 'scripts/render-icon.swift'), '-o', str(renderer)], check=True)
    for output, size, scale in [
        ('icons/icon-512.png', 512, 1),
        ('icons/icon-192.png', 192, 1),
        ('apple-touch-icon.png', 180, 1),
        ('icons/apple-touch-icon-v2.png', 180, 1),
        ('icons/icon-maskable-512.png', 512, .78),
        ('icons/favicon-32.png', 32, 1),
        ('icons/favicon-16.png', 16, 1),
    ]:
        subprocess.run([str(renderer), str(root / 'public/icons/logo.svg'), str(root / 'public' / output), str(size), str(scale)], check=True)
    images = [(size, (root / f'public/icons/favicon-{size}.png').read_bytes()) for size in (16, 32)]
    offset = 6 + 16 * len(images)
    entries = []
    for size, data in images:
        entries.append(struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (root / 'public/favicon.ico').write_bytes(struct.pack('<HHH', 0, 1, len(images)) + b''.join(entries) + b''.join(data for _, data in images))
