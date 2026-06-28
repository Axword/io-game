# Plan architektury serwera — migracja do modelu autorytatywnego

> Stan po dyskusji: konfiguracja wspólna klient/serwer, klient zachowuje tryb offline, boty można wyłączyć w konfiguracji pokoju, serwer tworzony od zera.  
> Ten dokument jest planem wykonawczym. Po akceptacji zostanie zaimplementowany kod w `server/` oraz wymagane zmiany po stronie klienta.

---

## 1. Cel i zasady

Serwer jest **jedynym źródłem prawdy** dla:

- pozycji, HP, obrażeń, XP, leveli,
- broni, cooldownów, upgrade'ów,
- stanu potworów, bossów, botów, pocisków, orbów XP,
- czasu gry i wyników meczu.

Klient wysyła **tylko input** (klawiatura, mysz) i renderuje stan dostarczany przez serwer.  
Żadne wyniki rozgrywki (kto zginął, kto zdobył XP, level-up) nie są obliczane po stronie klienta.

---

## 2. Stack technologiczny

- **Node.js 20+** (ES modules — `type: "module"` w `package.json`).
- **Express** — do serwowania plików statycznych (opcjonalnie) i health-checków.
- **ws** — natywny WebSocket server.
- **uuid** — identyfikatory graczy, pokoi, encji.
- **Brak**: THREE.js, Canvas, DOM, `requestAnimationFrame`, audio, cząsteczki na serwerze.

---

## 3. Struktura folderów (docelowa)

```
├── js/                          # klient (istnieje)
│   ├── config/                  # ← zostanie przeniesione do shared/
│   │   ├── books.js
│   │   ├── classes.js
│   │   ├── constants.js
│   │   ├── monsters.js
│   │   ├── upgrades.js
│   │   └── weapons.js
│   └── ...
│
├── shared/                      # NOWY: wspólna konfiguracja + utils
│   ├── config/
│   │   ├── books.js
│   │   ├── classes.js
│   │   ├── constants.js
│   │   ├── monsters.js
│   │   ├── upgrades.js
│   │   └── weapons.js
│   └── utils/
│       ├── math.js              # czyste funkcje (rng, norm, getZoneIdx)
│       └── geometry.js          # jeśli potrzebne helpery czysto-matematyczne
│
├── server/                      # NOWY: cała logika serwera
│   ├── package.json
│   ├── server.js                # Express + ws + routing eventów
│   ├── gameCache.js             # in-memory store pokoi
│   ├── gameLoop.js              # globalna pętla 20 TPS
│   ├── gameRoom.js              # klasa pokoju
│   ├── config.js                # server-only config + re-export shared
│   ├── entities/
│   │   ├── player.js
│   │   ├── bot.js
│   │   ├── monster.js
│   │   ├── boss.js
│   │   ├── bullet.js
│   │   └── xpOrb.js
│   └── systems/
│       ├── WeaponSystem.js
│       ├── CollisionSystem.js
│       ├── SpawnSystem.js
│       ├── UpgradeSystem.js
│       └── BotAI.js
```

### Uwaga dotycząca wspólnej konfiguracji

Pliki w `js/config/` zawierają **czyste dane** (brak DOM/Browser API). Najlepszym rozwiązaniem jest przeniesienie ich do `shared/config/` i zmiana importów w klientach na:

```js
import { WEAPONS } from '../../shared/config/weapons.js';
```

a w serwerze:

```js
import { WEAPONS } from '../shared/config/weapons.js';
```

Dzięki temu nie duplikujemy formuł i statystyk. Zmiana jest **wymagana po stronie klienta** — ale tylko w importach, nie w treści plików.

---

## 4. Model danych encji (bez renderingu)

Wszystkie encje serwerowe to zwykłe klasy/obiekty z polami czysto-numerycznymi. Usuwamy wszystko związane z `THREE.js`, `mesh`, `scene`, `material`, `outline`, `glow`, `hpBar`, `trail`, `particles`, `audio`.

### Przykład: `server/entities/player.js`

