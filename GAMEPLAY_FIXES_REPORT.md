# Sterowanie, skrzynie i droga do centrum — 3 listopada 2026

Raport historyczny: podane tu wyniki kampanii i słabe mnożniki centrum dotyczą poprzedniej wersji balansu, która została wycofana po zgłoszeniu gracza. Aktualne zasady i sprawdzenie zgodności z oryginałem: [BALANCE_RESTORE_REPORT.md](BALANCE_RESTORE_REPORT.md). Wcześniejsze zaliczenie kampanii nie jest dowodem właściwego poziomu trudności.

## Zmiany

- „Graj solo” jest po lewej, a „Stwórz Pokój” po prawej, także na małym telefonie.
- Nazwa produktu i tytuł karty to Vamps.io. Z menu startowego i wyboru klasy usunięto wiersz podsumowujący permanentne bonusy. Rozmyta scena walki w tle działa maksymalnie w 30 klatkach/s, z ograniczoną liczbą obiektów; zatrzymuje się podczas gry i po ukryciu karty. Ustawienie ograniczenia ruchu pozostawia statyczne tło.
- Awans pozostawia ruch, automatyczny atak i czas świata aktywne. Wciśnięty klawisz albo joystick nie jest zerowany przy pokazaniu ani wybraniu ulepszenia. Pauza solo nadal zatrzymuje grę.
- Skrzynia otwiera wieko, emituje promienie i pokazuje unoszący się klejnot przez 0,82 s przed wyborem nagrody. Multiplayer odtwarza potwierdzony efekt bez zatrzymywania świata, również gdy aktualizacja usuwająca skrzynię dotrze wcześniej niż zdarzenie nagrody. Reset zwalnia wszystkie obiekty animacji.
- Każdy świat zaczyna się na bezpiecznym boku: przy uruchomieniu, odrodzeniu i po przejściu przez portal. Portal pozostaje w centrum. Przejście zachowuje wyposażenie i aktualne oferty awansu.
- Trudność rośnie płynnie od obrzeży do centrum na wszystkich trzech mapach. W centrum przeciwnicy mają 1,75× HP, 1,5× obrażeń i 1,1× szybkości oraz dają 2,6× XP. Dotyczy to także bossów. Wzmocnienie zostaje przypisane przy pojawieniu, więc przekraczanie stref nie leczy przeciwnika i nie zmienia nagrody.

## Weryfikacja

- **83/83 testów regresji** przeszło, bez pominięć. Sprawdzono składnię 76 plików JavaScript i białe znaki zmian.
- **20/20 pełnych kampanii**: dziesięć klas, dwa losowania. Każda odwiedziła trzy światy i pokonała wszystkie dziewięć typów zwykłych przeciwników. Czas ukończenia: 838,93–1042,07 s. Poziom 30: 173,80–289,97 s; poziom 60: 357,13–551,37 s. Końcowe poziomy: 100–127.
- W tych kampaniach pokonano 113 bossów. Walki trwały 6,4–92,6 s i zawierały 1–21 zapowiedzi ataku. Kontroler używał normalnego ruchu, prawdziwych ofert i portali. Poprawiono jego przewidywanie ruchu pod granicą mapy, aby zbierał osiągalne XP; statystyk gry nie zmieniano dla zaliczenia testów.
- Szczyty kampanii: 89 zwykłych przeciwników, 155 pocisków, 200 kul XP i 743 obiekty głównej sceny.
- **12 graczy / trzy światy / 300 s symulacji**: mediana kroku 2,18 ms, p95 4,03 ms, maksimum 13,70 ms. Dziewięć odrodzeń przebiegło poprawnie. Osobne 30 s rzeczywistych połączeń: po 450 aktualizacji na klienta, czyli 15/s, bez błędów protokołu; największa przerwa między aktualizacjami 126,64 ms.
- Test wyboru ulepszenia podczas ruchu przeszedł na sześciu rozmiarach: komputer, telefon 320×568, telefon pionowo i poziomo oraz iPad pionowo i poziomo. Dotyk obejmował trzymanie joysticka i wybór drugim palcem. Dwóch klientów przeglądarkowych potwierdziło ruch po stronie serwera podczas rzeczywistego awansu oraz wybór oferowanej karty. Animacja skrzyni była widoczna przed panelem nagrody. Brak błędów JavaScript.
- Pełna kampania w prawdziwej przeglądarce zakończyła się zwycięstwem po 979,57 s symulacji, na poziomie 111, po trzech bossach finałowego świata. Restart oraz osobne 34,14 s gry dwóch klientów przeszły bez błędów JavaScript i brakujących zasobów.
- Pełna matryca mobilna przeszła **7/7 przypadków**: pięć rozmiarów Chromium oraz WebKit na rozmiarze telefonu i iPada. Osobne **8/8 przypadków menu** potwierdziło nazwę, brak wiersza bonusów, zmieniające się tło, jego zatrzymanie podczas gry i powrót po otwarciu lobby. Tryb ograniczonego ruchu daje statyczne tło. Nie wystąpiły błędy JavaScript ani brakujące zasoby.

## Powtórzenie

`npm test`, `npm run test:campaign`, `npm run test:levelup`, `npm run test:menu`, `npm run test:mobile`, `npm run test:browser` oraz `npm run test:world-load` (`QA_WORLD_CLIENTS=12`). Wyniki szczegółowe zapisują się w ignorowanych folderach `output/test-results/` i `output/playwright/`.

Rozmiary ekranów i dotyk są emulowane. Wyniki nie są pomiarem FPS na fizycznym telefonie lub iPadzie ani gwarancją braku opóźnień w dowolnej sieci. Poprzedni etap i jego pomiary opisuje [WORLD_TEST_REPORT.md](WORLD_TEST_REPORT.md).
