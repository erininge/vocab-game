# Kat's Vocab Garden (PWA)

Drag-and-drop this folder into a GitHub repo and enable **GitHub Pages**.

## Audio folders (optional)
Put these next to `index.html`:

- `Audio/Female option 1/`
- `Audio/Female option 2/`
- `Audio/Male option 1/`
- `Audio/Male option 2/`

WAV filenames should match the *normalized* kana/kanji (spaces/punctuation removed), e.g. `わたし.wav`, `私.wav`.
This matches the python game's behavior.

If you're using the `USER` vocab file, you can also add user recordings here:
- `UserAudio/<voice folder>/<normalized>.wav`

To rename audio files to spoken text and rebuild the manifest, run:
`node tools/rename_audio_and_rebuild_manifest.js`

## Adding more vocab later (no code edits)
1. Add a new JSON file into `Vocabulary/` (any name, like `Food_vocab.json`).
2. Push to GitHub.

The app will auto-discover JSON files using the **GitHub API** when hosted on GitHub Pages.
If the API is blocked (rare), update `Vocabulary/vocab-manifest.json`.

## JSON structure (same as python game)
```json
{
  "level": "N5",
  "lessons": {
    "1": [
      { "kana": "わたし", "kanji": "私", "en": ["I", "me"] }
    ]
  }
}
```
