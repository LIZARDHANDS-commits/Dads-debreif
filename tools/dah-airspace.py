#!/usr/bin/env python3
# Makes the SOF 3D view's Canadian airspace from NAV CANADA's Designated Airspace Handbook (DAH), edition effective 0901Z 03 SEP 2026 to 0901Z 29 OCT 2026
# ("Source of Canadian Airspace Data (c) 2026 Transport Canada"). Run it again at each new DAH edition (check the hand-typed numbers below against it) and
# commit what it writes. From the repo root:
#   python3 tools/dah-airspace.py --dah PATH   both files below; PATH is the DAH's text, made with `pdftotext -layout` from the edition's PDF (the PDF is in
#                                              the project files' manuals; neither the PDF nor its text ever goes in the repo)
#   python3 tools/dah-airspace.py              only the first file (no DAH text needed)
#   add --dry to print what would be written, writing nothing.
#
# It writes:
# 1. src/airfields/airspace/data.js, the AIRSPACE list only (the file's header is kept): the first 25 entries round Moose Jaw (SOF-41, Dad 7 Oct 2026),
#    typed by hand from the DAH pages each one cites, below in `moose_jaw_entries()`. They load with the SOF, so Moose Jaw's first picture has them.
# 2. src/airfields/airspace/dah/cymj.js, the wider set out to the 3D view's 900 NM area (Dad, 8 Oct 2026): the terminal control areas, control
#    zones, control area extensions and transition areas of Winnipeg, Edmonton, Calgary, Brandon, Southport, Dauphin, Yorkton, Prince Albert,
#    North Battleford, Lloydminster, Cold Lake, Medicine Hat, Red Deer and Lethbridge (and the zones inside the Edmonton, Calgary and Winnipeg terminal
#    areas: Springbank, Villeneuve, Namao, St. Andrews), and every restricted, danger and advisory area inside CYMJ's 900 NM square, read from the DAH's
#    text by `wide_entries()`. It is loaded only when the 3D view opens at Moose Jaw (sites/cymj.js `loadAirspace`, with the FAA file).
#    Gimli, Estevan and Wainwright have no zone, transition area or terminal area in this edition (only CYA420(T) Gimli, CYA317(P) Estevan, CYR203).
#
# Only numbers are kept (coordinates, radii, floors and ceilings), with each area's designator, place and the DAH page and paragraph to look it up;
# never the DAH's words. Arcs (DAH 1.1.0-9) are written out as points every 3 degrees or less on a sphere from the DAH's centre and radius; straight
# sides are joined as given (great circles, DAH 1.1.0-8); a side "along latitude" or along the Canada/USA border (49 N) follows that latitude.
# Every entry is the shape airspace-data.js describes; the SOF checks each with airspace-model.js `checkAirspace` and skips (and names) any that fails.
import argparse, math, re, json, os

# ---- Helpers (gen.py, 7 Oct 2026) ----------------------------------------------------------------------------------------------------------------
R_NM = 3440.065
def dms(s):
    m = re.match(r'([NSEW])(\d+)°(\d+)\'([\d.]+)"', s.replace(' ', ''))
    h, d, mi, se = m.groups(); v = int(d) + int(mi)/60 + float(se)/3600
    return -v if h in 'SW' else v
def P(lat, lon): return (dms(lat), dms(lon))
def brg(c, p):
    la1, lo1, la2, lo2 = map(math.radians, (c[0], c[1], p[0], p[1]))
    y = math.sin(lo2-lo1)*math.cos(la2); x = math.cos(la1)*math.sin(la2)-math.sin(la1)*math.cos(la2)*math.cos(lo2-lo1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360
def dest(c, b, nm):
    la1, lo1 = math.radians(c[0]), math.radians(c[1]); d = nm/R_NM; b = math.radians(b)
    la2 = math.asin(math.sin(la1)*math.cos(d)+math.cos(la1)*math.sin(d)*math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b)*math.sin(d)*math.cos(la1), math.cos(d)-math.sin(la1)*math.sin(la2))
    return (math.degrees(la2), math.degrees(lo2))
def arc(c, r, a, b, cw, step=3):
    b0, b1 = brg(c, a), brg(c, b)
    span = (b1-b0) % 360 if cw else (b0-b1) % 360
    n = max(2, int(span/step)); out = []
    for i in range(1, n):
        t = b0 + (span*i/n if cw else -span*i/n); out.append(dest(c, t, r))
    return out
def ring(segs):
    # segs: list of ('pt', p) or ('arc', centre, r, cw) ; arc goes from previous point to next point
    pts = []; corners = []
    for i, s in enumerate(segs):
        if s[0] == 'pt': corners.append(len(pts)); pts.append(s[1])
        else:
            nxt = segs[i+1][1]; pts += arc(s[1], s[2], pts[-1], nxt, s[3])
    if pts[0] == pts[-1]: pts = pts[:-1]; corners = [c for c in corners if c < len(pts)]
    return {'type': 'polygon', 'points': [[round(a, 5), round(b, 5)] for a, b in pts], 'corners': sorted(set(corners))}
def circle(c, r): return {'type': 'circle', 'centre': [round(c[0], 5), round(c[1], 5)], 'radiusNm': r}

# ---- The first 25 (SOF-41) ---------------------------------------------------------------------------------------------------------------------------

