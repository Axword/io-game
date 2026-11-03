# Review światów i obsługi telefonu — 3 listopada 2026

**Werdykt: APPROVE. Status architektury: CLEAR.** Nie pozostały otwarte problemy blokujące w sprawdzonym zakresie.

Dodatkowa kontrola integracji zamknęła błąd wielokrotnego dołączania: jedno połączenie nie pozostaje już aktywne w poprzednim pokoju i nie dostaje dwóch konkurujących strumieni świata. Test `tests/equipment-cache.test.mjs` sprawdza zmianę pokoju bez wcześniejszego opuszczenia oraz ponowienie dołączenia do tego samego pokoju. Klient blokuje również podwójne rozpoczęcie gry podczas oczekiwania na serwer.

Sprawdzono niezależnie granice klient–serwer, przejścia między światami, aktualizacje obiektów, cykl życia sterowania i układ ekranów. Główne pliki: `js/core/Game.js`, `js/main.js`, `js/core/InputManager.js`, `js/ui/TouchControls.js`, `js/ui/RoomMenuScreen.js`, `js/ui/HUD.js`, `js/core/Renderer.js`, `js/core/WorldMap.js`, `css/styles2.css`, `server/gameRoom.js`, `server/entities/player.js`, `server/entities/monster.js`, `shared/config/worlds.js` oraz `shared/systems/worldRules.js` i `enemyBehavior.js`.

## Znalezione i zamknięte problemy

| Priorytet | Problem | Poprawka i potwierdzenie |
| --- | --- | --- |
| Wysoki | Naciśnięcie menu drugim palcem podczas trzymania joysticka nie zawsze wywoływało `click`. | Przyciski reagują na `pointerdown`; powtórny `click` jest pomijany. Test dwóch rzeczywistych punktów dotyku CDP przeszedł. |
| Wysoki | Klawisze ruchu lub portalu mogły działać pod otwartym menu multiplayera. | Stan `controlsBlocked` blokuje ruch i E, a Escape nadal zamyka menu. Otwarcie panelu, utrata fokusu, anulowanie dotyku i obrót zwalniają wejście. |
| Średni | Stały zasięg kamery powodował bardzo małe postacie na telefonie poziomo. | Dla wysokości do 500 px kamera używa bliższego widoku. Ponowny test poziomego telefonu przeszedł; sylwetki są czytelniejsze. |
| Wysoki | W drugim świecie zablokowany portal do trzeciego mógł po E przenosić z powrotem do pierwszego. | Domyślny cel na serwerze odpowiada kolejności klienta; niespełniony próg poziomu odrzuca przejście. Dodano regresję serwera. |
| Średni | Opuszczone światy przechowywały tłumy i pociski, mimo przeniesienia budżetu przeciwników do aktywnych map. | Nieaktywne areny zwalniają obiekty tymczasowe i referencje celów; ograniczony postęp bossów i skrzynek pozostaje. Dodano test pamięci pustej areny. |
| Średni | Każda część przeszkody wymagała osobnego rysowania. | Teren korzysta z czterech grup `InstancedMesh` zamiast 40–48 oddzielnych części. Potwierdzono wygląd w przeglądarce oraz sprzątanie przy przebudowie map. |

## Testy telefonu i iPada

| Silnik | Rozmiar | Zakres | Wynik |
| --- | --- | --- | --- |
| Chromium | 320×568 | Mały telefon, trzy światy i pełny ekwipunek | PASS |
| Chromium | 390×844 | Telefon pionowo | PASS |
| Chromium | 844×390 | Telefon poziomo, bliższa kamera | PASS |
| Chromium | 768×1024 | iPad pionowo | PASS |
| Chromium | 1024×768 | iPad poziomo | PASS |
| WebKit 27.2 | 390×844 | Zgodność silnika Safari: uruchomienie, dotyk menu i skrzynek | PASS |
| WebKit 27.2 | 768×1024 | Zgodność silnika Safari na rozmiarze iPada | PASS |

W pięciu przypadkach Chromium użyto natywnych zdarzeń dotyku przeglądarki: ruch joystickiem, jednoczesne użycie drugiego palca, zatrzymanie ruchu po puszczeniu i obrocie, pauza solo, przejścia 0→1→2 oraz wybór nagrody. Sprawdzono minimalne cele dotykowe 44 px i brak nakładania sterowania, pięciu ksiąg oraz ośmiu przedmiotów. Stan odblokowania portali i pełny ekwipunek były przygotowane na potrzeby kontroli interakcji; nie stanowi to dowodu balansu kampanii.

Osiem testów `tests/input-mobile.test.mjs` przeszło: osiem kierunków i martwa strefa, łączenie klawiatury z dotykiem, ignorowanie pól tekstowych, pojedyncze użycie portalu, natychmiastowe wysłanie zatrzymania, anulowanie timerów, blokada wejścia pod menu i zachowanie klawiaturowego Space dla przycisków. Kontrola składni i białych znaków również przeszła.

Wyniki oraz zrzuty: `output/playwright/mobile-report.json` i `output/playwright/*-world3-full-inventory.png`. Nie wystąpiły błędy JavaScript ani brakujące zasoby.

Końcowe `tests/browser-qa.mjs` również przeszło po zamrożeniu zmian: pełna kampania w przeglądarce trwała 1203,5 s symulacji, odwiedziła światy 0→1→2 i zakończyła się zwycięstwem po trzech bossach ostatniego świata. Sprawdzono restart oraz 34,75 s gry dwóch rzeczywistych klientów: widoczny ruch drugiego gracza, wybieranie ulepszeń i zachowanie wyposażenia. Oba okna pozostały grywalne, bez błędów. Raport: `output/playwright/report.json`.

**Granica sprawdzenia:** rozmiary ekranów i dotyk były emulowane. WebKit na komputerze nie jest fizycznym iPhonem ani iPadem. Nie zmierzono FPS, temperatury, zużycia baterii ani opóźnień sieci komórkowej na rzeczywistym sprzęcie; wynik nie jest gwarancją stałych 60 FPS na każdym urządzeniu.
