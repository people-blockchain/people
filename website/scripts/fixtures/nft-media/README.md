# NFT media fixtures

Tiny synthetic files for the NFT media tests and screenshots. None of them is an on-chain asset.

- `image.png`, `cover.png`: solid-colour PNGs generated for these tests.
- `clean.svg`: a static SVG with a gradient, a circle and styled text.
- `malicious.svg`: an SVG carrying a script, an event handler, `foreignObject` and a remote image; the sanitizer must strip all of it.
- `video.mp4`, `video.webm`: short synthetic clips, copied from the PeopleScan test fixtures (generated locally there with a canvas and MediaRecorder).