```js
export class ServerPlayer {
  constructor(id, name, cls, permStats, x = 0, y = 0) {
    this.id = id;               // uuid socket player
    this.name = name;
    this.cls = cls;
    this.x = x;
    this.y = y;
    this.hp = ...;
    this.maxHp = ...;
    this.level = 1;
    this.xp = 0;
    this.xpNeeded = 100;
    this.totalXp = 0;
    this.speed = ...;
    this.weapons = [...];       // plain data instances
    this.books = [...];         // plain data instances
    this.critChance = 0;
    this.critDamage = 200;
    this.damageBonus = 0;
    this.attackSpeedBonus = 0;
    this.moveSpeedBonus = 0;
    this.projectileSpeedBonus = 0;
    this.projectileSizeBonus = 0;
    this.rangeBonus = 0;
    this.areaBonus = 0;
    this.armor = 0;
    this.regen = 0;
    this.magnetRange = 100;
    this.cooldownReduction = 0;
    this.revives = 0;
    this.killedMonsters = 0;
    this.totalDmg = 0;
    this.invTimer = 0;
    this.damageAccumulator = 0;
    this.pendingUpgrades = 0;
    this.input = { keys: {}, mouseX: 0, mouseY: 0, mouseClicked: false };
    this.lastInputSeq = 0;
    this.ws = null;             // referencja do socketa (tylko do wysyłki)
    this.isBot = false;
  }
}
```

Podobnie `ServerMonster`, `ServerBullet`, `ServerXpOrb`, `ServerBoss`, `ServerBot` (dziedziczy po `ServerPlayer` lub ma własny zestaw pól).

---

## 5. In-memory cache pokoi (`server/gameCache.js`)

Interfejs wymagany w zadaniu:

```js
class GameCache {
  saveRoom(roomId, roomData) { this.rooms.set(roomId, roomData); }
  getRoom(roomId) { return this.rooms.get(roomId); }
  deleteRoom(roomId) { this.rooms.delete(roomId); }
  getAllRooms() { return Array.from(this.rooms.values()); }
  cleanupOldRooms(maxAgeMs) { /* usuwa puste pokoje bez graczy przez > maxAgeMs */ }
}
```

Dodatkowo pamiętamy indeks `socket -> roomId`, żeby szybko obsłużyć `disconnect` i `leaveRoom`.

---

## 6. Pokój (`server/gameRoom.js`)

Klasa `GameRoom` zawiera:

- `id`, `state` (`lobby` | `playing` | `ended`), `difficulty`, `config` (w tym `bots: boolean`), `gameTime`,
- `players: Map<playerId, ServerPlayer>`,
- `bots: Map<botId, ServerBot>`,
- `monsters: Map<monsterId, ServerMonster>`,
- `bosses: Map<bossId, ServerBoss>`,
- `bullets: Map<bulletId, ServerBullet>`,
- `xpOrbs: Map<orbId, ServerXpOrb>`,
- instancje systemów: `WeaponSystem`, `CollisionSystem`, `SpawnSystem`, `UpgradeSystem`,
- `spatialGrid` do optymalizacji kolizji,
- `broadcast(data)` — wysyła do wszystkich graczy w pokoju,
- `sendTo(playerId, data)` — wysyła tylko do jednego gracza.

### Identyfikacja encji

- Gracz: `uuidv4()` przypisane przy połączeniu.
- Potwór: `m_${uuidv4().slice(0,6)}` lub autoincrement z prefiksem.
- Pocisk: `b_${uuidv4().slice(0,6)}`.
- Orb: `x_${uuidv4().slice(0,6)}`.

---

## 7. Pętla gry (`server/gameLoop.js`)

Jeden globalny timer `setInterval` o okresie **50 ms** (20 TPS). W każdym ticku iterujemy po wszystkich pokojach w stanie `playing` i wykonujemy kroki:

1. **Queue inputs** — przypisz zgromadzone inputy graczy do ich obiektów.
2. **Player movement** — na podstawie `input.keys`, clamp do świata, zastosuj `MOVEMENT_MULTIPLIER`.
3. **Bot AI** — dla każdego bota wywołaj `BotAI.decide()` i przesuń bota.
4. **Spawn monsters** — `SpawnSystem.update()` z limitem 1500 potworów/pokój.
5. **Update monsters** — ruch, strzelanie, generowanie pocisków wrogich.
6. **Update bullets** — ruch, lifetimes, orbity, trajectories.
7. **Resolve collisions** — `CollisionSystem` ze spatial grid.
8. **Apply damage** — `damageAccumulator` / `hp` / `tryRevive()` / śmierci.
9. **Spawn XP orbs** — przy śmierci potworów/bossów/botów.
10. **Level-ups & upgrades** — `addXp()` generuje `pendingUpgrades`, serwer wysyła `upgradeOptions` do gracza.
11. **Save state** — `gameCache.saveRoom(roomId, this)` (minimal snapshot lub referencja, bez klonowania).
12. **Broadcast state** — `gameState` z minimalnym zestawem pól.

### Wydajność

