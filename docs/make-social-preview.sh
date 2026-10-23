#!/bin/sh
# Render docs/social-preview.html to docs/social-preview.png (1280x640), the image GitHub shows when a link to the
# repository is shared. Run test/test.sh first: the card uses its screenshot test/out/filter-open.png.
# Uses Microsoft's official Playwright image (Chromium); needs Docker.
set -e
export PATH=$PATH:/snap/bin
DIR=$(cd "$(dirname "$0")/.." && pwd)
docker run --rm -v "$DIR:/repo" -w /tmp mcr.microsoft.com/playwright:v1.56.0-noble sh -c '
  npm i -s playwright@1.56.0 >/dev/null 2>&1 &&
  node -e "
    const { chromium } = require(\"playwright\");
    (async () => {
      const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1280, height: 640}});
      await p.goto(\"file:///repo/docs/social-preview.html\"); await p.waitForLoadState(\"load\");
      await p.screenshot({path: \"/repo/docs/social-preview.png\"}); await b.close();
    })();"'
echo "docs/social-preview.png"
