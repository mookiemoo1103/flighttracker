#!/usr/bin/env python3
"""Create the six-tile transparent aircraft icon strip used by the placefile."""
from PIL import Image, ImageDraw
from pathlib import Path
import math
W=H=32
im=Image.new("RGBA",(W*6,H),(0,0,0,0))
draw=ImageDraw.Draw(im)
colors=["#ff4b4b","#42a5ff","#ffd43b","#45d49a","#bb75ff","#bfc7d1"]

def plane(d,cx,cy,color,scale=1.0):
    # top-down airplane silhouette with swept wings and tail
    pts=[(cx,cy-14*scale),(cx+2*scale,cy-4*scale),(cx+12*scale,cy+3*scale),
         (cx+12*scale,cy+6*scale),(cx+2*scale,cy+4*scale),(cx+3*scale,cy+12*scale),
         (cx,cy+10*scale),(cx-3*scale,cy+12*scale),(cx-2*scale,cy+4*scale),
         (cx-12*scale,cy+6*scale),(cx-12*scale,cy+3*scale),(cx-2*scale,cy-4*scale)]
    d.polygon(pts,fill=color,outline="#17202a")
def helicopter(d,cx,cy,color):
    d.ellipse((cx-7,cy-6,cx+7,cy+6),fill=color,outline="#17202a",width=1)
    d.rectangle((cx-1,cy-13,cx+1,cy+13),fill=color)
    d.line((cx-13,cy-13,cx+13,cy-13),fill="#17202a",width=2)
    d.line((cx-13,cy+13,cx+13,cy+13),fill="#17202a",width=2)
    d.line((cx+6,cy,cx+14,cy-3),fill=color,width=3)
for i,c in enumerate(colors):
    x=i*W
    d=ImageDraw.Draw(im)
    d.ellipse((x+1,1,x+30,30),fill="#101820",outline=c,width=2)
    if i==2: helicopter(d,x+16,16,c)
    else: plane(d,x+16,16,c,0.78 if i in (0,3,4) else 0.68)
Path("assets").mkdir(exist_ok=True)
im.save("assets/aircraft.png")
print("Created assets/aircraft.png")
