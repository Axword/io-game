# Wyniki sprawdzenia — 3 listopada 2026

Zmiany sprawdzono lokalnie. Działający publiczny serwer wymaga wdrożenia tej wersji; testy nie mierzą opóźnień jego hostingu ani publicznego Internetu.

## Zmiany

- Trzy spotkania z bossami, zapowiedzi ataków, ruch szarży rozłożony w czasie i bezpieczna faza pojawiania się. Opóźnienia korzystają z czasu symulacji, więc zatrzymanie i restart nie tworzą spóźnionych ataków.
- Skrzynki, osiem kumulujących się przedmiotów, rzadkie nagrody bossów i dziesięć receptur ewolucji broni.
- Spójny zestaw 42 ikon SVG, fioletowi przeciwnicy, złote obwódki elit, zielone paski życia, żółte rdzenie ognistych pocisków, kanciaste smugi i cyjanowe pociski.
- Poprawiony format wiadomości ruchu i ulepszeń. Klient stosuje prędkość wyliczoną przez serwer; trzymany klawisz działa między pakietami i jest zwalniany po utracie aktualizacji.
- Przestrzenny podział przeciwników i kolizji, limity aktywnych obiektów, współdzielona geometria, sprzątanie efektów i rzadsze przebudowy HUD.
- Metadane obiektów i wyposażenie są przesyłane przy pojawieniu lub zmianie; kolejne aktualizacje przesyłają stan ruchu. Wolny odbiorca nie gromadzi kolejki starych zrzutów świata.
- Poprawione domyślne tempo broni, mnożniki ulepszeń, ponowne naliczanie premii ksiąg, zbieranie XP przez wielu graczy, odradzanie i pamięć ekwipunku po zmianie pokoju.

## Testy

| Sprawdzenie | Wynik |
| --- | --- |
| Testy regresji | 31/31 przeszło, w tym prawdziwe połączenie WebSocket |
| Pełne solo | 20/20 zwycięstw: 10 klas × losowania 11 i 47, średnia trudność |
| Warunki solo | Każdy przebieg trwał 480 s, pokonał 3 bossów i otworzył 4–13 skrzynek |
| Sterowanie w testach solo | Ruch, wybór oferowanych ulepszeń i przedmiotów; bez zmiany HP, obrażeń lub pozycji przeciwników |
| Przeglądarka | Start, normalne klawisze i kliknięcia, skrzynki, ekwipunek, bossowie, pełne zwycięstwo, restart i stare wejście |
| Układ | 1440×900 oraz telefon 390×844; menu klas i skrzynki bez poziomego obcinania |
| Multiplayer w przeglądarkach | Dwa rzeczywiste klienty; ruch widoczny u drugiego gracza i zachowanie wyposażenia przy skróconych aktualizacjach |
| Obciążenie serwera | 8 klientów, 300 s symulacji oraz 30 s rzeczywistych połączeń |

## Pomiary

- Serwer przy ośmiu klientach: mediana aktualizacji **1,16 ms**, 95. percentyl **2,19 ms**, maksimum **21,92 ms** przy budżecie 50 ms.
- Każde z ośmiu rzeczywistych połączeń utrzymało **15 aktualizacji świata/s** bez błędów protokołu.
- Skrócenie aktualizacji obiektów zmniejszyło sumę danych w tym samym pięciominutowym scenariuszu z 262,25 MB do 163,85 MB, czyli o **37,5%**. Średnio 66,67 KiB/s na klienta. To pomiar treści wiadomości, bez narzutu sieciowego.
- W końcowym pełnym przebiegu przeglądarki liczba geometrii GPU osiągnęła 108 i po restarcie spadła do 46; tekstury 1 → 0. Pozostają współdzielone bufory o ograniczonej liczbie.
- Maksymalne obciążenie pięciominutowej symulacji: 225 potworów, 257 pocisków, 177 kul XP i 2 jednoczesnych bossów.

Pomiary czasu zależą od komputera i środowiska przeglądarki. Test kontrolera solo potwierdza możliwość ukończenia ustalonych scenariuszy; trudniejsze poziomy i wszystkie możliwe kombinacje losowań nie zostały wyczerpująco sprawdzone.

Pełne dane: `output/test-results/solo-runs.json`, `output/test-results/multiplayer-load.json`, `output/playwright/report.json`. Zrzuty walki: `output/playwright/boss-combat.png` i `output/playwright/multiplayer-desktop.png`.

Zainstalowano umiejętności `playwright` i `playwright-interactive`; będą dostępne także w kolejnych turach. Do tego sprawdzenia użyto testów Node.js i Playwright bez zmiany ustawień aplikacji.
