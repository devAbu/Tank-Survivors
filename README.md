# Tank Survivors (radni naziv)

Offline Android igra za Google Play: vozi tenk, kupola sama puca, skupljaj sanduke i nadograđuj dijelove tenka. Runda traje 10 minuta, mini-boss svake 3 minute, glavni boss na 10:00.

Stack je isti kao u `merge-defense`: HTML5 canvas + vanilla JS u Capacitor omotaču, bez eksternih servisa. Sva grafika i zvuk se generišu kodom.

## Kako se igra
- Dodirni i vuci bilo gdje na ekranu: plutajući joystick (smjer + gas). Tenk se okreće prema smjeru i vozi s inercijom.
- Kupola se sama okreće prema najbližem neprijatelju. Gaženje malo oštećuje neprijatelje.
- Sanduci (strelice na rubu ekrana pokazuju gdje su) daju nasumičan nadogradnju dijela. Nivo 3 dijela = **evolucija** s posebnom sposobnošću.
- Dijelovi: kupola, lijevi i desni bočni top, motor, gusjenice, oklop, radar, popravka.
- Coini se troše u garaži na boje i oznake (samo kozmetika, bez uticaja na igru).

## Pokretanje lokalno
```bash
cd www && python3 -m http.server 8000   # pa otvori http://localhost:8000 (u mobilnom prikazu)
```
Debug hook: dodaj `?debug` na URL pa je `window.__ts` dostupan u konzoli.

Provjera logike (bot odigra rundu, bez browsera):
```bash
npm run sim
```

## Izgradnja APK-a
GitHub Actions (`.github/workflows/build-apk.yml`) gradi APK na **svaki push**:
- Actions → odabrani run → **Artifacts** → `tank-survivors-apk`, ili
- **Releases** (grana `main` = `build-N`, ostale grane = `dev-N` pre-release).

Lokalno (treba Node 22, JDK 21, Android SDK):
```bash
npm ci
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug -I ../android-signing.gradle
```
`keystore/debug.keystore` je fiksni DEBUG ključ (nove verzije se instaliraju preko starih). Nije za Play Store. Portret orijentacija se zaključava u workflow-u.

## Gdje su postavke
- **U igri**: Menu → SETTINGS (muzika, efekti, vibracija). Čuva se lokalno.
- **Balans** (trajanje runde, vrijeme bossova, broj neprijatelja, cooldown reklame...): `www/config.js`
- **Svi tekstovi** (za prevod): `www/strings.js`
- **Boje, oznake i cijene**: `www/save.js` (`PAINTS`, `DECALS`)
- **Dijelovi tenka i neprijatelji** (statistike po nivou): `www/core.js` (`recalc()`, `sideStats()`, `EN`)

## Reklame (AdService)
`www/ads.js` je jedino mjesto koje zna za reklame. Trenutno je simulacija: dugme odbrojava (3 s), daje nagradu, pa cooldown (30 s). Rewarded mjesta: **revive** (jednom po rundi), **x2 coins** (rezultat), **free coins** (meni).
Za pravi AdMob: zamijeni tijelo `show(placement)` pozivom rewarded SDK-a (vrati `Promise<true>` kad je nagrada zarađena) i zadrži `state()`/`show()` potpise. Ostatak koda se ne dira. Nema banera ni prisilnih reklama.

## Struktura
```
www/index.html   ulazna tačka
www/config.js    balans
www/strings.js   tekstovi (EN)
www/core.js      logika igre (bez DOM-a, testira se u Node-u)
www/save.js      lokalni napredak + kozmetika
www/ads.js       AdService (simulirane rewarded reklame)
www/audio.js     WebAudio zvuk i muzika (bez fajlova)
www/main.js      render, input, ekrani
tools/sim.js     headless provjera
```
