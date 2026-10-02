# Rebuilds logo.svg / icon.svg from the Inter variable font.
# Usage: pip install fonttools && python3 build_logo.py  (expects Inter-Variable.ttf in ~/Library/Fonts — change SRC otherwise)
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import os
SRC=os.path.expanduser('~/Library/Fonts/Inter-Variable.ttf')
def font(w):
    f=TTFont(SRC); return instantiateVariableFont(f,{'wght':w,'opsz':32} if 'opsz' in [a.axisTag for a in f['fvar'].axes] else {'wght':w})
def text_path(f, s, x0, size, track=0):
    upm=f['head'].unitsPerEm; sc=size/upm
    gs=f.getGlyphSet(); cmap=f.getBestCmap(); hm=f['hmtx']
    pen=SVGPathPen(gs); x=x0
    for ch in s:
        g=cmap[ord(ch)]
        tp=TransformPen(pen,(sc,0,0,-sc,x,0))
        gs[g].draw(tp); x+=hm[g][0]*sc+track
    return pen.getCommands(), x
reg=font(400); med=font(450)
SIZE=100  # cap ~73, x-height ~55 for Inter
edu,x=text_path(reg,'Edu',0,SIZE,3.5)
x+=10
sch,x=text_path(med,'Sch',x,SIZE,1.5)
xh=-55.5 # x-height (y up negative)
sw=8.2   # stroke width matching medium weight
blue='#4499CC'
# open book = two rounded "o" pages joined by a spine, with a curved bottom
bx=x+3; pw=40; gap=0
L=bx; M=bx+pw; R=bx+2*pw
top=xh+sw/2; bot=-sw/2
book=(f'M{L+sw/2},{top+10} Q{L+sw/2},{top} {L+12},{top} H{M-10} Q{M},{top} {M},{top+10} V{bot-4} '
      f'M{M},{top+10} Q{M},{top} {M+10},{top} H{R-12} Q{R-sw/2},{top} {R-sw/2},{top+10} V{bot} '
      f'M{L+sw/2},{top+10} V{bot} Q{L+18},{bot-9} {M},{bot+2} Q{R-18},{bot-9} {R-sw/2},{bot}')
# pencil "l": body from baseline to above cap, sharpened tip on top, eraser band at the bottom
px=R+12; pwid=15; ptop=-86; ptip=-98
pencil=(f'M{px},{-4} V{ptop} L{px+pwid/2},{ptip} L{px+pwid},{ptop} V{-4} Z '
        f'M{px},{ptop} H{px+pwid} M{px+pwid/2},{ptop} V{-14}')
eraser=f'M{px-1.5},{-10} h{pwid+3} v{10} h{-(pwid+3)} Z'
W=px+pwid+4; top_y=-104; H=114
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 {top_y} {W+4} {H}" role="img" aria-label="EduSchool">
  <path fill="currentColor" d="{edu}"/>
  <path fill="{blue}" d="{sch}"/>
  <path fill="none" stroke="{blue}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round" d="{book}"/>
  <path fill="none" stroke="{blue}" stroke-width="3.2" stroke-linejoin="round" d="{pencil}"/>
  <path fill="{blue}" d="{eraser}"/>
</svg>
'''
open('logo.svg','w').write(svg)
# Square mark: the book + pencil, white on the logo blue
x0=L-sw/2; x1=px+pwid+1.5; y0=ptip-2; y1=1
w=x1-x0; h=y1-y0; S=max(w,h)*1.36
cx=(x0+x1)/2; cy=(y0+y1)/2
mark=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{cx-S/2:.2f} {cy-S/2:.2f} {S:.2f} {S:.2f}" width="512" height="512" role="img" aria-label="EduSchool">
  <rect x="{cx-S/2:.2f}" y="{cy-S/2:.2f}" width="{S:.2f}" height="{S:.2f}" rx="{S*0.22:.2f}" fill="{blue}"/>
  <path fill="none" stroke="#fff" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round" d="{book}"/>
  <path fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round" d="{pencil}"/>
  <path fill="#fff" d="{eraser}"/>
</svg>
'''
open('mark.svg','w').write(mark)
