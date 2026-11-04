JAR ART (layered)
=================

The overlay composites your jar from three transparent PNG layers, with the gifts
on a canvas in between:

  jar-top-bg-2.png   back of the rim   (behind the gifts)
  jar-bottom.png     inner base        (behind the gifts)
  ------------------ gifts (canvas) ------------------
  jar-top.png        front glass       (over the gifts)

Use your OWN art (or anything you have the rights to). Defaults expect these
filenames in this folder; override the paths in the configurator if you wish
(jarFrontImage / jarBackImage / jarBottomImage).

Authoring tips:
- All layers are PNG with a TRANSPARENT background.
- The FRONT layer (jar-top.png) must have a see-through glass interior so the gifts
  show through it.
- Art is authored on a 500 x 500 front jar; the overlay scales everything to your
  chosen width. The back/base pieces are placed like the source layout
  (back-of-rim near the top, base near the bottom).

Aligning the gifts to your jar (fractions of the 500-unit jar box):
  jarInsetX      = 0.22   (left/right of the interior where gifts pile)
  jarInsetTop    = 0.13   (mouth line — gifts overflow above this)
  jarInsetBottom = 0.16   (floor — where gifts rest)
Tune these in the configurator until the pile sits nicely inside your glass.
