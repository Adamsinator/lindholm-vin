# Writes the sample cellar lists tools/import-test.js reads: the owner's own sheet layout as Excel, CellarTracker and
# Vivino exports, a Danish Excel CSV (semicolons, Windows-1252, "1.250,00 kr"), a tab-separated text file and a plain
# list of wines.   python3 tools/make-import-fixtures.py
import datetime, os, openpyxl
D = os.path.join(os.path.dirname(__file__), "fixtures")
os.makedirs(D, exist_ok=True)

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Ark1"
ws.append(["Min vinkælder 2026"]); ws.append([])
ws.append(["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet"])
ws.append(["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1. cru", "Rød", "Pinot Noir", 2016, 3, 4500.5, 1, "Philipson", "Gave", datetime.date(2021, 3, 14)])
ws.append(["Domaine Leflaive", "Frankrig", "Bourgogne", "Puligny-Montrachet", "Les Pucelles", "1er cru", "Hvid", "Chardonnay", datetime.date(2019, 1, 1), 2, 1900, "x", "", "", None])
ws.append([])
ws.append(["Krug", "Frankrig", "Champagne", "", "Grande Cuvée 170ème", "", "Hvid", "", "NV", 1, 1650, "", "", "æøå ÆØÅ", None])
ws.append(["", "", "", "", "row without producer", "", "", "", 2020, 1, 100, "", "", "", None])
ws["I5"].number_format = "yyyy"            # a vintage typed as a date
ws["O4"].number_format = "dd-mm-yyyy"
ws2 = wb.create_sheet("Noter"); ws2.append(["just notes"])
wb.save(os.path.join(D, "owner.xlsx"))

with open(os.path.join(D, "cellartracker.csv"), "w", encoding="utf-8", newline="") as f:
    f.write('iWine,Type,Color,Category,Size,Vintage,Wine,Locale,Producer,Varietal,Designation,Vineyard,Country,Region,SubRegion,Appellation,Quantity,Price,Valuation,BeginConsume,EndConsume,CT\n')
    f.write('1,Red,Red,Dry,750ml,2015,"Domaine Georges Roumier Chambolle-Musigny 1er Cru Les Amoureuses","France, Burgundy",Domaine Georges Roumier,Pinot Noir,Unknown,Les Amoureuses,France,Burgundy,Côte de Nuits,Chambolle-Musigny 1er Cru,2,"1,250.00",3000,2025,2045,95\n')
    f.write('2,White - Sparkling,White,Dry,1.5L,1001,Bollinger Special Cuvée,"France, Champagne",Bollinger,Pinot Noir Blend,Special Cuvée,n/a,France,Champagne,Unknown,Champagne,1,450,,,,92\n')

with open(os.path.join(D, "vivino.csv"), "w", encoding="utf-8", newline="") as f:
    f.write("Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,Scan date,Your rating,Your review,Wine price,Wine type\n")
    f.write("Château Musar,Château Musar Rouge,2012,Bekaa Valley,Lebanon,Lebanese Red,4.1,2024-05-01,4.5,Lovely and old,320,Red wine\n")
    f.write("Egon Müller,Scharzhofberger Riesling Kabinett,2019,Mosel,Germany,German Riesling,4.4,2024-06-02,5,,,White wine\n")

with open(os.path.join(D, "danish.csv"), "w", encoding="cp1252", newline="") as f:
    f.write("Vinhus;Vin;Årgang;Antal;Tilbage;Pris;Købt hos;Størrelse;Drikkevindue\r\n")
    f.write('Château Léoville Barton;Saint-Julien;2010;6;4;"1.250,00 kr";Vinoteket;Magnum;2025-35\r\n')
    f.write("Domaine Tempier;Bandol Rosé;2023;2;2;189,95;Kjær & Sommerfeldt;;\r\n")

with open(os.path.join(D, "tabbed.txt"), "w", encoding="utf-8", newline="") as f:
    f.write("Producer\tWine\tVintage\tBottles\tDrunk\n")
    f.write("Giacomo Conterno\tBarolo Francia\t2017\t3\tja\n")
    f.write("Clos Rougeard\tLe Bourg\t2014\t1\t0\n")

with open(os.path.join(D, "lines.txt"), "w", encoding="utf-8", newline="") as f:
    f.write("3 x Domaine Roulot - Meursault Perrières 2020\n")
    f.write("Raveneau, Chablis Grand Cru Les Clos 2018 (2 fl)\n")
    f.write("Billecart-Salmon Brut Rosé NV\n")
