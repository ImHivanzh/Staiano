"""Build the finite finish whitelist; hex values are display approximations only."""
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import hashlib, json, re, statistics
from PIL import Image
import pdfplumber

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'generated' / 'radiator-finishes.json'
NOW = datetime.now(timezone.utc).isoformat()
PREVIEW = 'Campione indicativo per anteprima 3D; nessuna equivalenza colorimetrica certificata RAL. Texture e metallizzazione non sono riprodotte dal colore uniforme.'
sources = json.loads((ROOT / 'radiator-finishes-manifest.json').read_text(encoding='utf-8'))
for source in sources:
    source['documentRevision'] = '2025' if source['id'].startswith('cordivari') else '04/2024' if source['id'] == 'zehnder-valve-finishes' else None
zeh_valve_url = 'https://www.zehnder.it/it/radiatori-decorativi/zehnder-valvole-colorate'
zeh_valve_path = ROOT / 'zehnder-valve-colours.html'
if not zeh_valve_path.exists():
    with urlopen(Request(zeh_valve_url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as response:
        zeh_valve_path.write_bytes(response.read())
sources.append(dict(id='zehnder-valve-colours',sourceUrl=zeh_valve_url,sourceType='html',localPath='catalog-data/sources/zehnder-valve-colours.html',retrievedAt=NOW,sha256=hashlib.sha256(zeh_valve_path.read_bytes()).hexdigest(),documentRevision=None))

def reuse(source_id, name):
    for filename in ['manifest.json', 'radiators-extended-manifest.json']:
        for source in json.loads((ROOT / filename).read_text(encoding='utf-8')):
            if source['name'] == name:
                copy = dict(id=source_id, sourceUrl=source['sourceUrl'], sourceType='pdf', localPath=f'catalog-data/sources/{name}.pdf', retrievedAt=source['retrievedAt'], sha256=source['sha256'], documentRevision=source.get('documentRevision'), pageCount=source['pageCount'])
                sources.append(copy)
                return
    raise ValueError(name)

reuse('global-finishes', 'global-listino-2026')
sources[-1]['documentRevision'] = 'Listino giugno 2026'
for name in ['cordivari-lisa22','cordivari-claudia','cordivari-tamara','lazzarini-sanremo','lazzarini-garda','lazzarini-empoli']:
    reuse(name, name)

families = []
finishes = []
def family(key, manufacturer, aliases, defaults, note=''):
    families.append(dict(id=key, manufacturer=manufacturer, aliases=aliases, defaultFinishIds=defaults, note=note))

def add(manufacturer, code, label, colour, roles, family_ids, source_id, *, ral=None, kind='paint', note='', page=None, method='representative-display', swatch_url=None):
    finish = dict(id=f'{manufacturer.lower()}-{code.lower()}', manufacturer=manufacturer, code=code, label=label, colorHex=colour, kind=kind, supportedRoles=list(roles), availability={role:list(family_ids) for role in roles}, sourceId=source_id, sourcePage=page, previewMethod=method, previewNote=PREVIEW, availabilityNote=note)
    if ral: finish['ralCode'] = str(ral)
    if swatch_url: finish['swatchSourceUrl'] = swatch_url
    finishes.append(finish)
    return finish

cord_families = ['cordivari-ardesia','cordivari-claudia','cordivari-tamara']
cord_all = cord_families + ['cordivari-lisa22']
for key, aliases in [('cordivari-ardesia',[f'Ardesia {n} colonne' for n in range(2,7)]),('cordivari-claudia',['Claudia']),('cordivari-tamara',['Tamara verticale','Tamara']),('cordivari-lisa22',['Lisa 22','Lisa22'])]:
    family(key,'Cordivari',aliases,dict(body='cordivari-r01',valve='cordivari-r01',lockshield='cordivari-r01',pipeCover='cordivari-pipe-white'))

cord_rows = '''R01|Bianco|9010
R02|Bianco traffico|9016
R14|Crema|9001
T11|Bianco opaco
T10|Beige opaco
R40|Pearl white|1013
S17|Bahama beige
R13|Nero|9005
R21|Grigio argento|7001
T19|British grey
S07|Grafite
F43|Grey antracite
R05|Giallo acceso|1021
H27|Rosso vivo
R08|Rosso rubino|3003
R18|Blu oltremare|5017
R22|Grigio pietra|7030
F30|White sand
F25|Quartz dust
F31|Corten brown
F36|Terra
R09|Testa di moro|8017
F23|Sparkling grey
F04|Grigio grafite
F15|Nero brillante metallizzato
F24|Black star
T01|Nero opaco
R26|Weissgrün|6019
F45|Sage green
F14|Effetto bronzo antico
F20|Milky
S03|Pergamon
T15|Tela opaco
T20|White grey
F09|Grigio alba metallizzato
S02|Manhattan
F52|Marrakech light
H48|Tortora
T12|Grigio chiaro opaco
T23|Powder
S22|Perlage
F46|Velvety sand
F07|Effetto argento
T24|Nabuk
F38|Sandstone
T17|Acai matt
S27|Virginia leaf
S24|Bright copper
S25|Vintage copper
F49|New light coral
F34|Red sand
F35|Forest green
S23|Jazz brass
F41|Amber gold
F22|Oro classico
F51|Pozzolana
F39|Balmoral grey
F44|Clay
S29|Smoky quartz
F50|Highland
H56|Pietra lavica
S28|Anvil
F26|Dark aluminium
F48|Basalt
F27|Moonshine
S26|Anodic silver
F32|Grey sky
H09|Lago
F37|Denim blue
S30|Cast iron
F33|Emerald sand
F06|Nero ruvido metallizzato
M01|Gold black
W02|Carbone
F53|Silver look
F28|Ardesia Shiny transparent'''

def sample_pdf(code, pdf, pages, image_prefix):
    for index in pages:
        page = pdf.pages[index]
        for word in page.extract_words():
            if word['text'].upper() == code:
                im = Image.open(ROOT / f'{image_prefix}-p{index+1}.png').convert('RGB')
                sx,sy = im.width / page.width, im.height / page.height
                x,y = (word['x0']+word['x1'])/2, word['top']-20
                crop = im.crop((int((x-6)*sx),int((y-6)*sy),int((x+6)*sx),int((y+6)*sy)))
                pixels = list(crop.get_flattened_data())
                rgb = tuple(round(statistics.median(pixel[c] for pixel in pixels)) for c in range(3))
                return '#%02x%02x%02x' % rgb, index+1
    raise ValueError(f'No PDF swatch label: {code}')

with pdfplumber.open(ROOT / 'cordivari-colours.pdf') as pdf:
    for row in cord_rows.splitlines():
        code,label,*ral = row.split('|')
        colour,page = sample_pdf(code,pdf,[1,2],'cordivari-colours')
        scope = cord_all if code in ['R01','R02'] else cord_families
        roles = ['body','valve','lockshield']
        if code == 'F28': scope,roles = ['cordivari-ardesia'],['body']
        finish = add('Cordivari',code,label,colour,roles,scope,'cordivari-colours',ral=ral[0] if ral else None,page=page,method='manufacturer-pdf-swatch',note='Kristal Total Color: finiture colorate fornite a corredo del radiatore colorato; verifica commerciale del kit richiesta. Selezione grafica separata, non distinta vendita del detentore.')
        if code == 'F28':
            finish['availability'] = {'body':['cordivari-ardesia']}
    # Lisa 22 from the imported white technical sheet has no painted palette.
    for code,label,colour in [('pipe-white','Bianco','#fafafa'),('pipe-polished','Lucido','#c8cbd0'),('pipe-satin','Satinato','#aab0b6'),('pipe-bronze','Bronzo','#9a7951'),('pipe-antique-copper','Rame antico','#a4694d')]:
        add('Cordivari',code,label,colour,['pipeCover'],cord_all,'cordivari-accessory-finishes',page=9,kind='metal' if code != 'pipe-white' else 'paint',note='Kit copritubo ufficiali, indipendenti dai colori del corpo.')
    for code,label,colour in [('valve-polished','Lucido','#c8cbd0'),('valve-satin','Satinato','#aab0b6'),('valve-brass','Ottone','#b59750'),('valve-antique-copper','Rame antico','#a4694d')]:
        page = 6 if code == 'valve-polished' else 7 if code == 'valve-satin' else 8
        add('Cordivari',code,label,colour,['valve','lockshield'],cord_all,'cordivari-accessory-finishes',kind='metal',page=page,note='Finitura della serie Kristal: compatibilità del kit dipende da connessione e raccordi.')

zeh_families = ['zehnder-charleston','zehnder-nova']
for key,aliases in [('zehnder-charleston',[f'Charleston {n} colonne' for n in range(2,7)]),('zehnder-nova',['Nova','Nova Easy verticale ZNV','Nova Easy verticale ZNVL','Nova Easy verticale ZNVV','Nova Easy verticale ZNVLV'])]:
    family(key,'Zehnder',aliases,dict(body='zehnder-9016',valve='zehnder-9016',lockshield='zehnder-9016',pipeCover='zehnder-chrome'))
zeh_html = (ROOT / 'zehnder-charleston-finishes.html').read_text(encoding='utf-8')
nova_html = (ROOT / 'zehnder-nova-finishes.html').read_text(encoding='utf-8')
for attrs,title in re.findall(r'<a\s+([^>]*class="color__link[^>]+)>\s*<span>([^<]+)</span>',zeh_html):
    title = __import__('html').unescape(title)
    parsed = re.fullmatch(r'(.+) \((\d{4})(\*)?(?: / RAL (\d{4}))?\)',title)
    if not parsed: raise ValueError(title)
    label,code,gloss,ral = parsed.groups()
    if any(f['id'] == 'zehnder-'+code for f in finishes): continue
    if title not in nova_html: raise ValueError(f'Nova missing {title}')
    swatch_url = 'https://www.zehnder.it' + re.search(r'data-background-image="([^"]+)"',attrs).group(1)
    swatch_path = ROOT / f'zehnder-finish-{code}.png'
    if not swatch_path.exists():
        with urlopen(Request(swatch_url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as response:
            swatch_path.write_bytes(response.read())
    im = Image.open(swatch_path).convert('RGB')
    crop = im.crop((im.width//4,im.height//4,3*im.width//4,3*im.height//4))
    rgb = tuple(round(statistics.median(pixel[c] for pixel in crop.get_flattened_data())) for c in range(3))
    colour = '#%02x%02x%02x' % rgb
    roles = ['body']
    # Primary accessory page explicitly depicts these six colours. "Almost all"
    # is not sufficient evidence for unrestricted accessory colour availability.
    if code in ['9016','1235','5214','6219','0289','0292','9217']: roles += ['valve','lockshield']
    finish = add('Zehnder',code,label,colour,roles,zeh_families,'zehnder-charleston-finishes',ral=ral,method='manufacturer-image-swatch',swatch_url=swatch_url,note=('Design Line: selezione limitata ai colori illustrati dal produttore; non tutte le finiture corpo sono abilitate per accessori.' if len(roles)>1 else 'Finitura corpo pubblicata nelle pagine Charleston e Nova.'))
    finish['swatchSha256'] = hashlib.sha256(swatch_path.read_bytes()).hexdigest()
    if len(roles)>1:
        finish['availabilitySourceId'] = 'zehnder-valve-colours'
        finish['availabilitySourceUrl'] = zeh_valve_url
for code,label,colour in [('chrome','Cromo','#c8cbd0'),('brushed-inox','Inox spazzolato','#aab0b6')]:
    add('Zehnder',code,label,colour,['valve','lockshield','pipeCover'],zeh_families,'zehnder-valve-finishes',kind='metal',page=11,note='Kit copritubo: cromo 70/160 mm, inox spazzolato 70 mm. Selezione finitura, non codice commerciale del kit.')

# RAL numeric references published in the manufacturer colour map. These are
# expressly representative screen values, not a RAL-certified RGB conversion.
ral_hex = {'1016':'#e8df2b','1021':'#f3da0b','1004':'#ddb91d','2004':'#e75b12','3000':'#a72920','3003':'#861a22','3005':'#59191f','4006':'#922b3e','4003':'#c4618c','5015':'#2271b3','5017':'#063971','5002':'#20214f','5013':'#1e213d','6003':'#424632','6005':'#2f4538','6016':'#1e5945','6032':'#317f43','6019':'#bdecb6','7037':'#7d7f7d','7012':'#575d5e','9005':'#0a0a0a','9016':'#f6f6f6','9002':'#e7ebda','1013':'#eae6ca','1015':'#e6d690','1014':'#ddc49a','1001':'#c2b078','1019':'#a48f7a','7006':'#756f61','8016':'#4c2b20','7047':'#d0d0d0','7004':'#9da1aa','7001':'#8a9597','7030':'#8b8c7a','7023':'#7d8471'}
lazz_body = ['lazzarini-sanremo-white','lazzarini-garda-white','lazzarini-empoli-white']
lazz_chrome = ['lazzarini-sanremo-chrome','lazzarini-empoli-chrome']
lazz_dark = ['lazzarini-sanremo-anthracite','lazzarini-empoli-anthracite']
lazz_all = lazz_body + lazz_chrome + lazz_dark + ['lazzarini-garda-black']
for key,aliases,body in [('lazzarini-sanremo-white',['Sanremo bianco dritto','Sanremo bianco curvo'],'lazzarini-ral9016-gloss'),('lazzarini-sanremo-chrome',['Sanremo cromato dritto','Sanremo cromato curvo'],'lazzarini-chrome'),('lazzarini-sanremo-anthracite',['Sanremo antracite dritto'],'lazzarini-vov12'),('lazzarini-garda-white',['Garda bianco'],'lazzarini-ral9016-gloss'),('lazzarini-garda-black',['Garda nero'],'lazzarini-ral9005-matt'),('lazzarini-empoli-white',['Empoli bianco'],'lazzarini-ral9016-gloss'),('lazzarini-empoli-chrome',['Empoli cromato'],'lazzarini-chrome'),('lazzarini-empoli-anthracite',['Empoli antracite'],'lazzarini-vov12')]:
    family(key,'Lazzarini',aliases,dict(body=body,valve='lazzarini-accessory-white',lockshield='lazzarini-accessory-white'),note='La famiglia commerciale conserva la resa termica del documento: cromato, bianco e antracite non sono intercambiabili come semplice colore.')
cache = 'Primary page text read by web tool on 2026-10-04. Direct HTTP subsequently returned 404.\nSource: https://www.lazzariniradiatori.it/Tabella-colori-Lazzarini\nGloss: '+', '.join(list(ral_hex)[:18])+'\nGloss and matt: '+', '.join(list(ral_hex)[18:])+'\nMineral: VOV09 Bianco; VOV15 Quarzo; VOV13 Ametista; VOV16 Azzurrite; VOV08 Tabacco; VOV12 Antracite.\n'
cache_path = ROOT / 'lazzarini-colours-web-extract.txt'
cache_path.write_text(cache,encoding='utf-8')
sources.append(dict(id='lazzarini-colours-web-extract',sourceUrl='https://www.lazzariniradiatori.it/Tabella-colori-Lazzarini',sourceType='web-extract',localPath='catalog-data/sources/lazzarini-colours-web-extract.txt',retrievedAt=NOW,sha256=hashlib.sha256(cache_path.read_bytes()).hexdigest(),documentRevision=None))
accessory_cache = 'Primary page text read by web tool on 2026-10-04. Direct HTTP subsequently returned 404.\nSource: https://www.lazzariniradiatori.it/Accessori-e-valvole\nValve and lockshield: white 386060/386061/389906; chrome 386059/386062/389907. No pipe-cover finish documented.\n'
(ROOT / 'lazzarini-accessory-finishes-web-extract.txt').write_text(accessory_cache,encoding='utf-8')
sources.append(dict(id='lazzarini-accessories-web-extract',sourceUrl='https://www.lazzariniradiatori.it/Accessori-e-valvole',sourceType='web-extract',localPath='catalog-data/sources/lazzarini-accessory-finishes-web-extract.txt',retrievedAt=NOW,sha256=hashlib.sha256((ROOT / 'lazzarini-accessory-finishes-web-extract.txt').read_bytes()).hexdigest(),documentRevision=None))
for index,(ral,colour) in enumerate(ral_hex.items()):
    for kind in (['gloss'] if index<18 else ['gloss','matt']):
        scope = list(lazz_body)
        if ral == '9005' and kind == 'matt': scope += ['lazzarini-garda-black']
        add('Lazzarini',f'ral{ral}-{kind}',f'RAL {ral} '+('lucido' if kind=='gloss' else 'opaco'),colour,['body'],scope,'lazzarini-colours-web-extract',ral=ral,note='Colori cartella per radiatori verniciati; non applicati alle famiglie cromate o antracite importate con resa propria.')
add('Lazzarini','chrome','Cromo','#c8cbd0',['body'],lazz_chrome,'lazzarini-colours-web-extract',kind='metal')
add('Lazzarini','vov12','VOV12 Antracite','#3c3b3a',['body'],lazz_dark,'lazzarini-colours-web-extract',kind='mineral',note='Solo variante antracite con resa termica documentata.')
for code,label,colour in [('accessory-white','Bianco','#f6f6f6'),('accessory-chrome','Cromo','#c8cbd0')]:
    add('Lazzarini',code,label,colour,['valve','lockshield'],lazz_all,'lazzarini-accessories-web-extract',kind='metal' if code.endswith('chrome') else 'paint',note='Coppia valvola e detentore ufficiale. Colori separabili solo per anteprima; kit commerciale ha finitura comune.')

global_family = ['global-vip','global-oscar']
for key,aliases in [('global-vip',['VIP']),('global-oscar',['Oscar','OSCAR'])]:
    family(key,'Global',aliases,dict(body='global-10',valve='global-10',lockshield='global-10',pipeCover='global-10'))
global_rows = '''10|Bianco lucido|#f4f1e8|9010
12|Bianco opaco|#f3f1e9
11|Bianco sablè|#f6f6f6|9016
01|Avorio lucido|#eae6ca|1013
08|Grigio argento sablè metallizzato|#b4b4ad
15|Grigio ascot sablè|#a3a19a
17|Sottobosco sablè|#928e85|7034
18|Oliva sablè|#7c8068|6013
16|Gold true joy sablè|#b89b69
06|Quarzo metallizzato|#918575
05|Beige sablè metallizzato|#c2b6a3
20|Rosa antico sablè|#a58779
09|Ruggine/Corten sablè|#92523b
19|Cioccolato fondente sablè|#403a3a|8019
07|Grigio scuro sablè metallizzato|#555655
14|Nero opaco|#1c1c1c|9004'''
for row in global_rows.splitlines():
    code,label,colour,*ral = row.split('|')
    add('Global',code,label,colour,['body','valve','lockshield','pipeCover'],global_family,'global-finishes',ral=ral[0] if ral else None,page=29,note='Corpo: cartella colori p.29. Accessori: valvole/detentori p.26 e copritubo A446/rosette p.27; scelta grafica separata, codici kit da verificare.')
add('Global','99','Cromo lucido','#c8cbd0',['valve','lockshield','pipeCover'],global_family,'global-finishes',kind='metal',page=27,note='Finitura accessori Global A400–A406/A446; non documentata per corpo VIP/Oscar.')

sources_by_id = {source['id']:source for source in sources}
for finish in finishes:
    finish['sourceUrl'] = sources_by_id[finish['sourceId']]['sourceUrl']
payload = dict(version='2026-10-04-radiator-finishes-v1',previewDisclaimer=PREVIEW,families=families,finishes=finishes,sources=sources)
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
swatches = [dict(finishId=finish['id'],sourceUrl=finish['swatchSourceUrl'],sha256=finish['swatchSha256'],localPath=f"catalog-data/sources/zehnder-finish-{finish['code']}.png") for finish in finishes if 'swatchSourceUrl' in finish]
(ROOT / 'radiator-finishes-catalog-manifest.json').write_text(json.dumps(dict(version=payload['version'],sources=sources,swatches=swatches),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(finishes=len(finishes),families=len(families),manufacturers={m:sum(f['manufacturer']==m for f in finishes) for m in ['Cordivari','Zehnder','Lazzarini','Global']})))
