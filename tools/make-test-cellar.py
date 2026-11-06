# A clean, realistic test cellar of exactly N bottles in the cellar (default 5,000) for trying the site with a big account:
# made-up producers (no real names) across the main countries, sensible vintages, prices, drink windows (some left blank, so
# the site's estimates show), locations on racks and shelves, a few already drunk. Danish headings, as the import
# reads them. Deterministic: the same file every time for the same N.
#   python3 tools/make-test-cellar.py [bottles] [out.xlsx]      (then ⋯ → Import a list, on a test account)
import sys, random, openpyxl
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
OUT = sys.argv[2] if len(sys.argv) > 2 else f"allwine-test-cellar-{N}.xlsx"
R = random.Random(2026)

# country, region, communes, grapes (type), typical classifications, price range kr, window (years after vintage)
AREAS = [
  ("Frankrig", "Bourgogne", ["Gevrey-Chambertin", "Chambolle-Musigny", "Vosne-Romanée", "Nuits-Saint-Georges", "Volnay", "Pommard", "Beaune"], [("Pinot Noir", "Rød")], ["", "Premier cru", "Grand cru"], (180, 2500), (5, 20)),
  ("Frankrig", "Bourgogne", ["Meursault", "Puligny-Montrachet", "Chassagne-Montrachet", "Chablis"], [("Chardonnay", "Hvid")], ["", "Premier cru", "Grand cru"], (160, 1800), (3, 15)),
  ("Frankrig", "Bordeaux", ["Pauillac", "Margaux", "Saint-Julien", "Saint-Émilion", "Pomerol", "Pessac-Léognan"], [("Cabernet Sauvignon", "Rød"), ("Merlot", "Rød")], ["", "Grand cru classé"], (150, 3000), (8, 30)),
  ("Frankrig", "Champagne", ["", "Aÿ", "Cramant", "Bouzy"], [("", "Bobler")], ["", "Grand cru", "Premier cru"], (250, 1500), (1, 15)),
  ("Frankrig", "Rhône", ["Hermitage", "Côte-Rôtie", "Châteauneuf-du-Pape", "Gigondas", "Cornas"], [("Syrah", "Rød"), ("Grenache", "Rød")], [""], (120, 1200), (5, 20)),
  ("Frankrig", "Loire", ["Sancerre", "Pouilly-Fumé", "Vouvray", "Chinon", "Savennières"], [("Sauvignon Blanc", "Hvid"), ("Chenin Blanc", "Hvid"), ("Cabernet Franc", "Rød")], [""], (110, 600), (2, 15)),
  ("Frankrig", "Alsace", ["Riquewihr", "Kaysersberg", "Ribeauvillé"], [("Riesling", "Hvid"), ("Gewurztraminer", "Hvid")], ["", "Grand cru"], (120, 700), (3, 18)),
  ("Frankrig", "Provence", ["Bandol", ""], [("Mourvèdre", "Rosé"), ("Mourvèdre", "Rød")], [""], (110, 400), (1, 10)),
  ("Italien", "Piemonte", ["Barolo", "Barbaresco", "La Morra", "Serralunga d'Alba"], [("Nebbiolo", "Rød")], ["DOCG"], (220, 2000), (8, 30)),
  ("Italien", "Toscana", ["Montalcino", "Bolgheri", "Chianti Classico"], [("Sangiovese", "Rød"), ("Cabernet Sauvignon", "Rød")], ["DOCG", "DOC"], (150, 1500), (5, 25)),
  ("Spanien", "Rioja", ["Haro", "Logroño", ""], [("Tempranillo", "Rød")], ["Reserva", "Gran Reserva", "Crianza"], (120, 900), (5, 25)),
  ("Spanien", "Ribera del Duero", [""], [("Tempranillo", "Rød")], [""], (150, 2500), (6, 25)),
  ("Tyskland", "Mosel", ["Bernkastel-Kues", "Wehlen", "Graach", "Piesport"], [("Riesling", "Hvid")], ["Kabinett", "Spätlese", "Auslese", "Großes Gewächs"], (110, 900), (3, 25)),
  ("Tyskland", "Pfalz", ["Forst", "Deidesheim"], [("Riesling", "Hvid")], ["Großes Gewächs", ""], (130, 700), (3, 18)),
  ("Østrig", "Wachau", ["Spitz", "Weißenkirchen"], [("Grüner Veltliner", "Hvid"), ("Riesling", "Hvid")], ["Smaragd", "Federspiel"], (120, 600), (3, 15)),
  ("Portugal", "Douro", [""], [("Touriga Nacional", "Hedvin"), ("Touriga Nacional", "Rød")], ["Vintage Port", ""], (150, 1200), (10, 40)),
  ("USA", "Californien", ["Napa Valley", "Sonoma"], [("Cabernet Sauvignon", "Rød"), ("Chardonnay", "Hvid")], [""], (200, 2500), (5, 25)),
  ("Australien", "South Australia", ["Barossa Valley", "McLaren Vale"], [("Shiraz", "Rød")], [""], (120, 1500), (5, 25)),
]
WEIGHTS = [16, 9, 12, 7, 7, 5, 4, 2, 7, 6, 5, 3, 6, 3, 2, 3, 2, 2]
PRE = ["Domaine", "Château", "Clos", "Maison", "Weingut", "Tenuta", "Bodega", "Quinta", "Cascina", ""]
A = ["Mor", "Laur", "Belle", "Rou", "Font", "Val", "Gras", "Mont", "Ber", "Lac", "Duv", "Cor", "Mar", "Sau", "Vig", "Pell", "Rich", "Ard"]
B = ["eau", "ière", "and", "ot", "et", "ac", "ignon", "elle", "ard", "ine", "euil", "ault", "enne", "ier", "on", "ais"]
SITES = ["Les Charmes", "Clos du Roi", "Les Perrières", "Aux Brûlées", "La Croix", "Les Grandes Vignes", "Vieilles Vignes", "Réserve", "Cuvée Prestige",
         "Sonnenuhr", "Himmelreich", "Vigna Rionda", "Cannubi", "Bussia", "Gran Selección", "Single Vineyard", "Old Vines", "Estate", ""]
