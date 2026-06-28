# Zmiany po stronie klienta (zaimplementowane)

Poniżej znajduje się lista plików, które zostały zmodyfikowane/utworzone w workspace. Możesz je wkleić do swojego projektu klienta.

## Pliki utworzone / zmodyfikowane

1. **`js/network/WebSocketClient.js`** — pełna obsługa eventów serwerowych:
   - `gameState`, `playerKilled`, `playerDead`, `levelUp`, `upgradeOptions`, `matchEnded`, `roomJoined`, `pong`, `playerReconnected`
   - `joinRoom({ name, playerClass, roomId, difficulty, bots })`
   - `sendInput(inputData)` i `sendUpgradeSelect(upgradeKey)`
   - callbacki `onGameState`, `onPlayerDead`, itd.

2. **`js/core/InputManager.js`** — nowa minimalna wersja:
   - śledzi `keys`, `mouseX`, `mouseY`, `mouseClicked`
   - wysyła inputy na serwer co 40 ms (25 TPS)
   - `setWebSocketClient(wsClient)`
   - `worldToScreen` dla pozycji myszy

3. **`js/core/Game.js`** — hybrydowy online/offline:
   - `start()` wybiera tryb online/offline
   - `handleServerState()` synchronizuje encje z serwera do sceny
   - `updateOnline(dt)` — tylko render + input (bez lokalnej logiki)
   - `updateOffline(dt)` — zachowuje Twoją istniejącą logikę lokalną
   - `applyUpgrade()` w trybie online wysyła wybór do serwera, offline aplikuje lokalnie
   - `onPlayerDeath()` używa danych z serwera w trybie online

4. **`js/main.js`** — oczyszczona wersja z poprawnymi importami:
   - importy zmienione na `../shared/config/...`
   - `onUpgradeSelect()` obsługuje online (czeka na serwer) i offline

5. **`js/entities/Boss.js`** — nowy plik renderujący bossów (brakowało go w przesłanym kodzie).

## Importy do aktualizacji w istniejących plikach

We wszystkich pozostałych plikach klienta zmień ścieżki konfiguracji:

```js
// STARE
import { ... } from '../config/...';
import { ... } from './config/...';
import { ... } from '../../config/...';

// NOWE
import { ... } from '../shared/config/...';
import { ... } from '../shared/config/...';   // lub ../../shared/config/... dla głębszych ścieżek
```

Szczególnie dotyczy to plików:
- `js/entities/Player.js`
- `js/entities/Bot.js`
- `js/entities/Monster.js`
- `js/entities/Bullet.js`
- `js/entities/XpOrb.js`
- `js/entities/BotAI.js`
- `js/systems/WeaponSystem.js`
- `js/systems/CollisionSystem.js`
- `js/systems/SpawnSystem.js`
- `js/systems/UpgradeSystem.js`
- `js/ui/Scoreboard.js`
- `js/core/Room.js`
- `js/core/RoomManager.js`

## Jak przetestować

1. Wklej nowe pliki do swojego projektu.
2. Zaktualizuj importy we wszystkich plikach klienta na `shared/config`.
3. Upewnij się, że masz wszystkie oryginalne pliki UI (`HUD.js`, `MenuScreen.js`, `LobbyScreen.js`, `UpgradeScreen.js`, `DeathScreen.js`, `RoomMenuScreen.js`, `Scoreboard.js`) oraz `utils/storage.js`, `utils/geometry.js`, `core/Renderer.js`.
4. Uruchom serwer: `cd server && npm start`.
5. Otwórz klienta w przeglądarce. Jeśli połączenie WebSocket zadziała, gra przejdzie w tryb online.
6. Jeśli serwer jest niedostępny, klient automatycznie przełączy się na offline (zachowując lokalną logikę).

## Ograniczenia / do zrobienia

- **Respawn online** — obecnie serwer wysyła `playerDead`, ale nie obsługuje respawnu. Do zaimplementowania w kolejnym kroku.
- **Efekty wizualne** online — wybuchy, błyskawice, trucizna renderują się uproszczenie (pozycje pochodzą z serwera, ale bez efektów cząsteczkowych).
- **Spatial grid** — na serwerze obecnie używana jest naiwna kolizja. Przy 1500 potworach na pokój wymagana będzie optymalizacja (następny krok).