- Unikamy `structuredClone` / `JSON.parse(JSON.stringify(...))` w pętli.
- Używamy **spatial grid** (komórka 200×200) do kolizji bullet↔monster i monster↔player.
- Reużywamy tablice pomocnicze (`_targetBuf`, `_nearbyBuf`) zamiast `[]` w każdym ticku.
- Kolizja PvP (bullet↔bot) jest sprawdzana tylko dla pokoi z włączonymi botami.

---

## 8. Systemy — co portujemy, co usuwamy

### 8.1 WeaponSystem (`server/systems/WeaponSystem.js`)

Portujemy:

- `getWeaponStat()`, `fireWeapon()`, `fireBow()`, `fireKnife()`, `fireLightning()`, `fireAxe()`, `fireFireball()`, `fireLaser()`, `firePoison()`, `fireMeteor()`, `fireSword()`, `updateAura()`.
- Usuwamy wszystkie `THREE.Vector3`, `THREE.BufferGeometry`, `THREE.LineBasicMaterial`, `scene.add`, `fxList`.
- `createLightningFX` → **nie tworzy grafiki**, ale zwraca dane do syncu (`fxEvents`), jeśli klient ma wyświetlać efekt. Jeśli efekt nie wpływa na logikę, można pominąć.
- Pociski tworzymy jako `new ServerBullet(...)` bez meshów.
- Aura zadaje obrażenia w `updateAura` wprost zamiast animować ring.

### 8.2 CollisionSystem (`server/systems/CollisionSystem.js`)

Portujemy wszystkie metody kolizji zgodnie z logiką klienta, ale bez SFX:

- `checkBulletCollisions`, `checkEnemyBullet`, `checkBulletVsMonsters`, `checkBulletVsBosses`, `checkLaserCollisions`, `checkPoisonCollisions`, `handleExplosion`, `handleBounce`, `calculateDamage`, `trackDamage`, `checkMonsterPlayerCollisions`, `checkMonsterBotCollisions`, `checkBossPlayerCollisions`, `checkBossBotCollisions`, `checkPlayerBotCollisions`, `checkBotBulletVsPlayer`, `checkPlayerBulletVsBots`.
- Usuwamy `createExplosionFX` (lub zamieniamy na zdarzenie do syncu).
- `handleBounce` spawnuje nowe `ServerBullet` zamiast `new b.constructor(...)`.

### 8.3 SpawnSystem (`server/systems/SpawnSystem.js`)

Portujemy:

- `update()`, `spawnMonster()`, `spawnBoss()`, `spawnXpOrbs`, limity stref, `difficultyConfig`.
- Usuwamy `THREE.CircleGeometry`, `THREE.Mesh`, `bossWarnings` (visual), `updateBossWarnings` (lub trzymamy dane, jeśli klient ma pokazywać marker).
- Potwory update'owane przez własny `update(dt, targets, bullets)` zamiast wątków.

### 8.4 UpgradeSystem (`server/systems/UpgradeSystem.js`)

Portujemy bez zmian w logice rzadkości/wartości.  
Dodajemy obsługę wyboru karty przez gracza:

- `generateUpgradeCards(player)` — serwer generuje karty.
- `applyUpgrade(card, player, weaponSystem)` — serwer aplikuje upgrade po otrzymaniu `upgradeSelect`.
- Boty wybierają upgrade automatycznie przez `BotAI.selectBestUpgrade()`.

### 8.5 BotAI (`server/systems/BotAI.js`)

Portujemy logikę decyzyjną z `js/entities/BotAI.js` bez zmian w algorytmach.  
Bot jest encją w `room.bots`, sterowaną przez `BotAI.decide()` w każdym ticku.

---

## 9. WebSocket — protokół komunikacji

### 9.1 Klient → Serwer

#### `input`

```json
{
  "type": "input",
  "playerId": "uuid-gracza",
  "data": {
    "keys": { "KeyW": true, "KeyA": true },
    "mouseX": 120.5,
    "mouseY": -340.0,
    "mouseClicked": false
  }
}
```

Serwer waliduje `playerId` po stronie socketa (nie ufa nagłówkowi).

#### `joinRoom`

```json
{
  "type": "joinRoom",
  "data": {
    "name": "Gracz",
    "class": "archer",
    "roomId": "ABC123",      // opcjonalnie — join by code
    "difficulty": "medium",  // opcjonalnie — tylko przy tworzeniu
    "bots": true             // opcjonalnie — default true
  }
}
```

