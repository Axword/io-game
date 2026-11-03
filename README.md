# Vamps.io

Gra przeglądarkowa z trybem solo i autorytatywnym serwerem multiplayer. Główne pliki klienta znajdują się w `js/`; wejście to `index.html`. Starszy adres `io-circle-game/index.html` przekierowuje do tej wersji.

Menu ma rozmytą, animowaną scenę walki utrzymaną w stylu gry. Podgląd zatrzymuje się po rozpoczęciu rozgrywki lub ukryciu karty; przy ograniczeniu animacji w systemie pozostaje nieruchomy.

Adres hostowanej gry: [vamps-io.onrender.com](https://vamps-io.onrender.com/). Opis poniżej dotyczy bieżącego kodu; zmiany wymagają wdrożenia na hostingu, aby pojawiły się pod tym adresem.

## Uruchomienie

Wymagany jest Node.js z npm; tę wersję sprawdzono na Node.js 24.

```powershell
npm ci
npm start
```

Otwórz `http://localhost:3000`. Ten sam serwer udostępnia grę i WebSocket. Kolejne przeglądarki mogą dołączyć przez kod pokoju. Dla innych urządzeń użyj adresu IP komputera z serwerem. Port można zmienić zmienną `PORT`; publiczna instalacja HTTPS powinna przekazywać także połączenia WebSocket.

Tryb bez serwera multiplayer: `npm run start:solo`, następnie `http://localhost:4173`. Opcjonalne `window.VAMPS_SERVER_URL`, ustawione przed załadowaniem klienta, pozwala wskazać osobny serwer WebSocket. Starsza nazwa `window.ARENA_SERVER_URL` nadal działa.

Produkcja na Renderze używa dwóch usług: statycznego frontendu `vamps-io.onrender.com` i serwera `vamp-io.onrender.com`. Frontend: katalog główny repozytorium, polecenie budowania `npm ci && VAMPS_SERVER_URL=wss://vamp-io.onrender.com npm run build:static`, katalog publikacji `dist`. Builder dołącza bibliotekę Three.js i adres WebSocket; publikuje wyłącznie pliki klienta. Backend uruchamia `npm start` z katalogu głównego i korzysta z portu nadanego przez Render. Zmiany protokołu należy wdrażać w obu usługach. Bez zmiennej `VAMPS_SERVER_URL` wynik budowania zachowuje połączenie do tego samego hosta.

## Rozgrywka

- Ruch: WASD, strzałki lub joystick na ekranie dotykowym. Broń atakuje automatycznie. Podczas wyboru ulepszenia po awansie można nadal się poruszać, a walka trwa. Escape albo przycisk pauzy otwiera menu; solo zatrzymuje czas, multiplayer nadal działa.
- Kampania obejmuje Szmaragdową Polanę, Kryształowy Lodowiec i Żarzącą Otchłań. Każda mapa ma inny układ przeszkód, kolory i trzech własnych przeciwników.
- Poziom 30 odblokowuje Lodowiec, a 60 Otchłań. Portal znajduje się w centrum mapy. Podejdź do niego i naciśnij E lub przycisk portalu. Przejście zachowuje poziom, życie, broń i przedmioty. W Otchłani portal prowadzi z powrotem na Polanę. Start, odrodzenie i wejście przez portal umieszczają postać przy bezpiecznym boku mapy.
- Na każdej mapie są trzy wyraźnie widoczne strefy: obrzeża, głębia i centrum. Rozmiar map pozostał bez zmian; granice leżą w odległości około 1867 i 933 od środka. Siła i nagrody odpowiadają dawnym strefom 1, 3 i 5: referencyjny zwykły przeciwnik pierwszego świata na średniej trudności ma kolejno 45 / 525 / 2400 HP, 12 / 126 / 560 obrażeń oraz daje 15 / 182 / 840 XP. Pozostałe typy i światy korzystają z tej samej krzywej. Przeciwnik nie leczy się po przekroczeniu granicy. Moby głębi i centrum spacerują we własnych strefach do pierwszego wejścia danego gracza; potem mogą ścigać go także na obrzeżach. Agresja jest osobna dla każdego gracza i świata, a śmierć lub odrodzenie ją resetuje.
- Przywrócono oryginalne tempo awansów: `floor(100 × 1,18^(poziom − 1))`. Obrzeża przestają dawać postęp od poziomu 10, więc dalsze awanse wymagają wejścia w trudniejsze strefy. Bazowe parametry klas, broni i przyrost HP gracza pozostają zgodne z wcześniejszą wersją.
- Zwycięstwo kampanii wymaga przetrwania co najmniej 8 minut w Otchłani i pokonania trzech tamtejszych bossów. Bossowie każdej mapy pojawiają się około 1:30, 4:00 i 7:00; ataki są zapowiadane, a HP zależy od wyposażenia uczestników walki.
- Pierwszy awans zawsze oferuje dodatkową broń. Kilka awansów tworzy kolejkę wyborów: zdobycie następnego poziomu zachowuje otwarte karty i wcześniej wybrane premie. Otwieranie skrzynki zatrzymuje czas w solo: animacja wieka i nagrody poprzedza wybór przedmiotu. W multiplayerze animacja nie zatrzymuje serwera.
- Skrzynki pojawiają się w pobliżu gracza i wypadają z bossów. Osiem przedmiotów ma maksymalnie pięć kumulujących się stosów. Zwykła skrzynka daje jeden stos, skrzynka bossa dwa. Itemy mają pięć rzadkości: zwykłą, niepospolitą, rzadką, epicką i legendarną, z siłą premii ×1 / ×1,15 / ×1,35 / ×1,6 / ×2. Każdy stos zachowuje własną jakość; limit pięciu jest wspólny. Skrzynie bossów i szczęście zwiększają szansę na lepszą jakość, a kolory i opisy pokazują rzadkość oraz sumę premii.
- Najedź na ikonę broni, księgi albo przedmiotu, aby sprawdzić działanie i aktualne wartości. Na telefonie dotknij ikony; dotknięcie poza opisem go zamyka. Opisy uwzględniają ulepszenia, poziom księgi i liczbę stosów. Po skrzyni pojawia się podsumowanie zdobytej premii i łącznego efektu przedmiotu.
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
npm run test:levelup
npm run test:menu
npm run test:equipment
npm run test:progression
```

Testy sieciowe wymagają możliwości łączenia się z lokalnym serwerem. Wyniki pomiarów zapisują się w `output/test-results/`, a zrzuty i raport przeglądarki w `output/playwright/`. Parametry dłuższych testów: `QA_WORLD_SOAK_SECONDS`, `QA_WORLD_CLIENTS`, `QA_NETWORK_SECONDS`, `QA_CLASSES`, `QA_SEEDS`. `QA_WAIT_BOSSES=1` wydłuża test kampanii o wszystkie dziewięć starć z bossami. `test:solo` sprawdza pojedynczą mapę, a `test:campaign` pełne trzy światy.

Przywrócenie balansu: [BALANCE_RESTORE_REPORT.md](BALANCE_RESTORE_REPORT.md). Poprzednie poprawki interfejsu: [GAMEPLAY_FIXES_REPORT.md](GAMEPLAY_FIXES_REPORT.md). Wcześniejsze testy trzech światów: [WORLD_TEST_REPORT.md](WORLD_TEST_REPORT.md). Niezależny review telefonu i architektury: [REVIEW_WORLD_MOBILE.md](REVIEW_WORLD_MOBILE.md). Pierwszy etap gry opisuje [TEST_REPORT.md](TEST_REPORT.md).