def moose_jaw_entries():
    """The first 25 entries (SOF-41), typed from the DAH pages each cites; unchanged since 7 Oct 2026 (gen.py)."""
    VOR = P('N50°19\'52.00"', 'W105°33\'48.00"')
    out = []
    def add(id, name, kind, cls, floor, ceil, shape, source):
        out.append(dict(id=id, name=name, kind=kind, classLetter=cls, floor=floor, ceiling=ceil, shape=shape, source=source))
    pt = lambda a, b: ('pt', P(a, b))
    SFC = {'ft': 0, 'ref': 'SFC'}
    # Control zones
    CYMJ = P('N50°19\'49.00"', 'W105°33\'33.00"')
    add('CYMJ-CZ', 'Moose Jaw control zone', 'control-zone', 'D', SFC, {'ft': 8000, 'ref': 'ASL'}, ring([
        pt('N50°26\'10.00"', 'W105°45\'31.00"'), pt('N50°25\'29.00"', 'W105°43\'12.00"'), pt('N50°25\'33.00"', 'W105°31\'58.00"'),
        pt('N50°23\'41.00"', 'W105°28\'12.00"'), pt('N50°23\'50.00"', 'W105°19\'12.00"'), ('arc', CYMJ, 10, True), pt('N50°26\'10.00"', 'W105°45\'31.00"')]),
        'DAH p. 72, 3.3.4-7 (Class D, 3.3.4-5)')
    add('CYQR-CZ', 'Regina control zone', 'control-zone', 'D', SFC, {'ft': 5000, 'ref': 'ASL'}, circle(P('N50°25\'55.00"', 'W104°39\'57.00"'), 5), 'DAH p. 72, 3.3.4-9 (Class D, 3.3.4-5)')
    XE = P('N52°10\'15.00"', 'W106°41\'59.00"')
    add('CYXE-CZ', 'Saskatoon control zone', 'control-zone', 'C', SFC, {'ft': 5000, 'ref': 'ASL'}, ring([
        pt('N52°16\'43.85"', 'W106°37\'44.94"'), ('arc', XE, 7, True), pt('N52°17\'08.75"', 'W106°43\'47.45"'), pt('N52°15\'12.88"', 'W106°42\'41.64"'),
        ('arc', XE, 5, True), pt('N52°14\'52.11"', 'W106°38\'55.32"'), pt('N52°16\'43.85"', 'W106°37\'44.94"')]), 'DAH p. 72, 3.3.4-3 (Class C, 3.3.4-1)')
    add('CYYN-CZ', 'Swift Current control zone', 'control-zone', 'E', SFC, {'ft': 3000, 'ref': 'AGL'}, circle(P('N50°17\'31.00"', 'W107°41\'26.00"'), 5),
        'DAH p. 74, 3.3.4-49 (Class E, 3.3.4-16); no ceiling given, so the DAH definition applies: surface to 3000 ft above the aerodrome')
    # MTCA
    add('CYMJ-MTCA-A', 'Moose Jaw MTCA (inner)', 'mtca', None, {'ft': 700, 'ref': 'AGL'}, {'ft': 60000, 'ref': 'FL'}, ring([
        pt('N50°17\'45.00"', 'W106°59\'30.00"'), pt('N50°19\'30.00"', 'W106°48\'40.00"'), pt('N50°21\'00.00"', 'W106°15\'15.00"'), pt('N50°28\'00.00"', 'W105°45\'30.00"'),
        pt('N50°30\'30.00"', 'W105°27\'30.00"'), pt('N50°16\'30.00"', 'W105°00\'00.00"'), pt('N50°08\'30.00"', 'W104°30\'00.00"'), pt('N49°43\'22.00"', 'W104°30\'00.00"'),
        ('arc', VOR, 55, True), pt('N50°17\'45.00"', 'W106°59\'30.00"')]), 'DAH p. 70, 3.3.3-5 (E to 12,500, B above 12,500 to below 18,000, A 18,000 to FL600: 3.3.3-2 to 4)')
    add('CYMJ-MTCA-B', 'Moose Jaw MTCA (outer, south-west)', 'mtca', None, {'ft': 2200, 'ref': 'AGL'}, {'ft': 60000, 'ref': 'FL'}, ring([
        pt('N49°43\'23.00"', 'W104°30\'00.00"'), pt('N49°23\'23.00"', 'W104°30\'00.00"'), ('arc', VOR, 70, True), pt('N49°57\'12.00"', 'W107°16\'46.00"'),
        pt('N50°17\'44.00"', 'W106°59\'34.00"'), ('arc', VOR, 55, False), pt('N49°43\'23.00"', 'W104°30\'00.00"')]), 'DAH p. 70, 3.3.3-6 (classes as 3.3.3-2 to 4)')
    # Control area extensions
    QR = P('N50°25\'55.00"', 'W104°39\'57.00"')
    add('CYQR-CAE', 'Regina control area extension', 'terminal', 'E', {'ft': 4000, 'ref': 'ASL'}, {'ft': 12500, 'ref': 'ASL'}, ring([
        pt('N50°43\'14.00"', 'W105°27\'40.00"'), pt('N50°30\'30.00"', 'W105°27\'30.00"'), pt('N50°16\'30.00"', 'W105°00\'00.00"'), pt('N50°08\'30.00"', 'W104°30\'00.00"'),
        pt('N49°51\'33.00"', 'W104°30\'00.00"'), ('arc', QR, 35, False), pt('N50°43\'14.00"', 'W105°27\'40.00"')]), 'DAH p. 68, 3.3.2-47 (Class E, 12,500 ft and below: 3.3.2-2)')
    add('CYXE-CAE', 'Saskatoon control area extension', 'terminal', 'E', {'ft': 3900, 'ref': 'ASL'}, {'ft': 12500, 'ref': 'ASL'}, circle(P('N52°10\'52.00"', 'W106°43\'11.00"'), 35), 'DAH p. 68, 3.3.2-50 (Class E: 3.3.2-2)')
    # Restricted
    AS = P('N49°44\'05.00"', 'W105°56\'49.00"')
    add('CYR303', 'CYR303 Moose Jaw', 'restricted', None, SFC, {'ft': 10000, 'ref': 'ASL'}, ring([
        pt('N49°59\'00.00"', 'W105°58\'00.00"'), pt('N49°59\'00.00"', 'W105°33\'34.00"'), pt('N49°52\'00.00"', 'W105°32\'00.00"'), pt('N49°45\'00.00"', 'W105°31\'42.00"'),
        pt('N49°45\'00.00"', 'W105°49\'14.00"'), ('arc', AS, 5, False), pt('N49°49\'00.00"', 'W105°58\'00.00"'), pt('N49°59\'00.00"', 'W105°58\'00.00"')]),
        'DAH p. 145; active 1400-0030Z Mon-Fri (1430-0100Z 1 Nov to 15 Feb) when Moose Jaw Twr is open, other times by NOTAM')
    # Advisory areas
    def cya(id, p, pts, floor, ceil):
        add(id, id + '(M) Moose Jaw', 'advisory', 'F', floor, ceil, ring(pts),
            f'DAH p. {p}; active 1400-0030Z Mon-Fri (1430-0100Z 1 Nov to 15 Feb) when Moose Jaw Terminal is open, other times by NOTAM')
    F6 = {'ft': 6000, 'ref': 'ASL'}
    cya('CYA304', 181, [pt('N50°21\'44.65"', 'W105°57\'02.37"'), ('arc', VOR, 15, False), pt('N50°08\'42.30"', 'W105°49\'23.61"'), pt('N49°49\'58.89"', 'W106°15\'02.40"'),
        ('arc', VOR, 40, True), pt('N50°20\'05.00"', 'W106°36\'14.13"'), pt('N50°21\'00.00"', 'W106°15\'15.00"'), pt('N50°21\'44.65"', 'W105°57\'02.37"')], F6, {'ft': 19000, 'ref': 'FL'})
    cya('CYA305', 182, [pt('N50°08\'42.30"', 'W105°49\'23.61"'), ('arc', VOR, 15, False), pt('N50°05\'38.33"', 'W105°26\'27.64"'), pt('N49°41\'52.86"', 'W105°14\'30.90"'),
        ('arc', VOR, 40, True), pt('N49°49\'58.89"', 'W106°15\'02.40"'), pt('N50°08\'42.30"', 'W105°49\'23.61"')], F6, {'ft': 19000, 'ref': 'FL'})
    cya('CYA307', 182, [pt('N50°05\'38.33"', 'W105°26\'27.64"'), ('arc', VOR, 15, False), pt('N50°21\'41.94"', 'W105°10\'33.34"'), pt('N50°16\'30.00"', 'W105°00\'00.00"'),
        pt('N50°09\'31.41"', 'W104°33\'36.08"'), ('arc', VOR, 40, True), pt('N49°41\'52.86"', 'W105°14\'30.90"'), pt('N50°05\'38.33"', 'W105°26\'27.64"')], F6, {'ft': 19000, 'ref': 'FL'})
    cya('CYA310', 183, [pt('N50°20\'05.00"', 'W106°36\'14.13"'), ('arc', VOR, 40, False), pt('N49°49\'58.89"', 'W106°15\'02.40"'), pt('N49°27\'28.71"', 'W106°45\'32.34"'),
        ('arc', VOR, 70, True), pt('N49°57\'12.71"', 'W107°16\'45.90"'), pt('N50°17\'45.00"', 'W106°59\'30.00"'), pt('N50°19\'30.00"', 'W106°48\'40.00"'), pt('N50°20\'05.00"', 'W106°36\'14.13"')], F6, {'ft': 30000, 'ref': 'FL'})
    cya('CYA311', 183, [pt('N49°49\'58.89"', 'W106°15\'02.40"'), ('arc', VOR, 40, False), pt('N49°40\'43.94"', 'W105°46\'23.41"'), pt('N49°11\'23.48"', 'W105°55\'48.30"'),
        ('arc', VOR, 70, True), pt('N49°27\'28.71"', 'W106°45\'32.34"'), pt('N49°49\'58.89"', 'W106°15\'02.40"')], F6, {'ft': 30000, 'ref': 'FL'})
    cya('CYA315', 183, [pt('N49°40\'43.94"', 'W105°46\'23.41"'), ('arc', VOR, 40, False), pt('N49°41\'52.86"', 'W105°14\'30.90"'), pt('N49°13\'19.49"', 'W105°00\'31.54"'),
        ('arc', VOR, 70, True), pt('N49°11\'23.48"', 'W105°55\'48.30"'), pt('N49°40\'43.94"', 'W105°46\'23.41"')], F6, {'ft': 30000, 'ref': 'FL'})
    cya('CYA316', 184, [pt('N49°41\'52.86"', 'W105°14\'30.90"'), ('arc', VOR, 40, False), pt('N50°09\'31.41"', 'W104°33\'36.08"'), pt('N50°08\'30.00"', 'W104°30\'00.00"'),
        pt('N49°23\'22.59"', 'W104°30\'00.00"'), ('arc', VOR, 70, True), pt('N49°13\'19.49"', 'W105°00\'31.54"'), pt('N49°41\'52.86"', 'W105°14\'30.90"')], F6, {'ft': 30000, 'ref': 'FL'})

    # More from the DAH (Dad, 7 Oct, from ForeFlight's chart)
    QRA = P('N50°25\'55.00"', 'W104°39\'57.00"'); XEA = P('N52°10\'15.00"', 'W106°41\'59.00"'); YNA = P('N50°17\'31.00"', 'W107°41\'26.00"')
    add('CYQR-TA', 'Regina transition area', 'terminal', 'E', {'ft': 3000, 'ref': 'ASL'}, {'ft': 12500, 'ref': 'ASL'}, circle(QRA, 15), 'DAH p. 64, 3.3.1-34 (Class E: 3.3.1-2); excluding the Moose Jaw MTCA')
    add('CYXE-TA', 'Saskatoon transition area', 'terminal', 'E', {'ft': 700, 'ref': 'AGL'}, {'ft': 12500, 'ref': 'ASL'}, circle(XEA, 15), 'DAH p. 64, 3.3.1-36 (Class E: 3.3.1-2); no floor given, so the DAH definition applies: from 700 ft AGL')
    add('CYYN-TA', 'Swift Current transition area', 'terminal', 'E', {'ft': 700, 'ref': 'AGL'}, {'ft': 12500, 'ref': 'ASL'}, circle(YNA, 15), 'DAH p. 64, 3.3.1-42 (Class E: 3.3.1-2); no floor given, so the DAH definition applies: from 700 ft AGL')
    add('CYYN-CAE', 'Swift Current control area extension', 'terminal', 'E', {'ft': 2200, 'ref': 'AGL'}, {'ft': 12500, 'ref': 'ASL'}, circle(P('N50°17\'49.00"', 'W107°41\'27.00"'), 25), 'DAH p. 69, 3.3.2-56 (Class E: 3.3.2-2); no floor given, so the DAH definition applies: from 2200 ft AGL; excluding the Moose Jaw MTCA')
    add('CYQR-B', 'Regina Class B (above 12,500)', 'terminal', None, {'ft': 12500, 'ref': 'ASL'}, {'ft': 18000, 'ref': 'ASL'}, circle(P('N50°22\'11.00"', 'W104°34\'23.00"'), 60), 'DAH p. 68, 3.3.2-48 (Class B above 12,500 ft: 3.3.2-1; to below 18,000 ft); excluding the Moose Jaw MTCA')
    add('CYXE-B', 'Saskatoon Class B (above 12,500)', 'terminal', None, {'ft': 12500, 'ref': 'ASL'}, {'ft': 18000, 'ref': 'ASL'}, circle(P('N52°10\'52.00"', 'W106°43\'11.00"'), 60), 'DAH p. 68, 3.3.2-51 (Class B above 12,500 ft: 3.3.2-1; to below 18,000 ft)')
    add('CYYN-B', 'Swift Current Class B (above 12,500)', 'terminal', None, {'ft': 12500, 'ref': 'ASL'}, {'ft': 18000, 'ref': 'ASL'}, circle(P('N50°17\'49.00"', 'W107°41\'27.00"'), 60), 'DAH p. 69, 3.3.2-57 (Class B above 12,500 ft: 3.3.2-1; to below 18,000 ft); excluding the Moose Jaw MTCA')
    add('CYR301', 'CYR301 Camp Dundurn', 'restricted', None, SFC, {'ft': 3000, 'ref': 'ASL'}, ring([pt('N51°58\'30.00"', 'W106°43\'30.00"'), pt('N51°58\'30.00"', 'W106°34\'00.00"'), pt('N51°54\'30.00"', 'W106°31\'20.00"'), pt('N51°45\'30.00"', 'W106°31\'20.00"'), pt('N51°45\'30.00"', 'W106°43\'30.00"'), pt('N51°58\'30.00"', 'W106°43\'30.00"')]), 'DAH p. 144; surface to 3000 ft continuous (south of N51°54\' also above 3000 ft to FL280 by NOTAM, not drawn)')
    add('CYA306', 'CYA306(T) Delisle', 'advisory', 'F', SFC, {'ft': 5000, 'ref': 'ASL'}, ring([pt('N51°59\'53.00"', 'W106°58\'20.00"'), pt('N51°47\'40.00"', 'W106°58\'20.00"'), pt('N51°47\'40.00"', 'W107°26\'40.00"'), pt('N51°59\'53.00"', 'W107°26\'40.00"'), pt('N51°59\'53.00"', 'W106°58\'20.00"')]), 'DAH p. 182; continuous, daylight')
    return out


