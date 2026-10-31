#!/usr/bin/env python3
"""Builds placeholder art pack (palette-locked). Run: python3 tools/build_art.py from pack root."""
import json, os, random, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
T = 32
PALETTE = [  # name, hex, role
 ("outline","2b2135","outlines, eyes, darkest shadow"),("shadow","4a3f55","cast shadow, dark hair, dark pants"),
 ("wall_face","7d6b78","wall face"),("wall_light","b3a1a3","wall trim, silver hair"),("wall_top","e0d2c0","wall top cap"),
 ("wood_dk","7a4e34","wood grain, shoes, brown pants"),("wood_md","a8704a","wood floor/desk base, auburn hair"),("wood_lt","c99466","wood highlight"),
 ("tile_md","b8a88f","tile grout"),("tile_lt","dccdb4","tile floor"),("cream","f4ead6","paper, whiteboard, highlights, UI bg"),
 ("green_dk","3f6b4a","foliage shade"),("green_md","6b9a5c","foliage, lounge carpet, online"),("green_lt","a3c47f","foliage highlight"),
 ("sq_a","b8574c","Squad A / terracotta, red hair"),("sq_b","4f7aa3","Squad B / denim, talking"),("sq_c","4f9a8e","Squad C / teal"),
 ("sq_d","d4a24c","Squad D / mustard, away"),("sq_e","8a5a8f","Squad E / plum, focus"),
 ("sq_a_dk","8c3f3a","Squad A shade"),("sq_b_dk","3a5a7c","Squad B shade"),("sq_c_dk","3a7268","Squad C shade"),
 ("sq_d_dk","a87b34","Squad D shade"),("sq_e_dk","66406b","Squad E shade"),
 ("skin1","f1c7a1","skin light"),("skin2","d39b75","skin medium"),("skin3","a0694a","skin tan/brown"),("skin4","6a4532","skin deep"),
 ("hair_brown","5e3f2a","hair brown"),("hair_blond","d9b56a","hair blond"),("screen","9fd0cc","monitor glow, glass"),("metal","8e8a96","metal, chair base"),
]
C = {n: tuple(int(h[i:i+2],16) for i in (0,2,4))+(255,) for n,h,_ in PALETTE}
PALSET = {c[:3] for c in C.values()}
CLR = (0,0,0,0)

def new(w,h): return Image.new("RGBA",(w,h),CLR)
def R(d,x0,y0,x1,y1,c): d.rectangle([x0,y0,x1,y1],fill=C[c])
def outline(img, col="outline"):
    px=img.load(); w,h=img.size; add=[]
    for y in range(h):
        for x in range(w):
            if px[x,y][3]==0:
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    X,Y=x+dx,y+dy
                    if 0<=X<w and 0<=Y<h and px[X,Y][3]==255 and px[X,Y]!=C[col]:
                        add.append((x,y)); break
    for p in add: px[p]=C[col]
    return img
# tiny 3x5 font
FONT={"A":["010","101","111","101","101"],"B":["110","101","110","101","110"],"C":["011","100","100","100","011"],
"D":["110","101","101","101","110"],"E":["111","100","110","100","111"],"M":["101","111","111","101","101"],
"L":["100","100","100","100","111"],"S":["011","100","010","001","110"],"!":["010","010","010","000","010"]}
def text(d,x,y,s,c,scale=1):
    for i,ch in enumerate(s):
        for r,row in enumerate(FONT[ch]):
            for k,b in enumerate(row):
                if b=="1": R(d,x+(i*4+k)*scale,y+r*scale,x+(i*4+k)*scale+scale-1,y+r*scale+scale-1,c)

SQ=["a","b","c","d","e"]
# ---------------- floor & walls ----------------
FW_NAMES=["wood","wood_alt","tile","tile_alt"]+[f"carpet_{s}" for s in SQ]+["carpet_lounge","door_threshold","collision",
 "wall_top","wall_face","wall_face_window","wall_top_edge_s","wall_corner_nw","wall_corner_ne","wall_corner_sw","wall_corner_se",
 "wall_top_edge_n","wall_top_edge_e","wall_top_edge_w","wall_face_shelf"]
