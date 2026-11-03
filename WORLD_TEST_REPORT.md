# Trzy światy, balans i urządzenia dotykowe — 3 listopada 2026

Dodano trzy mapy z przeszkodami, dziewięć typów przeciwników i portale w centrum. Poziomy 30 i 60 otwierają kolejne światy. Przejście zachowuje postać i wyposażenie. Walkę, pociski, XP oraz skrzynki rozdziela autorytatywny serwer.

## Balans kampanii

- **20/20 pełnych kampanii** przeszło: 10 klas, losowania 11 i 47. Każda przeszła przez wszystkie trzy światy i pokonała wszystkie dziewięć typów zwykłych przeciwników.
- Czas ukończenia wyniósł 1045,87–1286,70 s, końcowy poziom 89–103.
- Poziom 30: 275,90–394,27 s. Poziom 60: 552,13–792,53 s od rozpoczęcia gry.
- Trzy dodatkowe kampanie wojownika, łucznika i nekromanty celowo pozostały na każdej mapie do pokonania wszystkich bossów. **27/27 starć** przeszło; walki trwały 8,17–24,57 s i zawierały po 2–6 zapowiedzi ataku.
- Kontroler zmieniał kierunek ruchu, wybierał rzeczywiście oferowane ulepszenia i używał portalu dopiero po dotarciu do centrum. Nie zmieniał życia, obrażeń, wyposażenia, pozycji ani zegara symulacji. Przyspieszenie wynikało z wykonywania kolejnych normalnych kroków symulacji.

Naprawiono przypadek, w którym boss ginął przed pierwszym atakiem. HP uwzględnia zestaw broni i pobliskich uczestników; odległy gracz nie podbija wytrzymałości bossa. Maksymalne tempo strzałów i zachowanie reszty czasu odnowienia są wspólne dla klienta i serwera. Test porównuje 20, 30, 60 i 120 aktualizacji na sekundę.

## Obciążenie i sprzątanie

W pełnych kampaniach szczyt wyniósł 74 potwory, 118 pocisków i 640 obiektów głównej sceny. Usuwanie pocisków daleko poza walką ograniczyło liczbę obiektów bez skracania użytecznego zasięgu celowania. Części przeszkód są rysowane w czterech grupach instancji zamiast 40–48 osobnych części.

Test obciążenia obejmuje po 300 s symulacji dla 8 oraz 12 graczy rozdzielonych między trzy światy. Osobne rzeczywiste połączenia WebSocket działają przez 30 s. Dla przygotowania obciążenia użyto serwerowego przyznawania XP i zwykłych ofert ulepszeń; jest to przygotowanie scenariusza wydajnościowego, oddzielne od testu balansu kampanii.

Po opuszczeniu świata zwalniane są tłumy, pociski i referencje celów. Przy podziale drużyny istniejący tłum jest zmniejszany do nowego udziału w budżecie pokoju. Skrócone aktualizacje zachowują typ, rozmiar i kolor przeciwnika oraz odtwarzają pełne dane po ponownym wejściu w widoczny obszar.

Aktualne liczby pomiarów znajdują się w `output/test-results/worlds-multiplayer-load.json` oraz `worlds-multiplayer-load-12.json`. Część sieciowa mierzy początkowe 30 s pokoju, przed pierwszym bossem; symulacja 300 s obejmuje już bossów i rozwinięte wyposażenie.

| Gracze / podział światów | Mediana kroku | 95. percentyl | Najdłuższy krok |
| --- | --- | --- | --- |
| 8 / 3+3+2 | 2,45 ms | 12,81 ms | 89,88 ms |
| 12 / 4+4+4 | 3,75 ms | 16,83 ms | 88,82 ms |

95. percentyl mieści się w budżecie 50 ms. W ciągłej symulacji obciążeniowej zdarzały się jednak pojedyncze skoki do około 90 ms; wynik nie oznacza braku każdego zacięcia. Wszystkie rzeczywiste połączenia w próbach 8 i 12 klientów utrzymały 15 aktualizacji świata/s bez błędów protokołu.

Naprawiono także podwójne strumienie po dołączeniu do nowego pokoju bez uprzedniego opuszczenia starego. Powtórne dołączenie do tego samego pokoju zachowuje bieżącą postać, a przejście do innego usuwa stary udział. Regresja używa jednego rzeczywistego połączenia WebSocket i potwierdza zanik aktualizacji poprzedniego pokoju.

## Telefon, iPad i review

**7/7 przypadków przeglądarkowych** przeszło: Chromium 320×568, 390×844, 844×390, 768×1024 i 1024×768, a także WebKit 27.2 na rozmiarze telefonu i iPada. Sprawdzono joystick, drugi palec na menu, zwolnienie sterowania przy obrocie, portal 0→1→2 i pełny ekwipunek. Nie wykryto błędów JavaScript ani brakujących zasobów.

Niezależny reviewer: **APPROVE / CLEAR**. Poprawiono problemy z klikaniem drugim palcem, ruchem pod menu, małymi postaciami w poziomie, różną interpretacją portalu przez klienta i serwer oraz zatrzymywaniem danych opuszczonych map. Szczegóły: [REVIEW_WORLD_MOBILE.md](REVIEW_WORLD_MOBILE.md).

Końcowy test przeglądarki ukończył kampanię w 1203,50 s: wszystkie trzy światy, poziom 93 i trzech bossów finału. Dwaj rzeczywiści gracze przeszli 34,75 s próby ruchu, ulepszeń i synchronizacji. Nie wystąpiły błędy JavaScript ani brakujące zasoby. Po restarcie znikają obiekty przebiegu; ograniczone wspólne bufory geometrii pozostają w pamięci, więc liczba geometrii GPU nie spada do zera.

To emulacja rozmiarów, dotyku i silnika przeglądarki. Nie wykonano pomiarów na fizycznym iPhonie lub iPadzie ani w sieci komórkowej. Publiczny hosting wymaga wdrożenia tej wersji. Odblokowania multiplayer są przechowywane w sesji gracza na działającym serwerze; solo zapisuje je w lokalnej przeglądarce.

## Dowody i powtórzenie testów

Końcowy wspólny zestaw: **69/69 testów regresji**, bez pominięć i błędów. Sprawdzono też składnię wszystkich 75 plików JavaScript klienta, serwera i wspólnych reguł. Kontrola białych znaków zmian przeszła.

- `npm test` — reguły, portale, izolacja światów, tempo strzałów, odrodzenie i pamięć aktualizacji.
- `npm run test:campaign` — dwadzieścia pełnych kampanii; `QA_WAIT_BOSSES=1` sprawdza długą ścieżkę ze wszystkimi bossami.
- `npm run test:world-load` — obciążenie trzech światów; `QA_WORLD_CLIENTS=12` wybiera większy pokój.
- `npm run test:browser` — kampania w przeglądarce, restart i dwóch rzeczywistych klientów multiplayer.
- `npm run test:mobile` — matryca telefonu, iPada i WebKit.

Pełne wyniki balansu: `output/test-results/world-campaigns.json`, `world-boss-campaigns.json`. Raporty przeglądarek: `output/playwright/report.json`, `mobile-report.json`. Zrzuty obejmują każdy świat, zwycięstwo oraz pełny ekwipunek na telefonie i iPadzie.