# ---- The wider set (Dad, 8 Oct 2026): read from the DAH's own text, boundary numbers and page cites only ----------------------------------------------
#
# The DAH text (pdftotext -layout of the edition's PDF) is read from a path given on the command line; it is never put in the repo. What is kept of it is
# only numbers (coordinates, radii, floors and ceilings), the area's designator and place name, and the page and paragraph to look it up.

# The places whose terminal areas, control zones, control area extensions and transition areas are drawn (Dad's list, 8 Oct 2026, plus the zones that sit
# inside the Edmonton, Calgary and Winnipeg terminal areas). Name as the DAH heads it (up to the comma) -> (ICAO, the name the SOF shows).
WIDE_PLACES = {
    'Calgary': ('CYYC', 'Calgary'), 'Calgary Intl': ('CYYC', 'Calgary'), 'Springbank': ('CYBW', 'Springbank'),
    'Edmonton': ('CYEG', 'Edmonton'), 'Edmonton Intl': ('CYEG', 'Edmonton'), 'Villeneuve': ('CZVL', 'Villeneuve'), 'Namao': ('CYED', 'Namao'),
    'Winnipeg': ('CYWG', 'Winnipeg'), 'Winnipeg/James Armstrong Richardson Intl': ('CYWG', 'Winnipeg'), 'St. Andrews': ('CYAV', 'St. Andrews'),
    'Brandon': ('CYBR', 'Brandon'), 'Brandon Muni': ('CYBR', 'Brandon'), 'Southport': ('CYPG', 'Southport'), 'Dauphin': ('CYDN', 'Dauphin'),
    'Yorkton': ('CYQV', 'Yorkton'), 'Yorkton Muni': ('CYQV', 'Yorkton'), 'Prince Albert': ('CYPA', 'Prince Albert'),
    'Prince Albert (Glass Field)': ('CYPA', 'Prince Albert'), 'North Battleford': ('CYQW', 'North Battleford'),
    'North Battleford (Cameron McIntosh)': ('CYQW', 'North Battleford'), 'Lloydminster': ('CYLL', 'Lloydminster'), 'Cold Lake': ('CYOD', 'Cold Lake'),
    'Medicine Hat': ('CYXH', 'Medicine Hat'), 'Red Deer': ('CYQF', 'Red Deer'), 'Lethbridge': ('CYQL', 'Lethbridge'),
}
# Each field's position and elevation (ft), from OurAirports' airports.csv (public domain), read 8 Oct 2026: the elevation turns a height above the ground
# (AGL) into one above sea level at that field (the 3D view otherwise reads AGL above Moose Jaw's elevation, 1,700 ft too low at Calgary), and the
# position finds the nearest field for an area that sits below Moose Jaw's elevation (`low_floor`).
FIELDS = {
    'CYYC': (51.1188, -114.0099, 3557), 'CYBW': (51.104, -114.3694, 3940), 'CYEG': (53.3097, -113.58, 2373), 'CZVL': (53.6675, -113.854, 2256),
    'CYED': (53.6679, -113.4725, 2257), 'CYWG': (49.91, -97.2399, 783), 'CYAV': (50.0564, -97.0325, 760), 'CYBR': (49.91, -99.9519, 1343),
    'CYPG': (49.9031, -98.2738, 885), 'CYDN': (51.1008, -100.052, 999), 'CYQV': (51.2647, -102.462, 1635), 'CYPA': (53.2142, -105.673, 1405),
    'CYQW': (52.7694, -108.2437, 1799), 'CYLL': (53.3092, -110.073, 2193), 'CYOD': (54.405, -110.279, 1775), 'CYXH': (50.0189, -110.721, 2352),
    'CYQF': (52.1822, -113.894, 2968), 'CYQL': (49.6303, -112.8, 3048),
}
FIELD_ELEVATION_FT = {icao: f[2] for icao, f in FIELDS.items()}
# CYMJ's elevation (src/airfields/catalog.js): the 3D view draws SFC there.
HOME_ELEVATION_FT = 1892
# The section number's third part -> what it is (DAH 3.x.1 to 3.x.4).
SECTION = {'1': ('TA', 'transition area', 'terminal'), '2': ('CAE', 'control area extension', 'terminal'),
           '3': ('TCA', 'terminal control area', 'terminal'), '4': ('CZ', 'control zone', 'control-zone')}