Serwer:
- jeśli `roomId` podany i pokój istnieje → dołącz,
- jeśli nie podany → tworzy nowy pokój,
- zwraca `roomJoined` z `roomId`, `playerId`, `state`, `players`.

#### `leaveRoom`

```json
{ "type": "leaveRoom", "playerId": "uuid-gracza" }
```

#### `ping`

```json
{ "type": "ping", "t": 1234567890 }
```

Serwer odpowiada `pong` z tym samym `t`.

#### `upgradeSelect`

```json
{
  "type": "upgradeSelect",
  "playerId": "uuid-gracza",
  "data": { "upgradeKey": "bow_damage_0" }
}
```

Serwer aplikuje upgrade i wysyła `upgradeApplied` lub nowe `upgradeOptions`, jeśli zostały kolejne level-upy.

### 9.2 Serwer → Klient

#### `roomJoined`

```json
{
  "type": "roomJoined",
  "roomId": "ABC123",
  "playerId": "uuid-gracza",
  "state": "playing",
  "players": [
    { "id": "uuid", "name": "Gracz", "class": "archer", "x": 0, "y": 0, "level": 1, "hp": 92, "maxHp": 92 }
  ]
}
```

#### `gameState` (broadcast ~20 TPS)

```json
{
  "type": "gameState",
  "room": "ABC123",
  "t": 45.2,
  "data": {
    "gameTime": 45.2,
    "players": [ { "id", "name", "x", "y", "hp", "maxHp", "level", "class", "isDead" } ],
    "bots":    [ { "id", "name", "x", "y", "hp", "maxHp", "level", "class" } ],
    "monsters":[ { "id", "x", "y", "hp", "maxHp", "zoneIdx", "isElite", "isBoss" } ],
    "bullets": [ { "id", "x", "y", "vx", "vy", "wtype", "sz", "col" } ],
    "xpOrbs":  [ { "id", "x", "y", "val" } ],
    "bosses":  [ { "id", "x", "y", "hp", "maxHp", "type" } ]
  }
}
```

Tylko wymagane pola. Kolory `col` przesyłamy jako liczba 24-bitową, jeśli klient potrzebuje do renderowania.

#### `playerKilled`

```json
{
  "type": "playerKilled",
  "data": {
    "victimId": "uuid",
    "killerId": "uuid",
    "killerName": "BotAlpha",
    "xpReward": 120
  }
}
```

#### `playerDead`

```json
{
  "type": "playerDead",
  "playerId": "uuid",
  "data": { "level": 12, "kills": 45, "totalDmg": 12800 }
}
```

#### `levelUp`

```json
{
  "type": "levelUp",
  "playerId": "uuid",
  "data": { "level": 5, "pendingUpgrades": 1 }
}
```

#### `upgradeOptions`

```json
{
  "type": "upgradeOptions",
  "playerId": "uuid",
  "data": {
    "cards": [ { "type", "name", "icon", "desc", "value", "rarId", "val", "upgradeKey" } ]
  }
}
```

#### `matchEnded`

```json
{
  "type": "matchEnded",
  "room": "ABC123",
  "data": { "reason": "last_player", "ranking": [...] }
}
```

#### `pong`

```json
{ "type": "pong", "t": 1234567890, "serverTime": 45.2 }
```

---

## 10. Zmiany wymagane po stronie klienta

### 10.1 `js/network/WebSocketClient.js`

- Dodać handlery: `gameState`, `playerKilled`, `playerDead`, `levelUp`, `upgradeOptions`, `matchEnded`, `roomJoined`, `pong`.
- Zmienić `createOrJoinRoom` na `joinRoom({ name, class, roomId, difficulty, bots })`.
- Dodać metodę `sendUpgradeSelect(upgradeKey)`.
- Przy disconnect — automatyczny fallback do offline (lub reconnect).

### 10.2 `js/core/InputManager.js`

- Zamiast przesuwać lokalnie gracza, wysyła inputy przez WebSocketClient:
  - 20 razy na sekundę (lub przy każdej zmianie) wysyła pakiet `input`.
  - Nie oblicza pozycji gracza — to robi serwer.

### 10.3 `js/core/Game.js`

- Tryb **online**:
  - Wyłącza lokalną pętlę logiki (movement, kolizje, spawn, AI).
  - Odbiera `gameState` i aktualizuje istniejące encje/interpoluje pozycje.
  - Renderuje stan autorytatywny.
  - Przy `levelUp` pokazuje ekran upgrade po odebraniu `upgradeOptions`.
  - Przy `playerDead` pokazuje DeathScreen z danymi z serwera.
