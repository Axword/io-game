# PLAN: Serwer WebSocket + Cache Redis-like (JSON)

## 📋 ANALIZA ISTNIEJĄCEGO KODU
- Gra jest **pełnointegracyjna**: Player + Bots + Monsters + Physics + UI
- Główne encje: `Player`, `Bot`, `Monster`, `Boss`, `Bullet`, `XpOrb`
- Systemy: `WeaponSystem`, `UpgradeSystem`, `SpawnSystem`, `CollisionSystem`
- Stan gry: `Game` instance zawiera wszystko (scene, player, bots, monsters, bullets, etc)

---

## 🎯 CEL
Przenieść **logikę serwera** (game loop, spawn, physics, collision) na WebSocket server w Node.js, trzymając **cache game state w JSON** zamiast Pythona.

---

## 🚀 PLAN DZIAŁANIA (5 ETAPÓW)

### **ETAP 1: Przygotowanie struktury serwera**
*Framework: Express.js + ws (WebSocket) + Node.js*

```
Tworzeć:
1. server.js - główny endpoint WebSocket
2. gameCache.js - magazyn gier w JSON (bieżący state)
3. gameRoom.js - logika pokoju gry
4. gameLoop.js - pętla gry (update monsters, collision, spawn)
5. player.js - klasa gracza na serwerze
```

**Struktura cache (w JSON):**
```json
{
  "rooms": {
    "ABC123": {
      "id": "ABC123",
      "difficulty": "medium",
      "createdAt": 1234567890,
      "gameTime": 45.2,
      "state": "playing",
      "players": {
        "player1": {
          "id": "player1",
          "name": "GraczeX",
          "x": 100, "y": 200,
          "class": "warrior",
          "hp": 120, "maxHp": 145,
          "level": 5, "xp": 450, "xpNeeded": 500,
          "totalXp": 2500,
          "weapons": [...],
          "books": [...],
          "stats": {...}
        }
      },
      "bots": {
        "bot1": {
          "id": "bot1",
          "name": "ProGamer2024",
          "x": 300, "y": 150,
          "class": "archer",
          "hp": 85, "maxHp": 92,
          "level": 4,
          "ai_state": "hunt"
        }
      },
      "monsters": [...],
      "bullets": [...],
      "xpOrbs": [...]
    }
  }
}
```

---

### **ETAP 2: Port gry na serwer (Node.js)**
*Przepisać z JS istniejącego kodu:*

**Co PORT BEZPOŚREDNIO (logika bez THREE.js):**
- `Player` class → serverSide Player (bez mesh)
- `Monster` class → serverSide Monster (bez mesh)
- `WeaponSystem` → serverSide WeaponSystem (tylko logika)
- `CollisionSystem` → serverSide CollisionSystem
- `SpawnSystem` → serverSide SpawnSystem
- `UpgradeSystem` → serverSide UpgradeSystem

**Co OPUŚCIĆ (klient je renderuje):**
- THREE.js mesh creation
- Canvas rendering
- Audio

**Co TRZYMAĆ JAKO STAŁE (z istniejącego kodu):**
```
WEAPONS, CLASSES, ZONES, SPAWN_POINTS, WORLD, MONSTER_CONFIG
```

---

### **ETAP 3: WebSocket komunikacja (bidirectional)**

**Server → Client (wysyła co 50-100ms):**
```
{
  "type": "gameState",
  "room": "ABC123",
  "data": {
    "gameTime": 45.2,
    "player": {...},
    "bots": [...],
    "monsters": [...],
    "bullets": [...],
    "xpOrbs": [...]
  }
}
```

**Client → Server (wysyła input):**
```
{
  "type": "input",
  "playerId": "player1",
  "data": {
    "keys": {code: true/false},
    "mouseX": 150,
    "mouseY": 200,
    "mouseClicked": true
  }
}
```

**Server → Client (zdarzenia):**
```
{
  "type": "playerKilled",
  "killer": "bot1",
  "victim": "player1"
}

{
  "type": "upgradeOptions",
  "cards": [...]
}

{
  "type": "playerDead",
  "level": 10,
  "kills": 45,
  "totalDmg": 3500
}
```

---

### **ETAP 4: Cache persistence**

**Gdzie trzymać JSON:**
1. **Opcja A:** Memory (szybkie, ginie przy restarcie) → `gameCache.js`
2. **Opcja B:** Plik `/data/cache.json` (persystuje)
3. **Opcja C:** Redis-like module `npm install redis` (rekomendowane)

