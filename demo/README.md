# Demo preparation

The review storyboard targets a five-minute Persian narration on a macOS-style desktop with a Safari frame. App images are real desktop captures from an isolated local demo instance. The frame is a presentation design, not a claim that Windows captures were recorded in Safari.

- `voiceover-fa.md`: narration and timing for review.
- `storyboard.json`: scene titles, durations, image references and planned camera emphasis.
- `assets/`: locally captured screenshots and the generated wallpaper (ignored by Git).
- `output/`: rendered review slides and review page (ignored by Git).
- `build/`: isolated demo database and working files (ignored by Git).

No video or voice track has been produced. Seller interaction and the example purchase are explicitly simulated in an isolated database. Keep this disclosure in the corresponding video scenes.

For the isolated app, set `APP_DB` to `demo/build/demo-app.sqlite3`, `SMS_PROVIDER=simulated`, `VOICE_PROVIDER=simulated`, run migrations and use port 8001. Do not publish that database or enable real seller contact for the demo.

`review.html` is the editable layout source. It uses local screenshots and Vazirmatn fonts in `assets/`; the self-contained review ZIP includes them. The live review slides preserve the rendered frames and keep the complete narration in speaker notes. Future video motion will use the emphasis instructions in the storyboard.