# The square the 3D view can show round CYMJ: 900 NM across (scene3d-model.js MAX_AREA_NM), on the same flat map as src/core/geo.js.
HALF_SQUARE_NM = 450
# CYMJ's position as the 3D view centres it (src/airfields/catalog.js).
WIDE_CENTRE = (50.3303, -105.559)
EARTH_RADIUS_NM = 6371000 / 1852
# A DAH point is drawn as a vertical edge only where the outline turns by this much or more (an estimate, as tools/faa-airspace.mjs): Dad asked for
# corner posts at the major corners only, not along arcs or every small step.
CORNER_DEG = 30
# Already drawn in airspace-data.js (the first 25, SOF-41): never repeated here.
FIRST_SET_PLACES = ('Moose Jaw', 'Regina', 'Saskatoon', 'Swift Current')
FIRST_SET_AREAS = ('CYR301', 'CYR303', 'CYA304', 'CYA305', 'CYA306', 'CYA307', 'CYA310', 'CYA311', 'CYA315', 'CYA316')

COORD = r"([NS])\s*(\d+)°\s*(\d+)'\s*([\d.]+)\"\s*([EW])\s*(\d+)°\s*(\d+)'\s*([\d.]+)\""
NOISE = re.compile(r"©|Source of Canadian Airspace Data|Effective 0901Z|DESIGNATED AIRSPACE HANDBO|DAH\s+\w+ \d+, 20\d\d|^\s*(RESTRICTED|ADVISORY|DANGER) AREAS(\s{3,}|\s*$)|^\s*\w+ FLIGHT INFORMATION REGION(\s{3,}|\s*$)")
PAGE_LINE = re.compile(r'^\s{40,}(\d{1,3})\s*$')
FT = '[´\'`]'