**Funkcje cache:**
```javascript
// gameCache.js
saveRoom(roomId, roomData)      // zapisz stan pokoju
getRoom(roomId)                  // pobierz stan pokoju
deleteRoom(roomId)               // usuń pokój (koniec gry)
getAllRooms()                    // debug
cleanupOldRooms(maxAge)          // czyszczenie starych pokojów
```

---

### **ETAP 5: Integracja z klientem**

**Modyfikuj istniejący kod (minimalnie):**

1. **WebSocketClient.js** - Już ma framework
   - Dodaj obsługę `gameState` event
   - Synchronizuj othersState zamiast lokalnych Botów

2. **Game.js** - Zmień tryb online
   - Pobieraj state z serwera zamiast lokalnego update()
   - Renderuj state z WebSocket data

3. **InputManager.js** - Wysyłaj input do serwera
   - Zamiast lokalnie modyfikować player.x/y
   - Wysyłaj keys + mouse do serwera

4. **Player.js na kliencie** - Trzymaj dla wizualizacji
   - Serwer robi kalkulacje
   - Klient renderuje dane z serwera

---

## 📊 PRIORYTETY WDROŻENIA

### Faza 1 (Podstawa - 2-3h)
- [ ] Express + WebSocket server
- [ ] GameCache.js (in-memory JSON)
- [ ] GameRoom + GameLoop (bez AI)
- [ ] Synchronizacja Player position

### Faza 2 (Gameplay - 3-4h)
- [ ] Monster spawn & movement
- [ ] Collision system na serwerze
- [ ] Weapon system (damage calc)
- [ ] XP & drops

### Faza 3 (Zaawansowane - 2-3h)
- [ ] Bot AI port (BotAI.js logika)
- [ ] Upgrade system
- [ ] Boss spawn

### Faza 4 (Optymalizacja)
- [ ] Delta compression (wysyłaj tylko zmienione pola)
- [ ] Interpolation na kliencie
- [ ] Redis zamiast JSON

---

## 💡 TIPS DLA AI (Mała ilość tokenów)

Gdy pracujesz z AI, daj mu:

1. **Konktretny plik do portu** (np. "Port Player.js logic do Node.js")
2. **Istniejący kod w kontekście** (copy-paste z JS)
3. **Dokładne sygnatury funkcji** (co sie wchodzi, co wychodzi)
4. **Przykład komunikacji WebSocket** (JSON format)
5. **Jednostkowe zadania** (nie "zrób serwer", a "zrób SpawnSystem na serverze")

**Wzór promptu dla AI:**
```
Port this Player.js class logic to Node.js server:
- Remove THREE.js mesh code
- Keep all physics/stats/damage calculations
- Input/output: same JSON format as cache
- File: js/entities/Player.js lines 1-200
```

---

## 🔗 MAPOWANIE PLIKÓW

| Klient (istniejący) | Serwer (do zrobienia) | Cache key |
|---|---|---|
| Game.js | GameRoom.js | rooms[roomId] |
| Player.js | player.js (server) | rooms[roomId].players[id] |
| Monster.js | monster.js (server) | rooms[roomId].monsters[] |
| WeaponSystem.js | WeaponSystem.js (server) | - |
| CollisionSystem.js | CollisionSystem.js (server) | - |
| BotAI.js | BotAI.js (server) | - |

---

## 🚦 GIT STRUKTURA

```
server/
  ├── server.js
  ├── gameCache.js
  ├── gameRoom.js
  ├── gameLoop.js
  ├── player.js
  ├── monster.js
  ├── botAI.js
  ├── systems/
  │   ├── WeaponSystem.js
  │   ├── CollisionSystem.js
  │   ├── SpawnSystem.js
  │   └── UpgradeSystem.js
  ├── config.js (CLASSES, WEAPONS, ZONES, etc.)
  └── package.json

client/ (istniejący, minimalne zmiany)
  ├── WebSocketClient.js (update)
  ├── Game.js (update)
  └── reszta bez zmian
```

---

## ⚡ QUICK START

```bash
# 1. Zainstaluj dependencies
npm install express ws uuid

# 2. Stwórz server/server.js z powyższych ET APÓ W 1-3
# 3. Port istniejącej logiki z JS (Etap 2)
# 4. Test WebSocket komunikacji
# 5. Zintegruj z klientem (Etap 5)
```

---

**FOLLOW-UP PYTANIA DLA AI:**
- "Zrób mi GameCache.js z CRUD dla pokojów"
- "Port WeaponSystem.js na Node.js (bez THREE.js)"
- "Napisz gameLoop.js z update(dt) dla pokoju"
- "Synchronizuj Player position przez WebSocket"
