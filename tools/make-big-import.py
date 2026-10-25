# Writes tools/fixtures/big.xlsx: a 10,000-row cellar list, messy the way big lists are (merchant exports glued
# together): the same wine on several rows, spelling and case variants, Danish prices as text, blank rows, a heading
# repeated where the pages were joined, Excel error cells and a totals row. tools/big-import-test.js reads it.
#   python3 tools/make-big-import.py            (deterministic: the same file every time)
import os, random, openpyxl
D = os.path.join(os.path.dirname(__file__), "fixtures")
os.makedirs(D, exist_ok=True)
R = random.Random(1855)

WINES = [  # producer, country, region, commune, name, grape, type
    ("Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "Pinot Noir", "Rød"),
    ("Domaine Leflaive", "Frankrig", "Bourgogne", "Puligny-Montrachet", "Les Pucelles", "Chardonnay", "Hvid"),
    ("Georges Roumier", "Frankrig", "Bourgogne", "Chambolle-Musigny", "Les Amoureuses", "Pinot Noir", "Rød"),
    ("Comtes Lafon", "Frankrig", "Bourgogne", "Meursault", "Les Perrières", "Chardonnay", "Hvid"),
    ("Château Margaux", "Frankrig", "Bordeaux", "Margaux", "Grand Vin", "Cabernet Sauvignon", "Rød"),
    ("Château d'Yquem", "Frankrig", "Bordeaux", "Sauternes", "", "Sémillon", "Hvid"),
    ("Krug", "Frankrig", "Champagne", "", "Grande Cuvée", "", "Bobler"),
    ("Giacomo Conterno", "Italien", "Piemonte", "Barolo", "Cascina Francia", "Nebbiolo", "Rød"),
    ("Egon Müller", "Tyskland", "Mosel", "", "Scharzhofberger Kabinett", "Riesling", "Hvid"),
    ("Vega Sicilia", "Spanien", "Ribera del Duero", "", "Único", "Tempranillo", "Rød"),
    ("Jean-Louis Chave", "Frankrig", "Rhône", "Hermitage", "", "Syrah", "Rød"),
    ("Didier Dagueneau", "Frankrig", "Loire", "Pouilly-Fumé", "Silex", "Sauvignon Blanc", "Hvid"),
]
REGION_SPELLINGS = {"Bourgogne": ["Bourgogne", "Burgundy", "bourgugndy", "BOURGOGNE", "Bourgonge "], "Bordeaux": ["Bordeaux", "bordeuax"],
                    "Piemonte": ["Piemonte", "Piedmont", "Piemont"], "Mosel": ["Mosel", "Moselle"]}
HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Type", "Drue", "Årgang", "Antal", "Pris kr", "Placering"]

# 7,000 distinct wines from 1,500 producers: the real ones above, and made-up domaines built from surname parts, so the
# spelling check has as many names to weigh as a merchant's list would give it
PRE = ["Domaine", "Château", "Weingut", "Bodega", "Tenuta", "Maison", ""]
A = ["Mar", "Ber", "Cha", "Dau", "Fév", "Gil", "Lam", "Mor", "Pon", "Rou", "Sau", "Tho", "Vil", "Bru", "Cor", "Dur", "Gro", "Lec", "Mon", "Pic"]
Z = ["tin", "nard", "bert", "vier", "ard", "lot", "ion", "eau", "et", "ier", "and", "elle", "ot", "ain", "ay"]
made = set()
while len(made) < 1500 - len(WINES):
    made.add((R.choice(PRE) + " " + R.choice(A) + R.choice(Z) + ("-" + R.choice(A) + R.choice(Z) if R.random() < .3 else "")).strip())
producers = [w[0] for w in WINES] + sorted(made)
distinct = []
for i in range(7000):
    base = WINES[i % len(WINES)]
    p = producers[i % len(producers)]
    _, c, reg, com, name, grape, typ = base
    distinct.append((p, c, reg, com, (name + " " if name else "") + "Cuvée %d" % (i // len(producers) + 1), grape, typ, 1985 + R.randrange(39)))

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Kælder"
ws.append(["Kælderliste — eksport"]); ws.append([]); ws.append(HEAD)
rows = 0
while rows < 10000:
    if rows and rows % 2500 == 0: ws.append(HEAD)                   # pages glued together
    if rows % 997 == 0: ws.append([])                                # a blank row now and then
    p, c, reg, com, name, grape, typ, vint = distinct[R.randrange(len(distinct))]
    if R.random() < .2: p = p.upper()                                # shouting
    if R.random() < .1: p = "  " + p.lower() + " "                   # stray spaces
    reg = R.choice(REGION_SPELLINGS.get(reg, [reg]))
    price = R.choice([150, 350, 900, 2400, 6500])
    price = ("%s,00 kr" % format(price, ",").replace(",", ".")) if R.random() < .3 else price
    qty = "#N/A" if R.random() < .002 else R.choice([1, 1, 1, 2, 3, 6, 12])
    loc = "Kælder, reol %d" % R.randint(1, 40) if R.random() < .6 else ""
    ws.append([p, c, reg, com, name, typ, grape, vint, qty, price, loc])
    rows += 1
ws.append(["I alt", "", "", "", "", "", "", "", "=SUM(I4:I10010)", "", ""])
wb.save(os.path.join(D, "big.xlsx"))
print("wrote", os.path.join(D, "big.xlsx"), rows, "wine rows")
