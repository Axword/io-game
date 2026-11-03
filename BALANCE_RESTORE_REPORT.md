# Przywrócenie oryginalnego balansu

Punktem odniesienia jest rewizja `f904605`, sprzed przebudowy gry. Przywrócono jej mnożniki trudności, elity i wykładniczą krzywą XP. Na życzenie gracza mapa ma teraz trzy większe strefy o sile dawnych stref 1, 3 i 5, przy niezmienionym rozmiarze mapy. Wycofano słabe mnożniki centrum oraz wzrost statystyk przeciwnika zależny od zegara zamiast miejsca. Zachowano nowe światy, animacje, przedmioty, sterowanie i ograniczenia liczby obiektów.

## Wartości referencyjne

Zwykły przeciwnik pierwszego świata, średnia trudność:

| Strefa od brzegu | HP | Obrażenia kontaktowe – parametr przeciwnika | XP |
| --- | ---: | ---: | ---: |
| 1 | 45 | 12 | 15 |
| 2 | 525 | 126 | 182 |
| 3 | 2400 | 560 | 840 |

Rozmiar, szybkość i mnożniki elit również odpowiadają oryginałowi. Dziewięć nowych archetypów zachowuje swoje cechy względem tej wspólnej bazy. Statystyki pozostają przypisane przy pojawieniu; przejście granicy nie przywraca życia. Przeciwnik kończy pościg po trzech sekundach pobytu celu poza jego strefą, co zapobiega przeciąganiu słabych tłumów do centrum.

Trzy wypełnione kolorem strefy i dwie granice są widoczne na wszystkich mapach. HUD, minimapa i walka korzystają z tych samych promieni: 2800 × 2/3 i 2800 × 1/3, czyli około 1867 i 933. Granice mapy nadal znajdują się w ±2800; mapa nie została powiększona. Podłoże i granice są połączone w jeden dodatkowy rysunek.

XP znów wymaga `floor(100 × 1,18^(poziom − 1))`; przykłady: 100 na poziomie 1, 443 na 10, 12150 na 30. Obrzeża nie umożliwiają dalszego farmienia awansów od poziomu 10. Nie zmniejszano bazowej siły lasera ani przyrostu HP gracza — przywrócono przeciwników i postęp, względem których te wartości wcześniej działały.

## Sprawdzenie regresji

Pełny zestaw regresji: **99/99 PASS**, bez pominięć.

- Dziewięć niezależnych testów porównuje normalne i elitarne wartości trzech wybranych stref oraz czterech trudności z tabelą i inicjalizatorem oryginalnej wersji, włącznie z zaokrągleniami.
- Test kontaktu używa rzeczywistych graczy poziomu 30 i produkcyjnych kolizji przy 20, 30, 60 i 120 aktualizacjach/s. Jeden zwykły mob obrzeży zadaje 30 HP/s, pięć zadaje 330 HP/s; grupa centrum zabija nieruchomą postać. Solo i serwer mają te same wyniki.
- Produkcyjny laser zachowuje wcześniejsze obrażenia, ale pojedyncze trafienie ani cała nieulepszona wiązka nie zabijają referencyjnego moba centrum. Wyniki klienta i serwera są zgodne przy tych samych częstotliwościach aktualizacji.
- Sześć przypadków przeglądarkowych sprawdza wszystkie trzy mapy i granice na telefonie. Zrzuty: `output/playwright/zones-world-*-overview.png` i `zones-world-*-phone-boundary.png`.
- Obciążenie 12 graczy rozdzielonych po czterech między trzy światy: 300 s symulacji, mediana kroku 4,23 ms, p95 6,43 ms, maksimum 24,63 ms. Świeża próba rzeczywistych połączeń trwała 30 s: około 14,97 aktualizacji/s na każdego klienta, bez błędów protokołu. Największa przerwa między aktualizacjami wyniosła 125,30 ms. Scenariusz obejmował częste śmierci i odrodzenia przy wejściu w mocne strefy.

Stare raporty o 20 wygranych kampaniach dotyczą wycofanego, zbyt łatwego balansu. Nie wykorzystano ich jako kryterium zaliczenia tej poprawki. Obecna kontrola obejmuje także utratę HP i śmierć przy złej grze oraz zgodność z oryginalnymi zasadami.

Dodatkowe naturalne próby kontrolera używały wyłącznie ruchu, faktycznie oferowanych ulepszeń i portali. Nie wszystkie zostały ukończone: kontroler ginął, w tym po przejściu do drugiego świata. Pełne zwycięstwo kampanii na przywróconym balansie nie jest w tym raporcie potwierdzone. Progi nowych światów 30/60 pozostawiono; wraz ze starą krzywą XP oznaczają one dłuższą progresję niż w wycofanej łatwej wersji. Wyniki obserwacyjne: `output/test-results/restored-balance-runs.json`.

Powtórzenie: `npm test`, `npm run test:balance`, `npm run test:zones`, `QA_WORLD_CLIENTS=12 npm run test:world-load`. Rozmiary telefonu były emulowane, a pomiary serwera są lokalne.
