# datamock — test photographs for the scan page's upload path

Seventeen images, one per branch the upload flow can take. Drag them into the file picker on
`/scan`, or let `backend/doodee/test_fixtures.py` run them through the analysis engine.

## Regenerate

Nothing here is committed except this file and the script, so run this once before using them:

```
docker compose exec -T api python /app/backend/datamock/make_fixtures.py \
  < apps/web/public/assets/scan/capture-angles-reference.png
```

It writes the images plus `fixtures.json` (the measured result for each), and **fails loudly if
any file does not do what it claims**. In the container because the face model needs `mediapipe`,
which is not installed on the host; the sheet arrives on stdin because `apps/` is not mounted
into that container, and the output lands on your machine because `backend/` is.

## Where the face comes from

**These are photographs of a real person.** They are cut from
`apps/web/public/assets/scan/capture-angles-reference.png`, the contact sheet already committed
in this repository and already shown on the capture screen as the angle guide. Nothing here is
synthetic, and it is worth being precise about that when describing the fixtures to anyone.

A drawn face was tried first and does not work at all. MediaPipe's detector is a network trained
on photographs rather than a shape matcher, so a careful OpenCV portrait — head, eyes, nose,
mouth, shaded skin — returns **zero faces**. Rendering a 3D mesh runs into the same wall: the
obstacle is appearance, not geometry.

Two consequences worth knowing before editing the script:

- **The tiles must be doubled with Lanczos.** At their native 512px the crop the app takes comes
  out near 330px and the detector loses the profile on the second pass. At 3x the interpolation
  softens the image until its Laplacian variance drops under the server's floor of 18. And under
  bicubic the *mirrored* profile stops being detected the moment it is JPEG-encoded — it sits on
  the detector's 0.6 confidence threshold and the encoder's loss is enough to push it under.
- **The detector is not symmetric.** The same tile measures yaw +67 as it stands and −67
  mirrored, and only the mirrored direction is fragile. A treatment that looks fine one way has
  to be checked the other way too.

File names follow the angle that came back from the detector, never the caption printed on the
sheet — the tile labelled "LEFT 90" measures a *positive* yaw, which is `right_profile` in this
codebase, and trusting the label would silently test the opposite slot.

## Accepted

| file | slot | yaw | notes |
|---|---|---|---|
| `pass-front.jpg` | `front` | +0.3 | |
| `pass-left-profile.jpg` | `left_profile` | −66.8 | mirrored from the same tile below |
| `pass-right-profile.jpg` | `right_profile` | +67.2 | |
| `pass-wrong-slot.jpg` | `right_profile` | +67.2 | same bytes as above. Drop it on the **front** tile: it should move itself to the right-profile slot and say so |
| `edge-blurry-server-rejects.jpg` | `front` | +3.2 | **accepted by the browser, rejected by the server** — see below |

## Rejected

| file | code | what it exercises |
|---|---|---|
| `fail-no-face.jpg` | `no_face` | a landscape, sharp and well exposed |
| `fail-two-faces.jpg` | `multiple_faces` | two faces side by side |
| `fail-sideways.jpg` | `sideways` | pixels rotated 90°, roll past 60 |
| `fail-tilted.jpg` | `level_head` | rotated 25°, inside the (10, 60] window where this fires rather than `sideways` |
| `fail-edge-clipped.jpg` | `off_centre` | face cut by the left frame edge |
| `fail-tiny-pixels.jpg` | `face_too_small` | face under 200 real pixels after the 1600 fit |
| `fail-distant-face.jpg` | `no_face` | a person far off — see the note below |
| `fail-dark.jpg` | `too_dark` | |
| `fail-blown.jpg` | `too_bright` | |
| `fail-corrupt.jpg` | `unreadable_image` | a sentence in a file named `.jpg` |
| `fake.heic` | `unsupported_heic` | undecodable bytes with a HEIC name |
| `fail-too-large.jpg` | `file_too_large` | just over 10 MB |

## Two things building these proved about the product code

Both are findings about `apps/web/src/`, not about the fixtures, and neither was worked around
by moving a threshold.

**The `blurry` check cannot fire on a real face.** It reads a sharpness figure taken from a
128×72 downsample, which is such a heavy low-pass on its own that a photograph's remaining edge
energy never falls under the floor of 2. Sweeping Gaussian blur finds no window: sigma 18
measures 4.19 and is accepted, sigma 22 destroys the face so completely that the answer becomes
`no_face`. The server's own check says `blurry_image` at every sigma from 14 up, so blur *is*
caught — just after the upload rather than before it. `edge-blurry-server-rejects.jpg` exists to
exercise exactly that, and it is the only fixture that reaches the after-the-fact failure path.

**The fraction branch of `stillFramingCode` is unreachable.** Detection runs on a 512-pixel copy,
so a face under the 0.08 fraction floor is under 41 pixels there and the detector never finds it —
everything that would trip the branch has already come back as `no_face`. `fail-distant-face.jpg`
is kept to document that. The pixel branch beside it is the one doing real work, and
`fail-tiny-pixels.jpg` covers it.

## What the fixtures showed about the skin engine

`skin_engine` had never been run on skin. `SkinEngineTest` in `tests.py` paints eight flat
rectangles and writes a landmark mesh to bound them, which checks the arithmetic but not the
claim — flat paint responds to exposure the way the algebra predicts and skin does not.
`SkinOnRealPhotographTest` in `test_fixtures.py` runs it over these files instead, and the first
thing it found was a defect.

**The lightness signals held and the redness signals did not.** Across 0.6x to 1.25x exposure on
the same photograph, `undereye_shadow` and `tone_spread` moved about 5%, which is the module's
central claim and it survives. `cheek_redness` moved from -2.17 to -5.83 and `nose_redness` from
-0.58 to -4.39, while `readable` stayed true, `advisories` stayed empty, and `comparable()`
answered True for the pair — so a trend line would have drawn an exposure step as a change in the
user's skin.

The clipping guard that should have caught it was blind twice over. It measured clipping on the
**greyscale** of the **white-balanced** image: at 1.15x, 88% of the cheek's red channel was pinned
at 255 while its greyscale sat near 210, so nothing was counted; and the sclera correction then
scaled red back down under 253, erasing the evidence of the damage it was compensating for.
`max_clipped_fraction` read 0.0000 throughout.

**Fixed** in `_clipped_fraction`, which measures each channel separately on the frame as decoded,
before white balance. The cut lands exactly where it should — these files measure 0.0000 to 0.0156
across 0.6x-1.0x, where the redness signals are stable, and 0.73 to 1.00 from 1.1x up, where they
start to drift. `MAX_CLIPPED_FRACTION` did not move. `ENGINE_VERSION` did, to `2026.2-clipping`,
so `comparable()` refuses to join a scan measured under the old rule to one measured under the new.

**The reference sheet is side-lit, and the engine is right about it.** One cheek reads L* 80 and
the other 51, a ratio of 1.58 against a ceiling of 1.55, so every fixture here comes back
`readable: false` with `skin_uneven_lighting`. That is the guard working, not a bad fixture —
but it does mean these files cannot stand in for a well-lit scan when testing the readable path.

## Not covered

`pass-smiling.jpg` is not produced. No frontal tile on the sheet has a blendshape smile above the
0.25 threshold, and the threshold was not lowered to manufacture one. Testing the smile warning
needs a smiling photograph from somewhere else.
