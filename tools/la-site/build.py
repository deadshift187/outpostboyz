#!/usr/bin/env python3
"""Site build helpers for SAVE LOST ANGELES (called by tools/update-lost-angeles.sh).

  build.py page   <code_dir> <dst_dir> <bundle_out> <opus_sha>
      code_dir = `git archive` of OPUS HEAD (index.html, data/, src/). Every <script> in OPUS's <body>
      (src= files AND inline blocks), in document order, is concatenated into <bundle_out> (the protected
      bundle: never committed, uploaded to private storage). <dst_dir>/index.html becomes the OPUS page
      shell (head, canvas, #ui, styles, iPhone fixes) + site head tags + LA_MOBILE_ART + the paywall gate.

  build.py mobile <src_assets> <cache_dir>
      600px-tall-capped copy of the art for phones (same recipe as OPUS tools/arcade/shrink.py with
      LA_MAX_H=600). Incremental: only re-encodes files newer than their cached copy; prunes deleted files.
"""
import hashlib, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def page(code_dir, dst_dir, bundle_out, sha):
    html = read(os.path.join(code_dir, 'index.html'))
    m = re.search(r'<body[^>]*>', html, re.I)
    if not m or html.count('</body>') != 1 or len(re.findall(r'<title>(?:SAVE )?LOST ANGELES</title>', html)) != 1:
        sys.exit('OPUS index.html changed shape (<title>/<body>) - update tools/la-site/build.py')
    head, body = html[:m.end()], html[m.end():]

    parts, n_files, n_inline = [], 0, 0
    tag = re.compile(r'<script\b([^>]*)>(.*?)</script>\s*', re.I | re.S)

    def take(mm):
        nonlocal n_files, n_inline
        attrs, inner = mm.group(1), mm.group(2)
        src = re.search(r'\bsrc\s*=\s*["\']([^"\']+)["\']', attrs)
        if src:
            rel = src.group(1)
            if re.match(r'^(https?:)?//', rel):
                sys.exit('OPUS loads a remote script (%s) - teach build.py what to do with it' % rel)
            path = os.path.join(code_dir, rel.split('?')[0])
            if not os.path.isfile(path):
                sys.exit('OPUS index.html loads %s but it is not in HEAD' % rel)
            with open(path, 'rb') as f:   # bytes: a few OPUS files carry cp1252 bytes in comments
                parts.append((rel, f.read()))
            n_files += 1
        elif inner.strip():
            parts.append(('<inline #%d>' % (n_inline + 1), inner.encode('utf-8')))
            n_inline += 1
        return ''

    body = tag.sub(take, body)
    if not n_files:
        sys.exit('No <script src> found in OPUS <body> - update build.py')

    banner = ('/* SAVE LOST ANGELES - (c) Outpost Boyz. Built from LOST-ANGELES-OPUS %s. Delivered to a signed-in\n'
              '   account that bought or was given the game; please do not redistribute. */\n' % sha)
    bom = b'\xef\xbb\xbf'
    b = banner.encode('utf-8') + b''.join(
        ('\n;/* ==== %s ==== */\n' % name).encode('utf-8') + (src[3:] if src.startswith(bom) else src) + b'\n'
        for name, src in parts)
    os.makedirs(os.path.dirname(bundle_out), exist_ok=True)
    with open(bundle_out, 'wb') as f:
        f.write(b)

    site_head = read(os.path.join(HERE, 'head.html')).strip()
    gate = read(os.path.join(HERE, 'gate.html')).strip()
    head = re.sub(r'<title>(?:SAVE )?LOST ANGELES</title>', lambda _m: site_head, head, count=1)   # OPUS title is SAVE LOST ANGELES since 9/29
    body = re.sub(r'[ \t]*<!-- =====[^>]*===== -->[ \t]*\n', '', body)   # OPUS's now-empty script-section labels
    body = re.sub(r'\n{3,}', '\n\n', body)
    body = body.replace('</body>', "<script>window.LA_MOBILE_ART = 'assets-m/';   // site only: phones load the 600px art copy</script>\n"
                        + gate + '\n</body>', 1)
    with open(os.path.join(dst_dir, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(head + body)

    print('bundle: %d files + %d inline blocks, %.2f MB, sha256 %s' % (n_files, n_inline, len(b) / 1048576, hashlib.sha256(b).hexdigest()[:16]))
    print('order: ' + ' '.join(n for n, _ in parts))


def mobile(src, dst, max_h=600):
    from PIL import Image
    max_w = max_h * 2
    made = kept = copied = pruned = 0
    want = set()
    for dp, _, files in os.walk(src):
        for fn in files:
            s = os.path.join(dp, fn)
            rel = os.path.relpath(s, src)
            want.add(os.path.normcase(rel))
            d = os.path.join(dst, rel)
            if os.path.exists(d) and os.path.getmtime(d) >= os.path.getmtime(s):
                kept += 1
                continue
            os.makedirs(os.path.dirname(d), exist_ok=True)
            ext = fn.lower().rsplit('.', 1)[-1]
            if ext not in ('webp', 'png', 'jpg', 'jpeg'):
                shutil.copy2(s, d); copied += 1; continue
            im = Image.open(s)
            w, h = im.size
            k = min(1.0, max_h / h, max_w / w)
            if k >= 1:
                shutil.copy2(s, d); copied += 1; continue
            im = im.convert('RGBA') if im.mode not in ('RGB', 'RGBA') else im
            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            if ext == 'webp': im.save(d, 'WEBP', quality=85, method=4)
            elif ext == 'png': im.save(d, 'PNG', optimize=True)
            else: im.convert('RGB').save(d, 'JPEG', quality=88)
            made += 1
    for dp, _, files in os.walk(dst):
        for fn in files:
            p = os.path.join(dp, fn)
            if os.path.normcase(os.path.relpath(p, dst)) not in want:
                os.remove(p); pruned += 1
    print('mobile art: %d shrunk, %d copied, %d unchanged, %d pruned' % (made, copied, kept, pruned))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'page' and len(sys.argv) == 6:
        page(*sys.argv[2:6])
    elif cmd == 'mobile' and len(sys.argv) == 4:
        mobile(*sys.argv[2:4])
    else:
        sys.exit(__doc__)