def coord(m, i=0):
    g = m.groups()[i:i + 8]
    lat = int(g[1]) + int(g[2]) / 60 + float(g[3]) / 3600
    lon = int(g[5]) + int(g[6]) / 60 + float(g[7]) / 3600
    return (-lat if g[0] == 'S' else lat, -lon if g[4] == 'W' else lon)


def read_dah(path):
    """The DAH text's lines, each with the printed page it is on (the number is printed below a page's text; a line's page is the next number after
    it), and the noise lines (page headers and footers, copyright lines) blanked. Stops if the page numbers do not run in order."""
    lines = open(path, encoding='utf-8').read().replace('\f', '\n').split('\n')
    found = [(i, int(m.group(1))) for i, l in enumerate(lines) for m in [PAGE_LINE.match(l)] if m]
    for (_, a), (_, b) in zip(found, found[1:]):
        if b != a + 1:
            raise SystemExit(f'DAH page numbers out of order ({a} then {b}): check the text file')
    pages = [None] * len(lines)
    k = 0
    for i in range(len(lines)):
        while k < len(found) and found[k][0] < i:
            k += 1
        pages[i] = found[k][1] if k < len(found) else None
    for i, _ in found:
        lines[i] = ''
    clean = ['' if NOISE.search(l) else l for l in lines]
    return clean, pages


def ft_of(s):
    return int(s.replace(',', ''))


def parse_limits(lead):
    """Floor and ceiling from the words before "within the area" (FIR items): ([ft, ref] or None, [ft, ref] or None, class letter or None, below?)."""
    cls = re.search(r'Class ([A-F]) (?:airspace|equivalent)', lead)
    cls = cls.group(1) if cls else None
    n = r'([\d,]+)' + FT + r'\s*(AGL)?'
    m = re.search(r'(?:from|above|upwards from) ' + n + r'\s*to (below )?' + n, lead)
    if m:
        return [ft_of(m.group(1)), 'AGL' if m.group(2) else 'ASL'], [ft_of(m.group(4)), 'AGL' if m.group(5) else 'ASL'], cls, bool(m.group(3))
    m = re.search(r'(?:from|above) ' + n, lead)
    if m:
        return [ft_of(m.group(1)), 'AGL' if m.group(2) else 'ASL'], None, cls, False
    m = re.search(r'\bto (below )?' + n, lead)
    if m:
        return None, [ft_of(m.group(2)), 'AGL' if m.group(3) else 'ASL'], cls, bool(m.group(1))
    return None, None, cls, False


def parse_shape(text):
    """The boundary in `text` as gen.py segments, or a circle: ('circle', centre, radius) or ('ring', segs, notes). None when it cannot be read."""
    tokens = []
    pat = re.compile(COORD + r"|(?:arc of a )?circle of:?\s*([\d.]+)\s*miles?|(counter-clockwise|anti-clockwise|clockwise)|along latitude|along the Can/USA bdry|point of beginning|Excluding", re.I)
    for m in pat.finditer(text):
        s = m.group(0).lower()
        if m.group(1):
            tokens.append(('pt', coord(m)))
        elif m.group(9):
            tokens.append(('arc' if s.startswith('arc') else 'circle', float(m.group(9))))
        elif m.group(10):
            tokens.append(('dir', not s.startswith(('counter', 'anti'))))
        elif s.startswith('along'):
            tokens.append(('par', None))
        elif s.startswith('point'):
            tokens.append(('pob', None))
        else:
            tokens.append(('excl', None))
    notes = []
    if any(t[0] == 'excl' for t in tokens):
        notes.append('has an exclusion, not cut out here')
        tokens = tokens[:[t[0] for t in tokens].index('excl')]
    if tokens and tokens[0][0] == 'circle':
        pts = [t for t in tokens if t[0] == 'pt']
        return ('circle', pts[0][1], tokens[0][1], notes) if pts else None
    segs = []
    i = 0
    pending = None
    while i < len(tokens):
        kind, val = tokens[i]
        if kind == 'pt':
            segs.append(('pt', val))
        elif kind == 'dir':
            pending = val
        elif kind == 'arc':
            # "thence (counter-)clockwise along the arc of a circle of R miles radius centred on <centre> to <point>"
            centre = tokens[i + 1]
            if centre[0] != 'pt' or pending is None:
                return None
            segs.append(('arc', centre[1], val, pending))
            pending = None
            i += 1
        elif kind == 'par':
            segs.append(('par',))
        elif kind == 'pob':
            break
        i += 1
    if not segs or segs[0][0] != 'pt':
        return None
    if segs[-1][0] != 'pt':
        return None
    first, last = segs[0][1], segs[-1][1]
    if abs(first[0] - last[0]) > 1e-4 or abs(first[1] - last[1]) > 1e-4:
        segs.append(('pt', first))  # the DAH closes on its point of beginning; a ring that does not is closed here
        notes.append('closed to its first point')
    return ('ring', segs, notes)