- Tryb **offline**:
  - Zachowuje obecną lokalną logikę (bez zmian w algorytmach).
  - Działa jak “lokalny serwer”.

### 10.4 `js/entities/Player.js`, `Monster.js`, `Bullet.js` itd.

- Dodaj metodę `syncFromServer(state)` aktualizującą tylko pola danych.
- Usuń z serwera — encje klienta pozostają do renderowania, ale nie obliczają wyników.

### 10.5 `js/config/*.js`

- Przenieść do `shared/config/`. Zmienić ścieżki importów w klientach.

---

## 11. Bezpieczeństwo / anti-cheat

- Serwer **nigdy** nie ufa pozycji / HP / levelowi z klienta.
- Inputy są ograniczane: maksymalna prędkość clampowana do `baseSpeed * (1 + bonus) * MOVEMENT_MULTIPLIER`.
- Cooldowny broni są liczone po stronie serwera.
- Weapon fire nie wykonuje się na podstawie kliknięcia myszy, ale na podstawie cooldownu i automatycznego targetowania (tak jak obecnie).
- Serwer pilnuje, żeby gracz nie wyszedł poza `WORLD`.
- Po disconnect gracz jest usuwany z pokoju; boty pozostają, jeśli pokój ma graczy.

---

## 12. Wydajność i skalowalność

- **20 TPS** = 50 ms tick. Każdy pokój jest aktualizowany co tick.
- **Broadcast** co tick (50 ms) — minimalne pole, bez klonowania.
- **Spatial grid** w każdym pokoju: komórka 200×200, świat 12000×12000 → 60×60 = 3600 komórek. Wystarczy do 1500 potworów + pocisków.
- **Pooling** tablic pomocniczych (`_nearby`, `_targets`, `_hits`) — brak `new Array` w pętli głównej.
- **Limity**:
  - 50 pokoi (konfigurowalne),
  - 16 graczy/pokój,
  - 1500 potworów/pokój,
  - boty liczone do limitu “targets” (nie graczy).
- Jeśli 50 pokoi × 1500 potworów okaże się zbyt duże dla jednego procesu, można w przyszłości uruchomić shardy pokoi. Architektura pozwala na to przez izolację stanu w `GameRoom`.

---

## 13. Deployment / uruchomienie

```bash
cd server
npm install
npm start
```

`server.js` nasłuchuje na `PORT=3000` (domyślnie).  
Express serwuje statyczne pliki z `../` (opcjonalnie), więc klient otwiera `http://localhost:3000`, a WebSocket łączy się z `ws://localhost:3000`.

---

## 14. Kolejność implementacji (po akceptacji planu)

1. Stworzenie `shared/config/` i przeniesienie konfiguracji klienta + poprawienie importów.
2. Szkielet `server/` (package.json, server.js, gameCache.js, gameLoop.js, config.js).
3. Encje serwerowe (`player.js`, `monster.js`, `bullet.js`, `xpOrb.js`, `boss.js`, `bot.js`).
4. Systemy serwerowe (`WeaponSystem`, `CollisionSystem`, `SpawnSystem`, `UpgradeSystem`, `BotAI`).
5. `GameRoom` — połączenie encji i systemów w jedną pętlę.
6. WebSocket event handlers (joinRoom, leaveRoom, input, upgradeSelect, ping).
7. Adaptacja `WebSocketClient.js`, `InputManager.js`, `Game.js` po stronie klienta.
8. Test integracyjny: klient online, 1 pokój, 1 gracz + boty, spawn potworów, level-up, śmierć.
9. Optymalizacja: spatial grid, minimalne broadcast, pooling.

---

## 15. Decyzje do potwierdzenia

Zanim zacznę kod, potwierdź proszę:

1. **Czy zgadzasz się na przeniesienie `js/config/` do `shared/config/`?** (wymaga drobnej zmiany importów w kliencie)
2. **Czy broadcast `gameState` co 50 ms (20 TPS) jest OK?** Można zrobić 25 TPS (40 ms) jeśli chcesz płynniejszy sync, ale kosztem CPU/bandwidth.
3. **Czy boty domyślnie włączone (`bots: true`) w nowym pokoju?**
4. **Czy kolory / rozmiary pocisków i potworów mają być wysyłane w `gameState`?** (potrzebne do renderowania, ale można ograniczyć do `wtype` + `isElite`)
5. **Czy chcesz, żebym zaimplementował reconnect po utracie połączenia?** (gracz wraca do tego samego pokoju przez 30 s po disconnect)

Po Twoich odpowiedziach zaczynam implementację serwera.
