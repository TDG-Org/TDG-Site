# TDG Cloud image kit

Production exports of the TDG Cloud rounded gradient app tile. The pearlescent
cloud and upload arrow sit inside the pink-purple-cyan background; only the
pixels outside the rounded corners are transparent. The 1024 px PNG is the
raster master used to derive every smaller file; PNG is for UI and app icons,
WebP is for bandwidth-sensitive surfaces, and the multi-resolution ICO contains
the 16, 24, 32, 48, 64, 128 and 256 px PNG frames Windows expects.

| Format | Sizes |
| --- | --- |
| PNG | 16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512 and 1024 px |
| WebP | 128, 256, 512 and 1024 px |
| ICO | 16, 24, 32, 48, 64, 128 and 256 px |

Every export is square RGBA with transparent outside corners and the complete
gradient tile inside its canvas. `src/cloud/CloudMark.tsx` is the site's public
rendering surface; consumers must use that component rather than choosing a
different asset or rebuilding the mark.

Fleet identity checks can compare the committed 128 px PNG directly: SHA-256
`30c9e2e45b26880cc8f2679ff725bc5fad13769f29f46f571a0fdf82480b25a6`.
The 1024 px raster master is
`939ed6d537af536040de21f260cf9f03ab1ca89aae0b06108714bacc305e7d9d`.