def wide_ring(segs):
    """gen.py's ring(), with two more: a 'par' side runs along the latitude of its two ends (the DAH's "along latitude" and the border at 49° N), and
    corners are only the DAH points where the outline turns by CORNER_DEG or more. Points rounded to 4 decimals (about 10 m)."""
    pts = []
    is_dah = []
    for i, s in enumerate(segs):
        if s[0] == 'pt':
            pts.append(s[1])
            is_dah.append(True)
        elif s[0] == 'arc':
            nxt = segs[i + 1][1]
            for p in arc(s[1], s[2], pts[-1], nxt, s[3]):
                pts.append(p)
                is_dah.append(False)
        else:  # 'par'
            a, b = pts[-1], segs[i + 1][1]
            n = max(1, int(abs(b[1] - a[1]) / 0.25))  # a point every quarter degree of longitude at most
            for k in range(1, n):
                pts.append((a[0], a[1] + (b[1] - a[1]) * k / n))
                is_dah.append(False)
    if len(pts) > 1 and abs(pts[0][0] - pts[-1][0]) < 1e-6 and abs(pts[0][1] - pts[-1][1]) < 1e-6:
        pts.pop()
        is_dah.pop()
    # Drop repeats (a DAH point that ends an arc is also where the next side starts).
    keep_pts, keep_dah = [], []
    for p, d in zip(pts, is_dah):
        if keep_pts and abs(p[0] - keep_pts[-1][0]) < 1e-6 and abs(p[1] - keep_pts[-1][1]) < 1e-6:
            keep_dah[-1] = keep_dah[-1] or d
            continue
        keep_pts.append(p)
        keep_dah.append(d)
    pts, is_dah = keep_pts, keep_dah
    lat0 = math.radians(sum(p[0] for p in pts) / len(pts))
    xy = [(p[1] * math.cos(lat0), p[0]) for p in pts]
    corners = []
    for i, d in enumerate(is_dah):
        if not d:
            continue
        a, p, b = xy[i - 1], xy[i], xy[(i + 1) % len(xy)]
        turn = abs(math.degrees(math.atan2((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]), (p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1]))))
        if turn >= CORNER_DEG:
            corners.append(i)
    return {'type': 'polygon', 'points': [[round(a, 4), round(b, 4)] for a, b in pts], 'corners': corners}


def in_square(shape):
    """True when any part of the shape is inside CYMJ's 900 NM square (the 3D view draws an area across its edge whole)."""
    lat0 = math.radians(WIDE_CENTRE[0])
    def inside(lat, lon, pad=0):
        x = math.radians(lon - WIDE_CENTRE[1]) * math.cos(lat0) * EARTH_RADIUS_NM
        y = math.radians(lat - WIDE_CENTRE[0]) * EARTH_RADIUS_NM
        return abs(x) <= HALF_SQUARE_NM + pad and abs(y) <= HALF_SQUARE_NM + pad
    if shape['type'] == 'circle':
        return inside(*shape['centre'], pad=shape['radiusNm'])
    return any(inside(*p) for p in shape['points'])


def page_words(p0, p1):
    return f'DAH p. {p0}' if p0 == p1 else f'DAH pp. {p0}-{p1}'


def agl_to_asl(limit, icao, words):
    """[ft, 'AGL'] at a field -> [ft + its elevation, 'ASL'], saying so in `words`; anything else unchanged."""
    if limit is None or limit[1] != 'AGL':
        return limit
    elev = FIELD_ELEVATION_FT[icao]
    words.append(f'{limit[0]} ft AGL drawn as {limit[0] + elev} ft ASL ({icao} elevation {elev} ft, OurAirports; estimate over flat ground)')
    return [limit[0] + elev, 'ASL']


def wide_fir_items(lines, pages):
    """The terminal areas, zones, extensions and transition areas of WIDE_PLACES (DAH 3.2 Edmonton FIR and 3.3 Winnipeg FIR, parts 1 to 4)."""
    items = []
    num = re.compile(r'^\s+(3\.[23])\.([1-4])-(\d+)\s+(.*)$')
    place = None
    cz_class = None
    cur = None
    def flush():
        if cur:
            items.append(cur)
    for i, line in enumerate(lines):
        if re.match(r'^\s+3\.[23]\.5\s', line) or re.match(r'^\s+3\.[4-9]\s', line):
            flush()
            cur = None
            place = None
            continue
        m = num.match(line)
        heading = None
        if m:
            text = m.group(4).strip()
            if re.fullmatch(r'Class [A-E]', text):
                flush(); cur = None
                cz_class = text[-1]
                continue
            if text.endswith(':') and 'airspace' not in text.lower():
                heading = text
            else:
                flush()
                cur = {'fir': m.group(1), 'part': m.group(2), 'para': f'{m.group(1)}.{m.group(2)}-{m.group(3)}', 'place': place, 'czClass': cz_class,
                       'text': text, 'line': i}
                continue
        elif re.match(r'^\s{15,}[A-Z][\w./ ()\-]+, (AB|SK|MB|ON|BC|NT|YT|NU|MN|ND)( TCA| MTCA)?:\s*$', line) and 'airspace' not in line.lower():
            heading = line.strip()
        if heading:
            flush(); cur = None
            place = re.sub(r', (AB|SK|MB|ON|BC|NT|YT|NU|MN|ND).*$', '', heading)
            continue
        if cur is not None and line.strip():
            cur['text'] += ' ' + line.strip()
            cur['end'] = i
    flush()
    out = []
    for it in items:
        if it['place'] not in WIDE_PLACES or 'within' not in it['text']:
            continue
        icao, shown = WIDE_PLACES[it['place']]
        short, words, kind = SECTION[it['part']]
        mtca = it['part'] == '3' and 'MTCA' in it['text'] or it['place'] == 'Cold Lake' and it['part'] == '3'
        lead = it['text'].split('within the area')[0]
        floor, ceiling, cls, below = parse_limits(lead)
        shape = parse_shape(it['text'][len(lead):])
        p0, p1 = pages[it['line']], pages[it.get('end', it['line'])]
        part = re.match(r'([a-h])\)', it['text'])
        out.append(dict(icao=icao, shown=shown, short='MTCA' if mtca else short, words=words, kind='mtca' if mtca else kind, part=part.group(1) if part else None,
                        floor=floor, ceiling=ceiling, cls=cls, below=below, czClass=it['czClass'], shape=shape, para=it['para'], page=page_words(p0, p1),
                        place=it['place']))
    return out


def wide_sua_items(lines, pages):
    """Every restricted (CYR), danger (CYD) and advisory (CYA) area: designator, place, boundary text, designated altitude(s), page."""
    head = re.compile(r'^\s{15,}(CY[RDA]\d{3})((?:\([A-Z]\))*)\s+([A-Z][A-Z0-9 .\'/()\-]+?), (AB|SK|MB|BC|ON|NT|YT|NU)(?:\s*\(.*\))?\s*$')
    items = []
    cur = None
    for i, line in enumerate(lines):
        m = head.match(line)
        if m:
            if cur:
                items.append(cur)
            cur = {'id': m.group(1), 'tags': m.group(2), 'place': m.group(3).title(), 'text': '', 'alts': [], 'line': i, 'end': i}
            continue
        if cur is None:
            continue
        a = re.match(r'^\s+Designated Altitude\s+[–-]\s*(.*)$', line)
        if a:
            cur['alts'].append(a.group(1).strip())
            cur['end'] = i
            continue
        if re.match(r'^\s+(Time of Designation|User|Controlling|Operating|Remarks|Note)', line):
            cur['done'] = True
        if not cur.get('done') and line.strip():
            cur['text'] += ' ' + line.strip()
            cur['end'] = i
    if cur:
        items.append(cur)
    return items


