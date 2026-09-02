# TDG Cloud image kit

Transparent production exports of the TDG Cloud product mark. The 1024 px PNG
is the raster master used to derive every smaller file; PNG is for UI and app
icons, WebP is for bandwidth-sensitive surfaces, and the multi-resolution ICO
contains the 16, 24, 32, 48, 64, 128 and 256 px PNG frames Windows expects.

| Format | Sizes |
| --- | --- |
| PNG | 16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512 and 1024 px |
| WebP | 128, 256, 512 and 1024 px |
| ICO | 16, 24, 32, 48, 64, 128 and 256 px |

Every export is square RGBA with transparent corners and the full cloud mark
inside its canvas. `src/cloud/CloudMark.tsx` is the site's public rendering
surface; consumers must use that component rather than choosing a different
asset or rebuilding the mark.
