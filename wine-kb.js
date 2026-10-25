// A compact wine reference used by the importer and the tidy-up (to correct spellings: "bourgugndy" → Bourgogne) and by
// the sommelier chat (to answer "which grape is Sancerre?"). Built by hand from the appellation rules (INAO, the
// Italian, Spanish, German and Austrian wine laws) and the usual references; it describes the main, permitted grapes,
// not every minor one.
//
//   countries: site name (Danish, as the cellar stores it) | English | French | German | aliases
//   regions:   site name | country | English | French | German | aliases
//   grapes:    name | colour (r red, w white) | synonyms (other names on labels)
//   apps:      appellation | region | wines: colour codes r red, w white, p rosé, s sparkling, d sweet, f fortified,
//              then ":" and the main grapes; several groups separated by ";"
(function (root) {
"use strict";
const COUNTRIES = `
Frankrig|France|France|Frankreich|francia,fr
Italien|Italy|Italie|Italien|italia,it
Spanien|Spain|Espagne|Spanien|espana,es
Portugal|Portugal|Portugal|Portugal|pt
Tyskland|Germany|Allemagne|Deutschland|de
Østrig|Austria|Autriche|Österreich|at
Schweiz|Switzerland|Suisse|Schweiz|svizzera,ch
Ungarn|Hungary|Hongrie|Ungarn|magyarorszag
Grækenland|Greece|Grèce|Griechenland|hellas
Libanon|Lebanon|Liban|Libanon|
Georgien|Georgia|Géorgie|Georgien|sakartvelo
Slovenien|Slovenia|Slovénie|Slowenien|
Kroatien|Croatia|Croatie|Kroatien|hrvatska
England|England|Angleterre|England|uk,united kingdom,storbritannien,great britain,royaume uni
USA|USA|États-Unis|USA|us,united states,etats unis,vereinigte staaten,amerika
Canada|Canada|Canada|Kanada|
Argentina|Argentina|Argentine|Argentinien|
Chile|Chile|Chili|Chile|
Australien|Australia|Australie|Australien|
New Zealand|New Zealand|Nouvelle-Zélande|Neuseeland|new zealand,nz
Sydafrika|South Africa|Afrique du Sud|Südafrika|rsa,za
Israel|Israel|Israël|Israel|
Danmark|Denmark|Danemark|Dänemark|dk
`;
const REGIONS = `
Bourgogne|Frankrig|Burgundy|Bourgogne|Burgund|borgogna,burgundi,cote d or,bourgogne franche comte
Bordeaux|Frankrig|Bordeaux|Bordeaux|Bordeaux|bordelais
Champagne|Frankrig|Champagne|Champagne|Champagne|champagner
Rhône|Frankrig|Rhône|Rhône|Rhône|rhone valley,rhonedalen,vallee du rhone,rhonetal,cotes du rhone,northern rhone,southern rhone,nordrhone,sydrhone
Loire|Frankrig|Loire|Loire|Loire|loire valley,loiredalen,vallee de la loire,val de loire
Alsace|Frankrig|Alsace|Alsace|Elsass|alsace lorraine,elsas
Beaujolais|Frankrig|Beaujolais|Beaujolais|Beaujolais|
Jura|Frankrig|Jura|Jura|Jura|
Savoie|Frankrig|Savoy|Savoie|Savoyen|savoy
Languedoc|Frankrig|Languedoc|Languedoc|Languedoc|languedoc roussillon
Roussillon|Frankrig|Roussillon|Roussillon|Roussillon|
Provence|Frankrig|Provence|Provence|Provence|
Sud-Ouest|Frankrig|South West France|Sud-Ouest|Südwestfrankreich|south west,sydvestfrankrig,sud ouest
Béarn|Frankrig|Béarn|Béarn|Béarn|
Corse|Frankrig|Corsica|Corse|Korsika|korsika
Piemonte|Italien|Piedmont|Piémont|Piemont|piedmont
Toscana|Italien|Tuscany|Toscane|Toskana|tuscany
Veneto|Italien|Veneto|Vénétie|Venetien|
Friuli|Italien|Friuli|Frioul|Friaul|friuli venezia giulia
Alto Adige|Italien|South Tyrol|Haut-Adige|Südtirol|sudtirol,trentino alto adige
Trentino|Italien|Trentino|Trentin|Trentino|
Lombardia|Italien|Lombardy|Lombardie|Lombardei|lombardy
Emilia-Romagna|Italien|Emilia-Romagna|Émilie-Romagne|Emilia-Romagna|
Marche|Italien|Marche|Marches|Marken|
Abruzzo|Italien|Abruzzo|Abruzzes|Abruzzen|abruzzi
Campania|Italien|Campania|Campanie|Kampanien|
Puglia|Italien|Apulia|Pouilles|Apulien|apulia
Sicilia|Italien|Sicily|Sicile|Sizilien|sicily
Sardegna|Italien|Sardinia|Sardaigne|Sardinien|sardinia
Umbria|Italien|Umbria|Ombrie|Umbrien|
Rioja|Spanien|Rioja|Rioja|Rioja|la rioja
Ribera del Duero|Spanien|Ribera del Duero|Ribera del Duero|Ribera del Duero|
Priorat|Spanien|Priorat|Priorat|Priorat|priorato
Rías Baixas|Spanien|Rías Baixas|Rías Baixas|Rías Baixas|rias baixas
Jerez|Spanien|Jerez (Sherry)|Xérès|Jerez|sherry,xeres
Galicia|Spanien|Galicia|Galice|Galicien|
Castilla y León|Spanien|Castile and León|Castille-et-León|Kastilien und León|castilla y leon
Catalunya|Spanien|Catalonia|Catalogne|Katalonien|cataluna,catalonia,penedes
Navarra|Spanien|Navarre|Navarre|Navarra|
Douro|Portugal|Douro|Douro|Douro|porto,port,oporto
Dão|Portugal|Dão|Dão|Dão|dao
Alentejo|Portugal|Alentejo|Alentejo|Alentejo|
Vinho Verde|Portugal|Vinho Verde|Vinho Verde|Vinho Verde|
Madeira|Portugal|Madeira|Madère|Madeira|madere
Mosel|Tyskland|Mosel|Moselle|Mosel|moselle,mosel saar ruwer
Rheingau|Tyskland|Rheingau|Rheingau|Rheingau|
Pfalz|Tyskland|Palatinate|Palatinat|Pfalz|palatinate
Rheinhessen|Tyskland|Rheinhessen|Hesse rhénane|Rheinhessen|
Nahe|Tyskland|Nahe|Nahe|Nahe|
Franken|Tyskland|Franconia|Franconie|Franken|franconia
Baden|Tyskland|Baden|Bade|Baden|
Württemberg|Tyskland|Württemberg|Wurtemberg|Württemberg|wurttemberg
Ahr|Tyskland|Ahr|Ahr|Ahr|
Wachau|Østrig|Wachau|Wachau|Wachau|
Kamptal|Østrig|Kamptal|Kamptal|Kamptal|
Kremstal|Østrig|Kremstal|Kremstal|Kremstal|
Burgenland|Østrig|Burgenland|Burgenland|Burgenland|
Steiermark|Østrig|Styria|Styrie|Steiermark|styria
Wien|Østrig|Vienna|Vienne|Wien|vienna
Valais|Schweiz|Valais|Valais|Wallis|wallis
Vaud|Schweiz|Vaud|Vaud|Waadt|waadt
Tokaj|Ungarn|Tokaj|Tokaj|Tokaj|tokaji
Californien|USA|California|Californie|Kalifornien|california,kalifornien,californie
Napa Valley|USA|Napa Valley|Napa Valley|Napa Valley|napa
Sonoma|USA|Sonoma|Sonoma|Sonoma|sonoma county,sonoma coast
Oregon|USA|Oregon|Oregon|Oregon|willamette valley,willamette
Washington|USA|Washington State|État de Washington|Washington|washington state
Barossa|Australien|Barossa|Barossa|Barossa|barossa valley
McLaren Vale|Australien|McLaren Vale|McLaren Vale|McLaren Vale|
Margaret River|Australien|Margaret River|Margaret River|Margaret River|
Hunter Valley|Australien|Hunter Valley|Hunter Valley|Hunter Valley|hunter
Yarra Valley|Australien|Yarra Valley|Yarra Valley|Yarra Valley|yarra
Coonawarra|Australien|Coonawarra|Coonawarra|Coonawarra|
Clare Valley|Australien|Clare Valley|Clare Valley|Clare Valley|clare
Eden Valley|Australien|Eden Valley|Eden Valley|Eden Valley|
Marlborough|New Zealand|Marlborough|Marlborough|Marlborough|
Central Otago|New Zealand|Central Otago|Central Otago|Central Otago|otago
Hawke's Bay|New Zealand|Hawke's Bay|Hawke's Bay|Hawke's Bay|hawkes bay
Stellenbosch|Sydafrika|Stellenbosch|Stellenbosch|Stellenbosch|
Swartland|Sydafrika|Swartland|Swartland|Swartland|
Mendoza|Argentina|Mendoza|Mendoza|Mendoza|uco valley,valle de uco
Maipo|Chile|Maipo|Maipo|Maipo|maipo valley
Colchagua|Chile|Colchagua|Colchagua|Colchagua|colchagua valley
Bekaa|Libanon|Bekaa Valley|Bekaa|Bekaa|bekaa valley
Santorini|Grækenland|Santorini|Santorin|Santorin|santorin
`;
const GRAPES = `
Pinot Noir|r|Spätburgunder,Pinot Nero,Blauburgunder,Pinot Nerro
Chardonnay|w|Morillon
Cabernet Sauvignon|r|
Merlot|r|
Cabernet Franc|r|Breton,Bouchet
Syrah|r|Shiraz,Sirah
Grenache|r|Garnacha,Cannonau,Garnatxa,Grenache Noir
Mourvèdre|r|Monastrell,Mataró,Mataro
Carignan|r|Cariñena,Mazuelo,Carignano,Samsó
Cinsault|r|Cinsaut
Gamay|r|
Malbec|r|Côt,Cot,Auxerrois
Tannat|r|
Petit Verdot|r|
Carmenère|r|Carmenere
Nebbiolo|r|Spanna,Chiavennasca
Sangiovese|r|Brunello,Prugnolo Gentile,Morellino,Nielluccio
Barbera|r|
Dolcetto|r|
Corvina|r|
Montepulciano|r|
Aglianico|r|
Nero d'Avola|r|Calabrese
Nerello Mascalese|r|
Negroamaro|r|
Primitivo|r|Zinfandel,Tribidrag
Sagrantino|r|
Lambrusco|r|
Lagrein|r|
Teroldego|r|
Schiava|r|Trollinger,Vernatsch
Tempranillo|r|Tinto Fino,Tinta del País,Tinta de Toro,Tinta Roriz,Aragonez,Cencibel,Ull de Llebre
Graciano|r|
Mencía|r|Mencia,Jaen
Touriga Nacional|r|
Touriga Franca|r|
Baga|r|
Blaufränkisch|r|Lemberger,Kékfrankos,Frankovka
Zweigelt|r|
St. Laurent|r|Sankt Laurent,Saint Laurent
Poulsard|r|Ploussard
Trousseau|r|Bastardo
Mondeuse|r|
Pinotage|r|
Xinomavro|r|
Agiorgitiko|r|
Saperavi|r|
Mavrud|r|
Riesling|w|Rheinriesling,Johannisberg Riesling
Sauvignon Blanc|w|Fumé Blanc,Muskat-Silvaner
Chenin Blanc|w|Pineau de la Loire,Steen
Sémillon|w|Semillon
Viognier|w|
Marsanne|w|
Roussanne|w|
Grenache Blanc|w|Garnacha Blanca
Clairette|w|
Muscat|w|Moscato,Muskateller,Moscatel,Muscat Blanc à Petits Grains
Gewürztraminer|w|Savagnin Rose,Gewurztraminer,Traminer Aromatico
Pinot Gris|w|Pinot Grigio,Grauburgunder,Ruländer,Malvoisie
Pinot Blanc|w|Pinot Bianco,Weißburgunder,Weissburgunder,Klevner
Sylvaner|w|Silvaner
Aligoté|w|Aligote
Melon de Bourgogne|w|Muscadet,Melon
Savagnin|w|Naturé,Traminer
Jacquère|w|Jacquere
Altesse|w|Roussette
Chasselas|w|Fendant,Gutedel
Grüner Veltliner|w|Gruner Veltliner,Veltliner
Furmint|w|Šipon
Hárslevelű|w|Harslevelu
Assyrtiko|w|
Albariño|w|Alvarinho,Albarino
Verdejo|w|
Godello|w|Gouveio
Viura|w|Macabeo,Macabeu
Xarel·lo|w|Xarello
Parellada|w|
Palomino|w|Listán
Pedro Ximénez|w|PX,Pedro Ximenez
Loureiro|w|
Encruzado|w|
Arinto|w|Pedernã
Garganega|w|
Cortese|w|
Arneis|w|
Vermentino|w|Rolle,Favorita,Pigato
Fiano|w|
Greco|w|
Falanghina|w|
Verdicchio|w|Trebbiano di Lugana,Turbiana
Trebbiano|w|Ugni Blanc
Glera|w|Prosecco
Vernaccia|w|
Carricante|w|
Friulano|w|Sauvignonasse,Tocai Friulano
Ribolla Gialla|w|Rebula
Petit Manseng|w|
Gros Manseng|w|
Colombard|w|
Mauzac|w|
Piquepoul|w|Picpoul
Rkatsiteli|w|
Pinot Meunier|r|Meunier,Schwarzriesling,Müllerrebe
Müller-Thurgau|w|Rivaner,Müller Thurgau
Scheurebe|w|
César|r|
Counoise|r|
Bourboulenc|w|
Fer Servadou|r|Braucol,Mansois
Duras|r|
Len de l'El|w|Loin de l'Œil
Négrette|r|Negrette
Sciaccarellu|r|Sciaccarello,Mammolo
Rondinella|r|
Molinara|r|
Frappato|r|
Grillo|w|
Catarratto|w|
Inzolia|w|Ansonica
Brachetto|r|
Trincadeira|r|Tinta Amarela
Alicante Bouschet|r|
Sercial|w|
Verdelho|w|
Boal|w|Bual
Malvasia|w|Malmsey,Malvazija
Welschriesling|w|Olaszrizling,Laški Rizling
Muscadelle|w|
`;
const APPS = `
Chablis|Bourgogne|w:Chardonnay
Petit Chablis|Bourgogne|w:Chardonnay
Bourgogne|Bourgogne|r,p:Pinot Noir;w:Chardonnay
Bourgogne Aligoté|Bourgogne|w:Aligoté
Bouzeron|Bourgogne|w:Aligoté
Crémant de Bourgogne|Bourgogne|s:Chardonnay,Pinot Noir,Aligoté,Gamay
Irancy|Bourgogne|r:Pinot Noir,César
Marsannay|Bourgogne|r,p:Pinot Noir;w:Chardonnay
Fixin|Bourgogne|r:Pinot Noir;w:Chardonnay
Gevrey-Chambertin|Bourgogne|r:Pinot Noir
Morey-Saint-Denis|Bourgogne|r:Pinot Noir;w:Chardonnay
Chambolle-Musigny|Bourgogne|r:Pinot Noir
Vougeot|Bourgogne|r:Pinot Noir;w:Chardonnay
Vosne-Romanée|Bourgogne|r:Pinot Noir
Flagey-Échezeaux|Bourgogne|r:Pinot Noir
Nuits-Saint-Georges|Bourgogne|r:Pinot Noir;w:Chardonnay
Côte de Nuits-Villages|Bourgogne|r:Pinot Noir;w:Chardonnay
Hautes-Côtes de Nuits|Bourgogne|r:Pinot Noir;w:Chardonnay
Ladoix|Bourgogne|r:Pinot Noir;w:Chardonnay
Aloxe-Corton|Bourgogne|r:Pinot Noir;w:Chardonnay
Pernand-Vergelesses|Bourgogne|r:Pinot Noir;w:Chardonnay
Corton|Bourgogne|r:Pinot Noir;w:Chardonnay
Corton-Charlemagne|Bourgogne|w:Chardonnay
Savigny-lès-Beaune|Bourgogne|r:Pinot Noir;w:Chardonnay
Chorey-lès-Beaune|Bourgogne|r:Pinot Noir;w:Chardonnay
Beaune|Bourgogne|r:Pinot Noir;w:Chardonnay
Pommard|Bourgogne|r:Pinot Noir
Volnay|Bourgogne|r:Pinot Noir
Monthélie|Bourgogne|r:Pinot Noir;w:Chardonnay
Auxey-Duresses|Bourgogne|r:Pinot Noir;w:Chardonnay
Saint-Romain|Bourgogne|w:Chardonnay;r:Pinot Noir
Meursault|Bourgogne|w:Chardonnay;r:Pinot Noir
Blagny|Bourgogne|r:Pinot Noir
Puligny-Montrachet|Bourgogne|w:Chardonnay;r:Pinot Noir
Chassagne-Montrachet|Bourgogne|w:Chardonnay;r:Pinot Noir
Saint-Aubin|Bourgogne|w:Chardonnay;r:Pinot Noir
Santenay|Bourgogne|r:Pinot Noir;w:Chardonnay
Maranges|Bourgogne|r:Pinot Noir;w:Chardonnay
Hautes-Côtes de Beaune|Bourgogne|r:Pinot Noir;w:Chardonnay
Côte de Beaune-Villages|Bourgogne|r:Pinot Noir
Rully|Bourgogne|w:Chardonnay;r:Pinot Noir
Mercurey|Bourgogne|r:Pinot Noir;w:Chardonnay
Givry|Bourgogne|r:Pinot Noir;w:Chardonnay
Montagny|Bourgogne|w:Chardonnay
Mâcon|Bourgogne|w:Chardonnay;r:Gamay,Pinot Noir
Mâcon-Villages|Bourgogne|w:Chardonnay
Pouilly-Fuissé|Bourgogne|w:Chardonnay
Saint-Véran|Bourgogne|w:Chardonnay
Viré-Clessé|Bourgogne|w:Chardonnay
Chambertin|Bourgogne|r:Pinot Noir
Chambertin-Clos de Bèze|Bourgogne|r:Pinot Noir
Musigny|Bourgogne|r:Pinot Noir;w:Chardonnay
Bonnes-Mares|Bourgogne|r:Pinot Noir
Clos de Vougeot|Bourgogne|r:Pinot Noir
Richebourg|Bourgogne|r:Pinot Noir
Romanée-Conti|Bourgogne|r:Pinot Noir
La Tâche|Bourgogne|r:Pinot Noir
Échezeaux|Bourgogne|r:Pinot Noir
Grands-Échezeaux|Bourgogne|r:Pinot Noir
Clos de la Roche|Bourgogne|r:Pinot Noir
Clos Saint-Denis|Bourgogne|r:Pinot Noir
Clos de Tart|Bourgogne|r:Pinot Noir
Montrachet|Bourgogne|w:Chardonnay
Bâtard-Montrachet|Bourgogne|w:Chardonnay
Chevalier-Montrachet|Bourgogne|w:Chardonnay
Beaujolais|Beaujolais|r:Gamay;w:Chardonnay
Beaujolais-Villages|Beaujolais|r:Gamay
Morgon|Beaujolais|r:Gamay
Fleurie|Beaujolais|r:Gamay
Moulin-à-Vent|Beaujolais|r:Gamay
Brouilly|Beaujolais|r:Gamay
Côte de Brouilly|Beaujolais|r:Gamay
Chiroubles|Beaujolais|r:Gamay
Chénas|Beaujolais|r:Gamay
Juliénas|Beaujolais|r:Gamay
Régnié|Beaujolais|r:Gamay
Saint-Amour|Beaujolais|r:Gamay
Médoc|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc,Petit Verdot
Haut-Médoc|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc,Petit Verdot
Pauillac|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc,Petit Verdot
Margaux|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc,Petit Verdot
Saint-Julien|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc,Petit Verdot
Saint-Estèphe|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc,Petit Verdot
Listrac-Médoc|Bordeaux|r:Cabernet Sauvignon,Merlot
Moulis|Bordeaux|r:Cabernet Sauvignon,Merlot
Pessac-Léognan|Bordeaux|r:Cabernet Sauvignon,Merlot,Cabernet Franc;w:Sauvignon Blanc,Sémillon
Graves|Bordeaux|r:Cabernet Sauvignon,Merlot;w:Sémillon,Sauvignon Blanc
Saint-Émilion|Bordeaux|r:Merlot,Cabernet Franc,Cabernet Sauvignon
Pomerol|Bordeaux|r:Merlot,Cabernet Franc
Lalande-de-Pomerol|Bordeaux|r:Merlot,Cabernet Franc
Fronsac|Bordeaux|r:Merlot,Cabernet Franc
Castillon|Bordeaux|r:Merlot,Cabernet Franc
Côtes de Bourg|Bordeaux|r:Merlot,Cabernet Sauvignon
Blaye|Bordeaux|r:Merlot,Cabernet Sauvignon
Entre-Deux-Mers|Bordeaux|w:Sauvignon Blanc,Sémillon,Muscadelle
Sauternes|Bordeaux|d:Sémillon,Sauvignon Blanc,Muscadelle
Barsac|Bordeaux|d:Sémillon,Sauvignon Blanc,Muscadelle
Bordeaux Supérieur|Bordeaux|r:Merlot,Cabernet Sauvignon,Cabernet Franc
Crémant de Bordeaux|Bordeaux|s:Sémillon,Cabernet Franc,Merlot
Champagne|Champagne|s:Chardonnay,Pinot Noir,Pinot Meunier
Coteaux Champenois|Champagne|r:Pinot Noir;w:Chardonnay
Rosé des Riceys|Champagne|p:Pinot Noir
Côte-Rôtie|Rhône|r:Syrah,Viognier
Condrieu|Rhône|w:Viognier
Château-Grillet|Rhône|w:Viognier
Saint-Joseph|Rhône|r:Syrah;w:Marsanne,Roussanne
Crozes-Hermitage|Rhône|r:Syrah;w:Marsanne,Roussanne
Hermitage|Rhône|r:Syrah;w:Marsanne,Roussanne
Cornas|Rhône|r:Syrah
Saint-Péray|Rhône|w,s:Marsanne,Roussanne
Châteauneuf-du-Pape|Rhône|r:Grenache,Syrah,Mourvèdre,Cinsault,Counoise;w:Grenache Blanc,Clairette,Roussanne,Bourboulenc
Gigondas|Rhône|r:Grenache,Syrah,Mourvèdre
Vacqueyras|Rhône|r:Grenache,Syrah,Mourvèdre;w:Grenache Blanc,Clairette
Rasteau|Rhône|r:Grenache,Syrah,Mourvèdre
Cairanne|Rhône|r:Grenache,Syrah,Mourvèdre
Vinsobres|Rhône|r:Grenache,Syrah
Lirac|Rhône|r:Grenache,Syrah,Mourvèdre,Cinsault
Tavel|Rhône|p:Grenache,Cinsault
Côtes du Rhône|Rhône|r:Grenache,Syrah,Mourvèdre;w:Grenache Blanc,Viognier;p:Grenache,Cinsault
Côtes du Rhône Villages|Rhône|r:Grenache,Syrah,Mourvèdre
Beaumes-de-Venise|Rhône|d:Muscat;r:Grenache,Syrah
Ventoux|Rhône|r:Grenache,Syrah,Carignan
Luberon|Rhône|r:Grenache,Syrah;p:Grenache,Cinsault
Costières de Nîmes|Rhône|r:Syrah,Grenache,Mourvèdre
Muscadet|Loire|w:Melon de Bourgogne
Muscadet Sèvre et Maine|Loire|w:Melon de Bourgogne
Anjou|Loire|w:Chenin Blanc;r:Cabernet Franc
Savennières|Loire|w:Chenin Blanc
Coteaux du Layon|Loire|d:Chenin Blanc
Quarts de Chaume|Loire|d:Chenin Blanc
Bonnezeaux|Loire|d:Chenin Blanc
Saumur|Loire|r:Cabernet Franc;w:Chenin Blanc;s:Chenin Blanc,Chardonnay,Cabernet Franc
Saumur-Champigny|Loire|r:Cabernet Franc
Chinon|Loire|r:Cabernet Franc;w:Chenin Blanc
Bourgueil|Loire|r:Cabernet Franc
Saint-Nicolas-de-Bourgueil|Loire|r:Cabernet Franc
Vouvray|Loire|w,s,d:Chenin Blanc
Montlouis-sur-Loire|Loire|w,s,d:Chenin Blanc
Jasnières|Loire|w:Chenin Blanc
Sancerre|Loire|w:Sauvignon Blanc;r,p:Pinot Noir
Pouilly-Fumé|Loire|w:Sauvignon Blanc
Menetou-Salon|Loire|w:Sauvignon Blanc;r:Pinot Noir
Quincy|Loire|w:Sauvignon Blanc
Reuilly|Loire|w:Sauvignon Blanc;r,p:Pinot Noir,Pinot Gris
Touraine|Loire|w:Sauvignon Blanc;r:Gamay,Cabernet Franc,Côt
Cheverny|Loire|w:Sauvignon Blanc,Chardonnay;r:Pinot Noir,Gamay
Crémant de Loire|Loire|s:Chenin Blanc,Chardonnay,Cabernet Franc
Alsace|Alsace|w:Riesling,Gewürztraminer,Pinot Gris,Muscat,Pinot Blanc,Sylvaner;r:Pinot Noir
Alsace Grand Cru|Alsace|w:Riesling,Gewürztraminer,Pinot Gris,Muscat
Crémant d'Alsace|Alsace|s:Pinot Blanc,Chardonnay,Pinot Noir,Riesling
Arbois|Jura|r:Poulsard,Trousseau,Pinot Noir;w:Chardonnay,Savagnin
Côtes du Jura|Jura|w:Chardonnay,Savagnin;r:Poulsard,Trousseau,Pinot Noir
Château-Chalon|Jura|w:Savagnin
L'Étoile|Jura|w:Chardonnay,Savagnin
Crémant du Jura|Jura|s:Chardonnay,Pinot Noir
Vin de Savoie|Savoie|w:Jacquère,Altesse,Chasselas;r:Mondeuse,Gamay
Roussette de Savoie|Savoie|w:Altesse
Pic Saint-Loup|Languedoc|r:Syrah,Grenache,Mourvèdre
Faugères|Languedoc|r:Syrah,Grenache,Mourvèdre,Carignan
Saint-Chinian|Languedoc|r:Syrah,Grenache,Mourvèdre,Carignan
Minervois|Languedoc|r:Syrah,Grenache,Carignan
Corbières|Languedoc|r:Carignan,Grenache,Syrah
Fitou|Languedoc|r:Carignan,Grenache
Terrasses du Larzac|Languedoc|r:Syrah,Grenache,Mourvèdre
Limoux|Languedoc|s:Mauzac,Chardonnay,Chenin Blanc;w:Chardonnay
Picpoul de Pinet|Languedoc|w:Piquepoul
Collioure|Roussillon|r:Grenache,Syrah,Mourvèdre
Banyuls|Roussillon|f:Grenache
Maury|Roussillon|f:Grenache
Côtes du Roussillon|Roussillon|r:Grenache,Syrah,Carignan,Mourvèdre
Rivesaltes|Roussillon|f:Grenache,Muscat
Côtes de Provence|Provence|p,r:Grenache,Cinsault,Syrah,Mourvèdre;w:Vermentino
Bandol|Provence|r,p:Mourvèdre,Grenache,Cinsault;w:Clairette
Cassis|Provence|w:Marsanne,Clairette
Palette|Provence|r:Mourvèdre,Grenache;w:Clairette
Coteaux d'Aix-en-Provence|Provence|p,r:Grenache,Syrah,Cinsault
Cahors|Sud-Ouest|r:Malbec
Madiran|Sud-Ouest|r:Tannat
Jurançon|Sud-Ouest|w,d:Petit Manseng,Gros Manseng
Bergerac|Sud-Ouest|r:Merlot,Cabernet Sauvignon;w:Sauvignon Blanc,Sémillon
Monbazillac|Sud-Ouest|d:Sémillon,Sauvignon Blanc,Muscadelle
Gaillac|Sud-Ouest|r:Braucol,Duras;w:Mauzac,Len de l'El
Irouléguy|Sud-Ouest|r:Tannat,Cabernet Franc
Fronton|Sud-Ouest|r:Négrette
Côtes de Gascogne|Sud-Ouest|w:Colombard,Ugni Blanc,Gros Manseng
Patrimonio|Corse|r:Nielluccio;w:Vermentino
Ajaccio|Corse|r:Sciaccarellu
Barolo|Piemonte|r:Nebbiolo
Barbaresco|Piemonte|r:Nebbiolo
Roero|Piemonte|r:Nebbiolo;w:Arneis
Langhe|Piemonte|r:Nebbiolo,Dolcetto,Barbera;w:Chardonnay,Arneis
Barbera d'Asti|Piemonte|r:Barbera
Barbera d'Alba|Piemonte|r:Barbera
Dolcetto d'Alba|Piemonte|r:Dolcetto
Gattinara|Piemonte|r:Nebbiolo
Ghemme|Piemonte|r:Nebbiolo
Gavi|Piemonte|w:Cortese
Moscato d'Asti|Piemonte|s,d:Muscat
Asti|Piemonte|s:Muscat
Brachetto d'Acqui|Piemonte|s,d:Brachetto
Brunello di Montalcino|Toscana|r:Sangiovese
Rosso di Montalcino|Toscana|r:Sangiovese
Vino Nobile di Montepulciano|Toscana|r:Sangiovese
Chianti|Toscana|r:Sangiovese
Chianti Classico|Toscana|r:Sangiovese
Bolgheri|Toscana|r:Cabernet Sauvignon,Merlot,Cabernet Franc;w:Vermentino
Bolgheri Sassicaia|Toscana|r:Cabernet Sauvignon,Cabernet Franc
Morellino di Scansano|Toscana|r:Sangiovese
Carmignano|Toscana|r:Sangiovese,Cabernet Sauvignon
Vernaccia di San Gimignano|Toscana|w:Vernaccia
Amarone della Valpolicella|Veneto|r:Corvina,Rondinella,Molinara
Valpolicella|Veneto|r:Corvina,Rondinella
Valpolicella Ripasso|Veneto|r:Corvina,Rondinella
Recioto della Valpolicella|Veneto|d:Corvina,Rondinella
Soave|Veneto|w:Garganega
Prosecco|Veneto|s:Glera
Bardolino|Veneto|r,p:Corvina,Rondinella
Lugana|Lombardia|w:Verdicchio
Franciacorta|Lombardia|s:Chardonnay,Pinot Noir,Pinot Blanc
Trento|Trentino|s:Chardonnay,Pinot Noir
Collio|Friuli|w:Friulano,Ribolla Gialla,Pinot Gris,Sauvignon Blanc
Alto Adige|Alto Adige|w:Pinot Blanc,Pinot Gris,Gewürztraminer,Sauvignon Blanc;r:Lagrein,Schiava,Pinot Noir
Montepulciano d'Abruzzo|Abruzzo|r:Montepulciano
Trebbiano d'Abruzzo|Abruzzo|w:Trebbiano
Verdicchio dei Castelli di Jesi|Marche|w:Verdicchio
Taurasi|Campania|r:Aglianico
Fiano di Avellino|Campania|w:Fiano
Greco di Tufo|Campania|w:Greco
Aglianico del Vulture|Campania|r:Aglianico
Primitivo di Manduria|Puglia|r:Primitivo
Salice Salentino|Puglia|r:Negroamaro
Etna|Sicilia|r:Nerello Mascalese;w:Carricante
Cerasuolo di Vittoria|Sicilia|r:Nero d'Avola,Frappato
Marsala|Sicilia|f:Grillo,Catarratto,Inzolia
Cannonau di Sardegna|Sardegna|r:Grenache
Vermentino di Gallura|Sardegna|w:Vermentino
Montefalco Sagrantino|Umbria|r:Sagrantino
Lambrusco|Emilia-Romagna|s:Lambrusco
Rioja|Rioja|r:Tempranillo,Garnacha,Graciano,Mazuelo;w:Viura
Ribera del Duero|Ribera del Duero|r:Tempranillo
Toro|Castilla y León|r:Tempranillo
Rueda|Castilla y León|w:Verdejo
Bierzo|Castilla y León|r:Mencía;w:Godello
Priorat|Priorat|r:Grenache,Carignan
Montsant|Catalunya|r:Grenache,Carignan
Penedès|Catalunya|w:Xarel·lo,Macabeo,Parellada
Cava|Catalunya|s:Macabeo,Xarel·lo,Parellada
Rías Baixas|Rías Baixas|w:Albariño
Ribeira Sacra|Galicia|r:Mencía
Valdeorras|Galicia|w:Godello
Jerez|Jerez|f:Palomino,Pedro Ximénez
Sherry|Jerez|f:Palomino,Pedro Ximénez
Jumilla|Spanien|r:Monastrell
Navarra|Navarra|r:Garnacha,Tempranillo;p:Garnacha
Douro|Douro|r:Touriga Nacional,Touriga Franca,Tinta Roriz
Port|Douro|f:Touriga Nacional,Touriga Franca,Tinta Roriz
Porto|Douro|f:Touriga Nacional,Touriga Franca,Tinta Roriz
Dão|Dão|r:Touriga Nacional;w:Encruzado
Bairrada|Portugal|r:Baga
Vinho Verde|Vinho Verde|w:Alvarinho,Loureiro,Arinto
Alentejo|Alentejo|r:Aragonez,Trincadeira,Alicante Bouschet
Madeira|Madeira|f:Sercial,Verdelho,Boal,Malmsey
Mosel|Mosel|w:Riesling
Rheingau|Rheingau|w:Riesling;r:Spätburgunder
Pfalz|Pfalz|w:Riesling;r:Spätburgunder
Rheinhessen|Rheinhessen|w:Riesling,Silvaner
Nahe|Nahe|w:Riesling
Franken|Franken|w:Silvaner
Baden|Baden|r:Spätburgunder;w:Grauburgunder,Weißburgunder
Ahr|Ahr|r:Spätburgunder
Wachau|Wachau|w:Grüner Veltliner,Riesling
Kamptal|Kamptal|w:Grüner Veltliner,Riesling
Kremstal|Kremstal|w:Grüner Veltliner,Riesling
Burgenland|Burgenland|r:Blaufränkisch,Zweigelt;d:Welschriesling
Steiermark|Steiermark|w:Sauvignon Blanc,Morillon
Tokaji|Tokaj|d,w:Furmint,Hárslevelű
Santorini|Santorini|w:Assyrtiko
Naoussa|Grækenland|r:Xinomavro
Nemea|Grækenland|r:Agiorgitiko
Napa Valley|Napa Valley|r:Cabernet Sauvignon,Merlot;w:Chardonnay,Sauvignon Blanc
Sonoma Coast|Sonoma|r:Pinot Noir;w:Chardonnay
Willamette Valley|Oregon|r:Pinot Noir;w:Chardonnay,Pinot Gris
Barossa Valley|Barossa|r:Shiraz,Grenache
McLaren Vale|McLaren Vale|r:Shiraz,Grenache
Coonawarra|Coonawarra|r:Cabernet Sauvignon
Margaret River|Margaret River|r:Cabernet Sauvignon;w:Chardonnay
Clare Valley|Clare Valley|w:Riesling
Eden Valley|Eden Valley|w:Riesling
Hunter Valley|Hunter Valley|w:Sémillon;r:Shiraz
Marlborough|Marlborough|w:Sauvignon Blanc;r:Pinot Noir
Central Otago|Central Otago|r:Pinot Noir
Mendoza|Mendoza|r:Malbec
Stellenbosch|Stellenbosch|r:Cabernet Sauvignon,Pinotage;w:Chenin Blanc
Swartland|Swartland|w:Chenin Blanc;r:Syrah
Maipo|Maipo|r:Cabernet Sauvignon
Colchagua|Colchagua|r:Carmenère,Cabernet Sauvignon
Bekaa Valley|Bekaa|r:Cabernet Sauvignon,Cinsault,Carignan
`;

const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a").replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ").trim();
const lines = t => t.trim().split("\n").map(l => l.split("|"));
const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);

const countries = lines(COUNTRIES).map(([n, en, fr, de, al]) => ({ n, names: { da: n, en, fr, de }, alias: list(al) }));
const regions = lines(REGIONS).map(([n, c, en, fr, de, al]) => ({ n, country: c, names: { da: n, en, fr, de }, alias: list(al) }));
const grapes = lines(GRAPES).map(([n, col, syn]) => ({ n, col, syn: list(syn) }));
const COLOURS = { r: "red", w: "white", p: "rosé", s: "sparkling", d: "sweet", f: "fortified" };
const apps = lines(APPS).map(([n, region, spec]) => {
  const wines = String(spec).split(";").map(g => { const [cols, gr] = g.split(":"); return { cols: cols.split(","), grapes: list(gr) }; });
  return { n, region, wines };
});

const api = { countries, regions, grapes, apps, COLOURS, norm };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.WINE_KB = api;
})(typeof window !== "undefined" ? window : globalThis);