def sua_limits(words):
    """A designated altitude ('Surface to 6000´', '6000´ to FL190', 'Above 12,500´ to FL290', 'Surface to below 3000´, Ocsl ...', 'Surface to
    unlimited', 'Surface to 3000´ASL') -> (floor, ceiling, below?) or None. Anything after a comma (an occasional higher limit by NOTAM) is not drawn."""
    w = words.split(',  ')[0].replace('´ASL', '´').replace('´ ASL', '´')
    w = re.sub(r'(\d),(\d{3})', r'\1\2', w).split(',')[0]
    lim = r'(Surface|SFC|\d+' + FT + r'(?:\s*AGL)?|FL\s*\d+)'
    m = re.match(r'(?:Above\s+)?' + lim + r'\s+to\s+(below\s+)?(unlimited|UNL|\d+' + FT + r'(?:\s*AGL)?|FL\s*\d+)', w, re.I)
    if not m:
        return None
    def one(s):
        s = s.strip()
        if re.match(r'surface|sfc', s, re.I):
            return [0, 'SFC']
        if re.match(r'unl', s, re.I):
            return [0, 'UNL']
        if s.upper().startswith('FL'):
            return [int(re.sub(r'\D', '', s)) * 100, 'FL']
        return [int(re.match(r'\d+', s).group(0)), 'AGL' if 'AGL' in s.upper() else 'ASL']
    return one(m.group(1)), one(m.group(3)), bool(m.group(2))


def low_floor(shape, ceiling, words):
    """An SFC floor for an area whose ceiling is not above Moose Jaw's elevation (where the 3D view puts SFC), which could not be drawn: written as
    the nearest listed field's elevation above sea level instead (an estimate of the ground there), saying so in `words`. None when not needed."""
    if ceiling[1] not in ('ASL', 'FL') or ceiling[0] > HOME_ELEVATION_FT:
        return None
    lat, lon = shape['centre'] if shape['type'] == 'circle' else shape['points'][0]
    near = min(FIELDS, key=lambda i: (FIELDS[i][0] - lat) ** 2 + ((FIELDS[i][1] - lon) * math.cos(math.radians(lat))) ** 2)
    words.append(f'surface drawn at {FIELDS[near][2]} ft ASL, the elevation of {near}, the nearest field listed (OurAirports; estimate), since its ceiling is below Moose Jaw\'s elevation')
    return [FIELDS[near][2], 'ASL']


def wide_entries(dah_path):
    """The wider set's entries (same shape as airspace-data.js), and a printout of what was read and what was left out."""
    lines, pages = read_dah(dah_path)
    out, log = [], []
    ids = {}
    def add(e):
        n = ids.get(e['id'], 0) + 1
        ids[e['id']] = n
        if n > 1:
            e['id'] = f"{e['id']}-{n}"
        out.append(e)
    # 1. Terminal control areas, control zones, control area extensions and transition areas.
    for it in wide_fir_items(lines, pages):
        if it['shape'] is None:
            log.append(f"could not read the boundary of {it['place']} {it['para']}: left out")
            continue
        notes = list(it['shape'][-1])
        floor, ceiling, cls = it['floor'], it['ceiling'], it['cls']
        short = it['short']
        defaults = []
        if short == 'CZ':
            cls = cls or it['czClass']
            if floor is None:
                floor = [0, 'SFC']
            if ceiling is None:
                ceiling = [3000, 'AGL']
                defaults.append('no ceiling given, so the DAH definition applies: surface to 3000 ft above the aerodrome')
        elif short == 'MTCA':
            ceiling = ceiling or [60000, 'FL']
            notes.append('one volume to FL600; its classes by height are the MTCA lines above it')
        elif short in ('TA', 'CAE'):
            if floor is None:
                floor = [700, 'AGL'] if short == 'TA' else [2200, 'AGL']
                defaults.append(f"no floor given, so the DAH definition applies: from {floor[0]} ft AGL")
            if ceiling is None and floor[0] >= 12500:
                ceiling = [18000, 'ASL']
                defaults.append('to below 18,000 ft, drawn at it')
            elif ceiling is None:
                ceiling = [12500, 'ASL']
                defaults.append('drawn up to 12,500 ft (Class E); the Class B above it is not drawn')
        if ceiling is None or floor is None:
            log.append(f"no floor or ceiling read for {it['place']} {it['para']}: left out")
            continue
        conv = []
        floor = agl_to_asl(floor, it['icao'], conv)
        ceiling = agl_to_asl(ceiling, it['icao'], conv)
        if it['below']:
            notes.append('to below the ceiling, drawn at it')
        cls = cls or ('B' if floor[0] >= 12500 else 'E')
        shape = circle(it['shape'][1], it['shape'][2]) if it['shape'][0] == 'circle' else wide_ring(it['shape'][1])
        shape = shape if shape['type'] == 'circle' else shape
        if shape['type'] == 'circle':
            shape = {'type': 'circle', 'centre': [round(shape['centre'][0], 4), round(shape['centre'][1], 4)], 'radiusNm': shape['radiusNm']}
        part = f" ({it['part']})" if it['part'] and short != 'MTCA' else ''
        band = f", {floor[0]:,} to {ceiling[0]:,} ft" if short in ('TCA',) else ''
        name = f"{it['shown']} {'MTCA' if short == 'MTCA' else 'TCA' if short == 'TCA' else it['words']}{part}{band}"
        ident = f"{it['icao']}-{short}{('-' + it['part'].upper()) if it['part'] and short != 'MTCA' else ''}"
        src = f"{it['page']}, {it['para']} (Class {cls})" if short != 'MTCA' else f"{it['page']}, {it['para']}"
        extra = defaults + conv + notes
        add(dict(id=ident, name=name, kind=it['kind'], classLetter=cls if short != 'MTCA' else None, floor={'ft': floor[0], 'ref': floor[1]},
                 ceiling={'ft': ceiling[0], 'ref': ceiling[1]}, shape=shape, source=src + ('; ' + '; '.join(extra) if extra else '')))
    # 2. Restricted, danger and advisory areas inside the square.
    for it in wide_sua_items(lines, pages):
        if it['id'] in FIRST_SET_AREAS:
            continue
        parsed = parse_shape(it['text'])
        if parsed is None:
            log.append(f"could not read the boundary of {it['id']}: left out")
            continue
        shape = circle(parsed[1], parsed[2]) if parsed[0] == 'circle' else wide_ring(parsed[1])
        if shape['type'] == 'circle':
            shape = {'type': 'circle', 'centre': [round(shape['centre'][0], 4), round(shape['centre'][1], 4)], 'radiusNm': shape['radiusNm']}
        if not in_square(shape):
            continue
        limits = sua_limits(it['alts'][0]) if it['alts'] else None
        if limits is None:
            log.append(f"no designated altitude read for {it['id']} ({it['alts'][:1]}): left out")
            continue
        floor, ceiling, below = limits
        notes = list(parsed[-1])
        if below:
            notes.append('to below the ceiling, drawn at it')
        if re.search(r'Ocsl|by NOTAM', it['alts'][0]):
            notes.append('a NOTAM can set it otherwise (not drawn)')
        if len(it['alts']) > 1:
            notes.append(f"the first of its {len(it['alts'])} designated altitudes (the others by season or NOTAM)")
        if floor[1] == 'AGL' or ceiling[1] == 'AGL':
            notes.append('AGL read above the home field (estimate)')
        if floor[1] == 'SFC':
            floor = low_floor(shape, ceiling, notes) or floor
        kind = {'R': 'restricted', 'D': 'restricted', 'A': 'advisory'}[it['id'][2]]
        p0, p1 = pages[it['line']], pages[it['end']]
        add(dict(id=it['id'], name=f"{it['id']}{it['tags']} {it['place']}", kind=kind, classLetter='F' if kind == 'advisory' else None,
                 floor={'ft': floor[0], 'ref': floor[1]}, ceiling={'ft': ceiling[0], 'ref': ceiling[1]}, shape=shape,
                 source=page_words(p0, p1) + ('; ' + '; '.join(notes) if notes else '')))
    return out, log


