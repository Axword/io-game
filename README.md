# Arena.io

Gra przeglądarkowa z trybem solo i autorytatywnym serwerem multiplayer. Główne pliki klienta znajdują się w `js/`; wejście to `index.html`. Starszy adres `io-circle-game/index.html` przekierowuje do tej wersji.

## Uruchomienie

Wymagany jest Node.js z npm; tę wersję sprawdzono na Node.js 24.

```powershell
npm ci
npm start
```

Otwórz `http://localhost:3000`. Ten sam serwer udostępnia grę i WebSocket. Kolejne przeglądarki mogą dołączyć przez kod pokoju. Dla innych urządzeń użyj adresu IP komputera z serwerem. Port można zmienić zmienną `PORT`; publiczna instalacja HTTPS powinna przekazywać także połączenia WebSocket.

Tryb bez serwera multiplayer: `npm run start:solo`, następnie `http://localhost:4173`. Opcjonalne `window.ARENA_SERVER_URL`, ustawione przed załadowaniem klienta, pozwala wskazać osobny serwer WebSocket.

## Rozgrywka

- Ruch: WASD, strzałki lub joystick na ekranie dotykowym. Broń atakuje automatycznie. Escape albo przycisk pauzy otwiera menu; solo zatrzymuje czas, multiplayer nadal działa.
- Kampania obejmuje Szmaragdową Polanę, Kryształowy Lodowiec i Żarzącą Otchłań. Każda mapa ma inny układ przeszkód, kolory i trzech własnych przeciwników.
- Poziom 30 odblokowuje Lodowiec, a 60 Otchłań. Portal znajduje się w centrum mapy. Podejdź do niego i naciśnij E lub przycisk portalu. Przejście zachowuje poziom, życie, broń i przedmioty. W Otchłani portal prowadzi z powrotem na Polanę.
- Zwycięstwo kampanii wymaga przetrwania co najmniej 8 minut w Otchłani i pokonania trzech tamtejszych bossów. Bossowie każdej mapy pojawiają się około 1:30, 4:00 i 7:00; ataki są zapowiadane, a HP zależy od wyposażenia uczestników walki.
- Pierwszy awans zawsze oferuje dodatkową broń. Wybór ulepszenia i otwieranie skrzynki zatrzymują czas w solo.
- Skrzynki pojawiają się w pobliżu gracza i wypadają z bossów. Osiem przedmiotów ma maksymalnie pięć kumulujących się stosów. Zwykła skrzynka daje jeden stos, skrzynka bossa dwa.
- Poziom 8, co najmniej dwa stosy właściwego przedmiotu i skrzynka bossa pozwalają ewoluować broń. Przykłady: kula ognia + Żar, łuk + Pryzmat, piorun + Koniczyna. Każda ewolucja działa raz na broń.
- W multiplayerze serwer rozstrzyga podniesienie skrzynki, losuje przedmiot i aktualizuje ekwipunek. Odrodzenie zaczyna nową postać z zachowaniem premii permanentnych.
- Światy multiplayer mają oddzielne pociski, przeciwników, przedmioty i zegary. Portal sprawdza serwer. Odblokowania pozostają po odrodzeniu w bieżącej sesji; solo zapisuje odblokowane światy w tej przeglądarce. Nie ma systemu kont ani zapisu multiplayer między restartami serwera.
- Pokoje obsługują ustawiony limit 2–12 graczy oraz prywatność. Puste światy nie symulują tłumów; wszystkie aktywne mapy dzielą ograniczony budżet przeciwników.

Sterowanie i HUD sprawdzono na rozmiarach od 320×568 do iPada 1024×768, w pionie i poziomie, również z silnikiem WebKit. To testy emulowanych urządzeń, nie pomiary FPS na fizycznym iPhonie lub iPadzie.

Ikony w `assets/icons/` są oryginalnymi, deterministycznymi rysunkami SVG. Wspólny obrys, paleta i siatka zastępują mieszankę emoji. Można odtworzyć zestaw poleceniem `node assets/icons/generate-icons.mjs`.

## Sprawdzenie zmian

```powershell
npm test
npm run test:solo
npm run test:campaign
npm run test:multiplayer
npm run test:world-load
npx playwright install chromium webkit
npm run test:browser
npm run test:mobile
```

Testy sieciowe wymagają możliwości łączenia się z lokalnym serwerem. Wyniki pomiarów zapisują się w `output/test-results/`, a zrzuty i raport przeglądarki w `output/playwright/`. Parametry dłuższych testów: `QA_WORLD_SOAK_SECONDS`, `QA_WORLD_CLIENTS`, `QA_NETWORK_SECONDS`, `QA_CLASSES`, `QA_SEEDS`. `QA_WAIT_BOSSES=1` wydłuża test kampanii o wszystkie dziewięć starć z bossami. `test:solo` sprawdza pojedynczą mapę, a `test:campaign` pełne trzy światy.

Aktualne wyniki: [WORLD_TEST_REPORT.md](WORLD_TEST_REPORT.md). Niezależny review telefonu i architektury: [REVIEW_WORLD_MOBILE.md](REVIEW_WORLD_MOBILE.md). Poprzedni etap gry opisuje [TEST_REPORT.md](TEST_REPORT.md).