SOURCES = ["Vinmonopolet", "Juul's", "Holte Vinlager", "Kjær & Sommerfeldt", "Auktion", "Ved domænet", "Gave", "Supervin", ""]

def producer(country):
    pre = R.choice(PRE)
    if country == "Tyskland": pre = R.choice(["Weingut", ""])
    if country in ("Italien",): pre = R.choice(["Tenuta", "Cascina", ""])
    if country in ("Spanien",): pre = R.choice(["Bodega", "Bodegas", ""])
    if country == "Portugal": pre = "Quinta"
    name = (R.choice(A) + R.choice(B)).capitalize() + (" " + (R.choice(A) + R.choice(B)).capitalize() if R.random() < .3 else "")
    return (pre + " " + name).strip()

rows, left = [], N
while left > 0:
    i = R.choices(range(len(AREAS)), WEIGHTS)[0]
    country, region, communes, grapes, classes, (p0, p1), (w0, w1) = AREAS[i]
    grape, typ = R.choice(grapes)
    vintage = "NV" if typ == "Bobler" and R.random() < .5 else R.randint(1990, 2023)
    have = min(left, R.choice([1, 1, 1, 2, 2, 3, 3, 6, 6, 6, 12]))   # bottles still in the cellar
    drunk = R.choice([0] * 8 + [1, 2]) if have > 1 else 0            # and some of the same wine already drunk
    qty = have + drunk                                                # "Antal": bottles bought
    price = round(R.uniform(p0, p1) / 5) * 5 if R.random() < .92 else ""  # to the nearest 5 kr
    frm = to = ""
    if isinstance(vintage, int) and R.random() < .7:
        a = vintage + w0 + R.randint(-1, 2); b = vintage + w1 + R.randint(-3, 5); frm, to = a, max(b, a + 2)
    loc = f"Kælder, reol {R.randint(1, 12)}, hylde {R.randint(1, 8)}" if R.random() < .85 else R.choice(["Køleskab", "Garage", "Opbevaring hos forhandler", ""])
    rows.append([producer(country), country, region, R.choice(communes), R.choice(SITES), R.choice(classes), typ, grape, vintage,
                 qty, drunk, price, loc, frm, to, R.choice(SOURCES)])
    left -= have

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Kælder"
ws.append(["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Drukket", "Pris kr", "Placering", "Drik fra", "Drik til", "Kilde"])
for r in rows: ws.append(r)
wb.save(OUT)
print(f"{OUT}: {len(rows)} wines, {sum(r[9] for r in rows)} bottles bought, {sum(r[9] - r[10] for r in rows)} still in the cellar")