# ---- Writing -----------------------------------------------------------------------------------------------------------------------------------------

def js(v):
    """A value as airspace-data.js writes it: object keys bare, everything else JSON."""
    if isinstance(v, dict):
        return '{' + ', '.join(f'{k}: {js(x)}' for k, x in v.items()) + '}'
    if isinstance(v, list):
        return '[' + ', '.join(js(x) for x in v) + ']'
    return json.dumps(v, ensure_ascii=False)


FIRST_FILE = 'src/airfields/airspace/data.js'
WIDE_FILE = 'src/airfields/airspace/dah/cymj.js'
WIDE_SOURCE = 'NAV CANADA Designated Airspace Handbook, edition 03 Sep 2026 (wider set out to 900 NM)'


def first_file_text(entries):
    """airspace-data.js with its AIRSPACE list rewritten (everything before and after the list kept as it is)."""
    text = open(FIRST_FILE, encoding='utf-8').read()
    start = text.index('export const AIRSPACE = Object.freeze([\n') + len('export const AIRSPACE = Object.freeze([\n')
    end = text.index(']);', start)
    return text[:start] + ''.join(f'  {js(e)},\n' for e in entries) + text[end:]


def wide_file_text(entries):
    """The wider set, written compactly (one row per entry, points as a flat list) and expanded to the airspace-data.js shape as it loads."""
    rows = []
    for e in entries:
        sh = e['shape']
        shape = ['c', sh['centre'], sh['radiusNm']] if sh['type'] == 'circle' else ['p', [x for p in sh['points'] for x in p], sh['corners']]
        rows.append(json.dumps([e['id'], e['name'], e['kind'], e['classLetter'], [e['floor']['ft'], e['floor']['ref']], [e['ceiling']['ft'], e['ceiling']['ref']], *shape, e['source']], ensure_ascii=False, separators=(',', ':')))
    head = '\n'.join([
        "// Moose Jaw's wider Canadian airspace for the SOF's 3D view (out to its 900 NM area; Dad, 8 Oct 2026): GENERATED by tools/dah-airspace.py (do not edit",
        "// by hand; run it again at each DAH edition). From NAV CANADA's Designated Airspace Handbook, edition effective 0901Z 03 SEP 2026 to 0901Z 29 OCT 2026",
        '// ("Source of Canadian Airspace Data (c) 2026 Transport Canada"), each entry with its page and paragraph; numbers only. For a picture, not for navigation.',
        "// The first 25 entries round Moose Jaw stay in ../data.js (drawn at once); these load when the 3D view opens at Moose Jaw (../areas.js).",
        "// Each row is [id, name, kind, class letter, floor [ft, ref], ceiling [ft, ref], 'c', [lat, lon] centre, radius NM, source] for a circle or",
        "// [..., 'p', points as a flat list lat, lon, lat, lon ..., corners, source] for a polygon; `row()` expands it into the entry shape airspace-data.js describes.",
    ])
    return f"""{head}

/** The dataset and its edition, for the 3D key. */
export const SOURCE = {json.dumps(WIDE_SOURCE)};

const pairs = (flat) => Array.from({{ length: flat.length / 2 }}, (_, i) => [flat[2 * i], flat[2 * i + 1]]);
const row = ([id, name, kind, classLetter, floor, ceiling, type, a, b, source]) => ({{
  id,
  name,
  kind,
  classLetter,
  floor: {{ ft: floor[0], ref: floor[1] }},
  ceiling: {{ ft: ceiling[0], ref: ceiling[1] }},
  shape: type === 'c' ? {{ type: 'circle', centre: a, radiusNm: b }} : {{ type: 'polygon', points: pairs(a), corners: b }},
  source,
}});

export const AIRSPACE = Object.freeze([
{''.join(f'  {r},' + chr(10) for r in rows)}].map(row));
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dah', help="the DAH's text (pdftotext -layout of the edition's PDF), for the wider set")
    ap.add_argument('--dry', action='store_true', help='print only, write nothing')
    args = ap.parse_args()
    first = moose_jaw_entries()
    text = first_file_text(first)
    print(f'{FIRST_FILE}: {len(first)} entries, {len(text.encode()) / 1024:.1f} KB')
    if not args.dry:
        open(FIRST_FILE, 'w', encoding='utf-8').write(text)
    if not args.dah:
        return
    wide, log = wide_entries(args.dah)
    for line in log:
        print(f'  {line}')
    kinds = {}
    for e in wide:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    text = wide_file_text(wide)
    print(f"{WIDE_FILE}: {len(wide)} entries ({', '.join(f'{n} {k}' for k, n in kinds.items())}), {len(text.encode()) / 1024:.1f} KB")
    if not args.dry:
        os.makedirs(os.path.dirname(WIDE_FILE), exist_ok=True)
        open(WIDE_FILE, 'w', encoding='utf-8').write(text)


if __name__ == '__main__':
    main()
