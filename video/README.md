# CourseKeeper promo video

A 30-second promo video made with [Remotion](https://www.remotion.dev). Every app screen in the video is a real screenshot of CourseKeeper, taken with demo data (a made-up student), not a mock-up.

## Render the video

Requirements: Node.js 18+.

```bash
cd video
npm install
npm run studio   # preview and edit in the browser
npm run render   # writes out/coursekeeper-promo.mp4
```

## Edit it

- `src/Promo.tsx`: scenes, captions and timing (`SCENES` at the bottom sets the order and length of each scene, in frames at 30 fps).
- `src/components.tsx`: the browser window, camera zoom, callout cards and captions.
- `src/theme.ts`: colors and font.

Zoom targets and callouts use coordinates in the 1920×1080 app screen, so you can read them straight off a screenshot.

## Retake the screenshots

The screenshots in `public/screens` come from two scripts in `demo/`:

- `demo_sunucu.py` fills a separate `demo.db` with sample courses, grades, attendance and a semester, then runs the app on port 5055. Your real `derstakip.db` is never touched. The date is fixed to 25 November 2026 and the weather card uses a sample response, so the screenshots look the same every time.
- `ekran_goruntuleri.py` opens the app in a headless browser and saves each screen at 3840×2160.

```bash
pip install playwright
python -m playwright install chromium

python video/demo/demo_sunucu.py          # terminal 1
python video/demo/ekran_goruntuleri.py    # terminal 2
```

Run these on your Mac after changing the UI so the video stays in sync with the app. On macOS the app's own system font is used; elsewhere the scripts fall back to Inter.

## Credits

Inter font by Rasmus Andersson, SIL Open Font License (`public/fonts/LICENSE-Inter.txt`).