def floor_tile(name):
    im=new(T,T); d=ImageDraw.Draw(im)
    if name.startswith("wood"):
        R(d,0,0,31,31,"wood_md")
        for y in (7,15,23,31): R(d,0,y,31,y,"wood_dk")
        off=8 if name=="wood_alt" else 0
        for i,y in enumerate((0,8,16,24)):
            x=(off+i*12)%32; R(d,x,y,x,y+6,"wood_dk"); R(d,0,y,31,y,"wood_lt") if y==0 else None
            R(d,(x+4)%32,y+2,(x+9)%32 if (x+9)%32>(x+4)%32 else 31,y+2,"wood_lt")
    elif name.startswith("tile"):
        R(d,0,0,31,31,"tile_lt"); R(d,0,15,31,15,"tile_md"); R(d,15,0,15,31,"tile_md")
        R(d,0,31,31,31,"tile_md"); R(d,31,0,31,31,"tile_md")
        if name=="tile_alt": R(d,4,4,6,4,"cream"); R(d,20,20,22,20,"cream")
    elif name.startswith("carpet"):
        s=name.split("_")[1]; base,dk=("green_md","green_dk") if s=="lounge" else (f"sq_{s}",f"sq_{s}_dk")
        R(d,0,0,31,31,base)
        for y in range(2,32,8):
            for x in range(2+(y//8%2)*4,32,8): R(d,x,y,x,y,dk)
    elif name=="door_threshold":
        R(d,0,0,31,31,"wood_md"); R(d,0,0,31,3,"wood_dk"); R(d,0,28,31,31,"wood_dk"); R(d,0,4,31,5,"wood_lt")
    elif name=="collision":
        R(d,0,0,31,31,"sq_a")
        for i in range(32): d.point((i,i),C["cream"]); d.point((31-i,i),C["cream"])
    return im
def wall_tile(name):
    im=new(T,T); d=ImageDraw.Draw(im)
    if name.startswith("wall_top") or name.startswith("wall_corner"):
        R(d,0,0,31,31,"wall_top"); R(d,4,4,27,27,"wall_top")
        edges={"wall_top_edge_s":"s","wall_top_edge_n":"n","wall_top_edge_e":"e","wall_top_edge_w":"w",
               "wall_corner_nw":"nw","wall_corner_ne":"ne","wall_corner_sw":"sw","wall_corner_se":"se"}.get(name,"")
        for e in edges:
            if e=="n": R(d,0,0,31,2,"wall_light")
            if e=="s": R(d,0,29,31,31,"wall_light")
            if e=="w": R(d,0,0,2,31,"wall_light")
            if e=="e": R(d,29,0,31,31,"wall_light")
        if name=="wall_top": R(d,0,31,31,31,"wall_light")
    else:
        R(d,0,0,31,31,"wall_face"); R(d,0,0,31,2,"wall_light"); R(d,0,28,31,31,"shadow")
        for y in (10,19): R(d,0,y,31,y,"shadow")
        if name=="wall_face_window":
            R(d,6,5,25,24,"outline"); R(d,7,6,24,23,"screen"); R(d,15,6,16,23,"wall_light"); R(d,7,14,24,15,"wall_light"); R(d,8,7,10,9,"cream")
        if name=="wall_face_shelf":
            R(d,4,14,27,16,"wood_md"); R(d,6,8,8,13,"sq_a"); R(d,9,9,11,13,"sq_b"); R(d,12,7,13,13,"sq_d"); R(d,20,9,24,13,"green_md")
    return im
def build_floor_walls():
    sheet=new(8*T,3*T)
    for i,n in enumerate(FW_NAMES):
        t=floor_tile(n) if i<12 else wall_tile(n)
        sheet.paste(t,((i%8)*T,(i//8)*T))
    return sheet

# ---------------- props ----------------
PR_NAMES=["desk_l","desk_r","monitor","laptop","chair_down","chair_up","chair_left","chair_right",
 "plant_small","plant_tall_top","plant_tall_bottom","coffee_machine","water_cooler","bookshelf","standup_marker","floor_lamp",
 "table_tl","table_tm","table_tr","table_bl","table_bm","table_br","whiteboard_l","whiteboard_r",
 "sofa_l","sofa_m","sofa_r","coffee_table"]+[f"sign_{s}" for s in SQ]+[f"rug_{p}" for p in ("tl","tm","tr","ml","mm","mr","bl","bm","br")]+["sign_meeting","sign_lounge","sign_standup","wall_clock","box","blank"]
def chair(d,dirn):
    if dirn in("down","up"):
        R(d,10,12,21,25,"sq_b_dk")
        if dirn=="down": R(d,9,6,22,12,"sq_b"); R(d,11,14,20,22,"sq_b")
        else: R(d,9,20,22,26,"sq_b"); R(d,11,13,20,19,"sq_b")
        R(d,15,26,16,29,"metal")
    else:
        R(d,10,12,21,24,"sq_b_dk"); x=(19,23) if dirn=="left" else (8,12); R(d,x[0],6,x[1],22,"sq_b"); R(d,11,14,20,21,"sq_b"); R(d,15,25,16,29,"metal")
def prop_tile(n):
    im=new(T,T); d=ImageDraw.Draw(im); ol=True
    if n=="desk_l": R(d,2,8,31,24,"wood_md"); R(d,2,8,31,10,"wood_lt"); R(d,2,25,31,29,"wood_dk"); R(d,3,25,5,30,"wood_dk")
    elif n=="desk_r": R(d,0,8,29,24,"wood_md"); R(d,0,8,29,10,"wood_lt"); R(d,0,25,29,29,"wood_dk"); R(d,26,25,28,30,"wood_dk")
    elif n=="monitor": R(d,14,2,31,15,"outline"); R(d,16,4,29,13,"screen"); R(d,17,5,20,6,"cream"); R(d,21,16,24,19,"metal"); R(d,18,19,27,20,"metal")
    elif n=="laptop": R(d,8,10,23,18,"metal"); R(d,9,11,22,17,"screen"); R(d,6,19,25,22,"wall_light")
    elif n.startswith("chair_"): chair(d,n[6:])
    elif n=="plant_small": R(d,11,20,20,28,"sq_a"); R(d,11,20,20,21,"sq_a_dk"); d.ellipse([7,6,24,21],fill=C["green_md"]); d.ellipse([10,8,17,14],fill=C["green_lt"]); R(d,16,16,21,19,"green_dk")
    elif n=="plant_tall_top": d.ellipse([4,6,27,31],fill=C["green_md"]); d.ellipse([8,9,16,17],fill=C["green_lt"]); R(d,18,22,24,28,"green_dk")
    elif n=="plant_tall_bottom": d.ellipse([7,0,24,10],fill=C["green_md"]); R(d,15,9,16,14,"green_dk"); R(d,9,14,22,28,"sq_d"); R(d,9,14,22,16,"sq_d_dk")
    elif n=="coffee_machine": R(d,6,6,25,28,"shadow"); R(d,8,8,23,14,"metal"); R(d,10,10,13,12,"sq_a"); R(d,11,18,20,24,"outline"); R(d,13,21,18,24,"cream")
    elif n=="water_cooler": R(d,10,2,21,13,"screen"); R(d,12,4,13,10,"cream"); R(d,8,14,23,29,"cream"); R(d,8,14,23,15,"wall_light"); R(d,14,18,17,19,"sq_b")
    elif n=="bookshelf":
        R(d,3,2,28,29,"wood_dk")
        for y,cs in ((4,["sq_a","sq_b","sq_d","cream","sq_c"]),(17,["sq_e","green_md","sq_a","sq_d","sq_b"])):
            for i,c in enumerate(cs): R(d,5+i*4+(i>2)*2,y,7+i*4+(i>2)*2,y+10,c)
    elif n=="standup_marker": ol=False; d.ellipse([3,3,28,28],fill=C["sq_d"]); d.ellipse([7,7,24,24],fill=C["sq_d_dk"]); d.ellipse([11,11,20,20],fill=C["cream"])
    elif n=="floor_lamp": d.ellipse([8,2,23,13],fill=C["sq_d"]); R(d,10,10,21,13,"cream"); R(d,15,14,16,26,"metal"); R(d,11,27,20,29,"shadow")
    elif n.startswith("table_"):
        p=n[6:]; x0=4 if p[1]=="l" else 0; x1=27 if p[1]=="r" else 31; y0=6 if p[0]=="t" else 0; y1=22 if p[0]=="b" else 31
        R(d,x0,y0,x1,y1,"wood_md")
        if p[0]=="t": R(d,x0,y0,x1,y0+2,"wood_lt")
        if p[0]=="b": R(d,x0,y1-3,x1,y1,"wood_dk")
    elif n.startswith("whiteboard"):
        l=n.endswith("l"); R(d,4 if l else 0,4,31 if l else 27,24,"metal"); R(d,6 if l else 0,6,31 if l else 25,22,"cream")
        if l: R(d,9,10,22,10,"sq_b"); R(d,9,14,18,14,"sq_a"); R(d,9,18,24,18,"sq_c")
        else: d.ellipse([4,9,16,19],outline=C["sq_e"]); R(d,4,25,6,27,"sq_a")
    elif n.startswith("sofa_"):
        p=n[5:]; R(d,0 if p!="l" else 2,6,31 if p!="r" else 29,14,"sq_c_dk"); R(d,0 if p!="l" else 2,14,31 if p!="r" else 29,26,"sq_c")
        if p=="l": R(d,2,10,7,27,"sq_c_dk")
        if p=="r": R(d,24,10,29,27,"sq_c_dk")
        if p=="m": R(d,0,15,31,15,"sq_c_dk")
    elif n=="coffee_table": R(d,5,9,26,21,"wood_md"); R(d,5,9,26,10,"wood_lt"); R(d,10,12,13,15,"cream"); R(d,18,13,21,17,"sq_a")
    elif n.startswith("sign_"):
        s=n[5:]; m={"meeting":("sq_b","M"),"lounge":("green_md","L"),"standup":("sq_d","S")}
        col,ch=m.get(s,(f"sq_{s}" if len(s)==1 else "sq_a",s.upper() if len(s)==1 else "A"))
        R(d,15,18,16,29,"wood_dk"); R(d,4,3,27,18,col); R(d,4,3,27,4,"cream"); text(d,10,6,ch,"cream",scale=2) if True else None
    elif n.startswith("rug_"):
        ol=False; p=n[4:]; R(d,0,0,31,31,"sq_e")
        for y in range(4,32,8):
            for x in range(4,32,8): R(d,x,y,x+1,y+1,"sq_d")
        if p[0]=="t": R(d,0,0,31,3,"sq_e_dk"); R(d,0,4,31,4,"sq_d")
        if p[0]=="b": R(d,0,28,31,31,"sq_e_dk"); R(d,0,27,31,27,"sq_d")
        if p[1]=="l": R(d,0,0,3,31,"sq_e_dk"); R(d,4,0 if p[0]!="t" else 4,4,31 if p[0]!="b" else 27,"sq_d")
        if p[1]=="r": R(d,28,0,31,31,"sq_e_dk"); R(d,27,0 if p[0]!="t" else 4,27,31 if p[0]!="b" else 27,"sq_d")
    elif n=="wall_clock": d.ellipse([8,6,23,21],fill=C["cream"]); R(d,15,9,15,14,"outline"); R(d,15,14,19,14,"outline")
    elif n=="box": R(d,6,12,25,27,"wood_lt"); R(d,6,12,25,15,"wood_md"); R(d,14,12,17,27,"tile_md")
    else: ol=False
    return outline(im) if ol else im
def build_props():
    sheet=new(8*T,6*T)
    for i,n in enumerate(PR_NAMES): sheet.paste(prop_tile(n),((i%8)*T,(i//8)*T))
    return sheet

# ---------------- avatars ----------------
AW,AH=32,48; DIRS=["down","left","right","up"]
def avatar_frame(dirn,f,v):
    if dirn=="right": return avatar_frame("left",f,v).transpose(Image.FLIP_LEFT_RIGHT)
    im=new(AW,AH); d=ImageDraw.Draw(im)
    bob=-1 if f in (2,4) else 0
    sk,hr,sh,pa=v["skin"],v["hair"],v["shirt"],v["pants"]
    # legs
    if dirn in("down","up"):
        la=lb=0
        if f==1: lb=-2
        if f==3: la=-2
        R(d,11,37+bob,14,43+la,pa); R(d,17,37+bob,20,43+lb,pa)
        R(d,11,42+la,14,43+la,"wood_dk"); R(d,17,42+lb,20,43+lb,"wood_dk")
    else:
        fo={0:(0,0),1:(-3,3),2:(0,0),3:(3,-3),4:(0,0)}[f]
        R(d,14+fo[1],37+bob,17+fo[1],43,"shadow" if pa=="shadow" else f"{pa}" ); R(d,14+fo[0],37+bob,17+fo[0],43,pa)
        R(d,13+fo[0],42,17+fo[0],43,"wood_dk")
    y=bob
    # body
    R(d,10,27+y,21,38+y,sh)
    if dirn in("down","up"):
        sw={1:1,3:-1}.get(f,0)
        R(d,8,28+y+sw,9,35+y+sw,sh); R(d,22,28+y-sw,23,35+y-sw,sh)
        R(d,8,36+y+sw,9,37+y+sw,sk); R(d,22,36+y-sw,23,37+y-sw,sk)
    else:
        sw={1:-2,3:2}.get(f,0); R(d,14+sw,29+y,17+sw,35+y,sh); R(d,14+sw,36+y,17+sw,37+y,sk)
    # head
    R(d,8,11+y,23,26+y,sk)
    if dirn=="down":
        R(d,7,8+y,24,15+y,hr); R(d,7,8+y,9,20+y,hr); R(d,22,8+y,24,20+y,hr)
        R(d,12,19+y,13,21+y,"outline"); R(d,18,19+y,19,21+y,"outline"); R(d,10,23+y,11,23+y,"sq_a"); R(d,20,23+y,21,23+y,"sq_a")
        R(d,14,27+y,17,28+y,sk)
    elif dirn=="up":
        R(d,7,8+y,24,24+y,hr)
    else:
        R(d,7,8+y,24,14+y,hr); R(d,15,8+y,24,23+y,hr); R(d,10,19+y,11,21+y,"outline"); R(d,7,21+y,8,22+y,sk)
    outline(im)
    px=im.load()
    for x in range(10,22):  # ground shadow under feet
        if px[x,44][3]==0: px[x,44]=C["shadow"]
    return im
def build_avatar(v):
    sheet=new(5*AW,4*AH)
    for r,dn in enumerate(DIRS):
        for c in range(5): sheet.paste(avatar_frame(dn,c,v),(c*AW,r*AH))
    return sheet
SKINS=["skin1","skin2","skin3","skin4"]; HAIRS=["shadow","hair_brown","wood_md","hair_blond","sq_a_dk","wall_light"]
SHIRTS=["sq_a","sq_b","sq_c","sq_d","sq_e","green_md","cream","metal","sq_a_dk","sq_b_dk","sq_c_dk","sq_e_dk","wood_lt"]
PANTS=["shadow","wood_dk","sq_b_dk","metal","green_dk","sq_e_dk"]
def variants(n=30):
    rnd=random.Random(7); out=[]; seen=set()
    i=0
    while len(out)<n:
        v={"skin":SKINS[i%4],"shirt":SHIRTS[i%13],"hair":HAIRS[(i*5+i//13)%6],"pants":PANTS[(i*7+1)%6]}
        if v["pants"]==v["shirt"]: v["pants"]="shadow" if v["shirt"]!="shadow" else "wood_dk"
        if v["hair"]==v["shirt"]: i+=1; continue
        k=(v["shirt"],v["hair"],v["skin"])
        if k not in seen: seen.add(k); v["id"]=f"v{len(out):02d}"; out.append(v)
        i+=1
    return out

# ---------------- status icons ----------------
def build_icons():
    sheet=new(16*5,16); 
    for i,n in enumerate(["online","away","focus","talking","knock"]):
        im=new(16,16); d=ImageDraw.Draw(im)
        if n=="online": d.ellipse([3,3,12,12],fill=C["green_md"]); R(d,5,5,6,6,"green_lt")
        if n=="away": d.ellipse([3,3,12,12],fill=C["sq_d"]); R(d,7,5,8,8,"outline"); R(d,8,8,10,8,"outline")
        if n=="focus": d.ellipse([3,3,12,12],fill=C["sq_e"]); R(d,5,7,10,8,"cream")
        if n=="talking": R(d,2,3,13,10,"sq_b"); R(d,4,11,6,12,"sq_b"); R(d,4,6,5,7,"cream"); R(d,7,6,8,7,"cream"); R(d,10,6,11,7,"cream")
        if n=="knock": R(d,4,2,11,13,"wood_md"); R(d,9,7,9,8,"sq_d"); R(d,5,3,10,6,"wood_lt"); R(d,1,3,1,5,"sq_a"); R(d,13,3,13,5,"sq_a"); R(d,14,9,14,11,"sq_a") 
        outline(im); sheet.paste(im,(i*16,0))
    return sheet

# ---------------- map ----------------
MW,MH=48,30
def build_map():
    FW=lambda n:1+FW_NAMES.index(n); PFG=1+len(FW_NAMES); PR=lambda n:PFG+PR_NAMES.index(n)
    L={k:[[0]*MW for _ in range(MH)] for k in ("floor","walls","props_below","props_above","collision")}
    wall=[[False]*MW for _ in range(MH)]
    for x in range(MW): wall[0][x]=wall[MH-1][x]=True
    for y in range(MH): wall[y][0]=wall[y][MW-1]=True
    for x in range(32,47): wall[20][x]=True
    for y in range(20,29): wall[y][32]=wall[y][39]=True
    doors=[(35,20),(43,20)]
    for x,y in doors: wall[y][x]=False
    # floors
    for y in range(MH):
        for x in range(MW): L["floor"][y][x]=FW("wood" if (x+y)%5 else "wood_alt")
    zones=[]
    def fill(x0,y0,x1,y1,n):
        for y in range(y0,y1+1):
            for x in range(x0,x1+1): L["floor"][y][x]=FW(n)
    def zone(name,typ,x0,y0,x1,y1): zones.append((name,typ,x0*T,y0*T,(x1-x0+1)*T,(y1-y0+1)*T))
    def put(layer,x,y,n,col=False):
        L[layer][y][x]=PR(n)
        if col: L["collision"][y][x]=FW("collision")
    def squad(s,x0,y0,x1,y1,rows):
        fill(x0,y0,x1,y1,f"carpet_{s}"); zone(f"Squad {s.upper()}","squad",x0,y0,x1,y1)
        put("props_below",x0+1,y0,f"sign_{s}",True)
        put("props_below",x1-1,y0+1,"plant_tall_bottom",True); put("props_above",x1-1,y0,"plant_tall_top")
        for ry in rows:
            for dx in (2,6,10):
                x=x0+dx; put("props_below",x,ry,"desk_l",True); put("props_below",x+1,ry,"desk_r",True)
                put("props_above",x,ry,"monitor"); put("props_below",x,ry+1,"chair_up")
    squad("a",1,2,15,10,(4,8)); squad("b",16,2,31,10,(4,8)); squad("c",32,2,46,10,(4,8))
    squad("d",1,21,15,28,(23,26)); squad("e",16,21,31,28,(23,26))
    # meeting rooms
    for i,(x0,x1) in enumerate(((33,38),(40,46))):
        fill(x0,21,x1,28,"tile" if i==0 else "tile_alt"); zone(f"Meeting {i+1}","meeting",x0,21,x1,28)
        tx=x0+2 if i==0 else x0+2; ty=24
        for j,p in enumerate(["tl","tm","tr","bl","bm","br"]): put("props_below",tx+j%3,ty+j//3,f"table_{p}",True)
        for k in range(3): put("props_below",tx+k,ty-1,"chair_down"); put("props_below",tx+k,ty+2,"chair_up")
        put("props_below",tx-1,ty,"chair_right"); put("props_below",tx+3,ty+1,"chair_left")
        put("props_below",tx,21,"whiteboard_l",True); put("props_below",tx+1,21,"whiteboard_r",True)
        put("props_below",x1,28,"plant_small",True)
    for x,y in doors: L["floor"][y][x]=FW("door_threshold")
    put("props_below",34,19,"sign_meeting",True); put("props_below",44,19,"sign_meeting",True)
    # lounge
    fill(1,12,13,19,"carpet_lounge"); zone("Lounge","lounge",1,12,13,19)
    for j,p in enumerate(["tl","tm","tr","ml","mm","mr","bl","bm","br"]): L["floor"][15+j//3][5+j%3]=PR(f"rug_{p}")
    for k,p in enumerate("lmr"): put("props_below",5+k,14,f"sofa_{p}",True)
    put("props_below",6,16,"coffee_table",True); put("props_below",1,12,"coffee_machine",True); put("props_below",2,12,"water_cooler",True)
    put("props_below",3,12,"sign_lounge",True); put("props_below",12,12,"bookshelf",True); put("props_below",11,12,"bookshelf",True)
    put("props_below",9,14,"floor_lamp",True); put("props_below",1,19,"plant_small",True); put("props_below",13,19,"plant_small",True)
    put("props_below",9,17,"chair_left"); put("props_below",3,17,"chair_right")
    # standup
    fill(19,12,28,19,"tile"); zone("Standup","standup",19,12,28,19)
    put("props_below",23,15,"standup_marker"); put("props_below",24,15,"standup_marker"); put("props_below",23,16,"standup_marker"); put("props_below",24,16,"standup_marker")
    put("props_below",19,12,"sign_standup",True); put("props_below",28,12,"plant_small",True); put("props_below",20,12,"box",True)
    # walls
    for y in range(MH):
        for x in range(MW):
            if wall[y][x]:
                below = y+1<MH and wall[y+1][x]
                if below or y==MH-1: n="wall_top"
                else: n="wall_face_window" if (y==0 and x%6==3) else ("wall_face_shelf" if y==0 and x%6==0 and 0<x<MW-1 else "wall_face")
                L["walls"][y][x]=FW(n); L["collision"][y][x]=FW("collision")
    L["walls"][0][24]=PR("wall_clock")
    # build JSON
    def ts(name,img,first,names,cols,rows,collide):
        return {"firstgid":first,"name":name,"image":f"../tilesets/{name}.png","imagewidth":cols*T,"imageheight":rows*T,
            "tilewidth":T,"tileheight":T,"margin":0,"spacing":0,"columns":cols,"tilecount":len(names),
            "tiles":[{"id":i,"properties":[{"name":"name","type":"string","value":n}]+([{"name":"collides","type":"bool","value":True}] if n in collide else [])} for i,n in enumerate(names)]}
    layers=[]; lid=1
    for k in ("floor","walls","props_below","props_above","collision"):
        layers.append({"id":lid,"name":k,"type":"tilelayer","width":MW,"height":MH,"x":0,"y":0,"opacity":1,"visible":k!="collision",
                       "data":[g for row in L[k] for g in row]}); lid+=1
    objs=[{"id":i+1,"name":n,"type":t,"x":x,"y":y,"width":w,"height":h,"rotation":0,"visible":True,
           "properties":[{"name":"name","type":"string","value":n}]} for i,(n,t,x,y,w,h) in enumerate(zones)]
    layers.append({"id":lid,"name":"zones","type":"objectgroup","draworder":"topdown","opacity":1,"visible":True,"x":0,"y":0,"objects":objs})
    m={"type":"map","version":"1.10","tiledversion":"1.10.2","orientation":"orthogonal","renderorder":"right-down","infinite":False,
       "width":MW,"height":MH,"tilewidth":T,"tileheight":T,"compressionlevel":-1,"nextlayerid":lid+1,"nextobjectid":len(objs)+1,
       "layers":layers,"tilesets":[ts("office_floor_walls",None,1,FW_NAMES,8,3,{"collision"}),ts("office_props",None,PFG,PR_NAMES,8,6,set())]}
    return m
def tsx(name,names,rows,collide=()):
    t="\n".join(f' <tile id="{i}"><properties><property name="name" value="{n}"/>{'<property name="collides" type="bool" value="true"/>' if n in collide else ''}</properties></tile>' for i,n in enumerate(names))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="{name}" tilewidth="32" tileheight="32" spacing="0" margin="0" tilecount="{len(names)}" columns="8">
 <image source="{name}.png" width="256" height="{rows*32}"/>
{t}
</tileset>
'''
def render_map(m,sheets):
    img=Image.new("RGBA",(MW*T,MH*T),C["outline"]); tiles=[]
    for ts_,sh in zip(m["tilesets"],sheets):
        for i in range(ts_["tilecount"]): tiles.append(sh.crop(((i%8)*T,(i//8)*T,(i%8+1)*T,(i//8+1)*T)))
    for L in m["layers"]:
        if L["type"]!="tilelayer" or not L["visible"]: continue
        for idx,g in enumerate(L["data"]):
            if g: t=tiles[g-1]; img.alpha_composite(t,((idx%MW)*T,(idx//MW)*T))
    return img
def validate(m):
    errs=[]; tot=sum(t["tilecount"] for t in m["tilesets"])
    fg=[t["firstgid"] for t in m["tilesets"]]
    if fg!=[1,1+m["tilesets"][0]["tilecount"]]: errs.append("firstgid")
    names=[l["name"] for l in m["layers"]]
    if names!=["floor","walls","props_below","props_above","collision","zones"]: errs.append("layers")
    for l in m["layers"]:
        if l["type"]=="tilelayer":
            if len(l["data"])!=MW*MH: errs.append("len "+l["name"])
            bad=[g for g in l["data"] if not (0<=g<=tot)]
            if bad: errs.append(f"gid out of range in {l['name']}")
    json.loads(json.dumps(m)); return errs

def main():
    os.chdir(ROOT)
    fw=build_floor_walls(); fw.save(P("tilesets","office_floor_walls.png"))
    pr=build_props(); pr.save(P("tilesets","office_props.png"))
    open(P("tilesets","office_floor_walls.tsx"),"w").write(tsx("office_floor_walls",FW_NAMES,3,{"collision"}))
    open(P("tilesets","office_props.tsx"),"w").write(tsx("office_props",PR_NAMES,6))
    vs=variants(30); json.dump(vs,open(P("sprites","variants.json"),"w"),indent=1)
    sheets=[]
    for v in vs: s=build_avatar(v); s.save(P("sprites",f"avatar_{v['id']}.png")); sheets.append(s)
    build_icons().save(P("ui","status_icons.png"))
    m=build_map(); errs=validate(m); json.dump(m,open(P("maps","office.json"),"w"))
    print("map validation errors:",errs)
    render_map(m,[fw,pr]).save(P("previews","map_1x.png"))
    # contact sheet 2x: each variant = idle down, left, right, up
    cols=6; cw=4*AW; cs=Image.new("RGBA",(cols*cw,5*AH),C["cream"])
    for i,s in enumerate(sheets):
        for r in range(4): cs.alpha_composite(s.crop((0,r*AH,AW,(r+1)*AH)),((i%cols)*cw+r*AW,(i//cols)*AH))
    cs.resize((cs.width*2,cs.height*2),Image.NEAREST).save(P("previews","avatars_contact_2x.png"))
    # palette
    open(P("docs","palette.hex"),"w").write("\n".join(h for _,h,_ in PALETTE)+"\n")
    sw=Image.new("RGBA",(8*16,4*16)); d=ImageDraw.Draw(sw)
    for i,(n,h,_) in enumerate(PALETTE): d.rectangle([(i%8)*16,(i//8)*16,(i%8)*16+15,(i//8)*16+15],fill=C[n])
    sw.save(P("docs","palette.png"))
    # walk gif, avatar v00, 4x, 8fps
    frames=[]
    for r in range(4):
        for c in (1,2,3,4,1,2,3,4):
            f=Image.new("RGBA",(AW,AH),C["cream"]); f.alpha_composite(sheets[0].crop((c*AW,r*AH,(c+1)*AW,(r+1)*AH)))
            frames.append(f.convert("RGB").resize((AW*4,AH*4),Image.NEAREST))
    frames[0].save(P("previews","walk_v00.gif"),save_all=True,append_images=frames[1:],duration=125,loop=0)
if __name__=="__main__": main()
