import math
import random
from config import CLASSES, WEAPONS, ZONES, SPAWN_POINTS, WORLD


class GameLoop:
    def __init__(self, difficulty="medium"):
        self.difficulty = difficulty
        self.players = {}  # id -> player_state
        self.monsters = []
        self.bullets = []
        self.xp_orbs = []
        self.bosses = []
        self.game_time = 0
        self.next_id = 1

    def gen_id(self):
        self.next_id += 1
        return self.next_id

    def spawn_player(self, player_id, class_id, name):
        cd = CLASSES[class_id]
        sp = random.choice(SPAWN_POINTS)

        self.players[player_id] = {
            "id": player_id,
            "name": name,
            "cls": class_id,
            "x": sp["x"], "y": sp["y"],
            "hp": cd["hp"] + 50,
            "maxHp": cd["hp"] + 50,
            "speed": cd["spd"],
            "level": 1,
            "xp": 0,
            "xpNeeded": 100,
            "totalXp": 0,
            "weapons": [{"type": cd["weapon"], "timer": 0}],
            "killedMonsters": 0,
            "totalDmg": 0,
            "alive": True,
            "pendingUpgrade": False,
            "upgradeCards": None,

            # Bonusy
            "armor": 0,
            "regen": 0,
            "critChance": 0,
            "critDamage": 200,
            "damageBonus": 0,
            "attackSpeedBonus": 0,
            "moveSpeedBonus": 0,
            "cooldownReduction": 0,
            "areaBonus": 0,
        }

    def remove_player(self, player_id):
        self.players.pop(player_id, None)

    def get_player(self, player_id):
        return self.players.get(player_id)

    def respawn_player(self, player_id):
        p = self.players.get(player_id)
        if not p:
            return
        sp = random.choice(SPAWN_POINTS)
        cd = CLASSES[p["cls"]]
        p["x"] = sp["x"]
        p["y"] = sp["y"]
        p["hp"] = cd["hp"] + 50
        p["maxHp"] = cd["hp"] + 50
        p["level"] = 1
        p["xp"] = 0
        p["xpNeeded"] = 100
        p["alive"] = True
        p["weapons"] = [{"type": cd["weapon"], "timer": 0}]

    def update(self, dt, inputs):
        """Główny tick - zwraca listę eventów"""
        self.game_time += dt
        events = []

        # 1. Ruch graczy
        for pid, player in self.players.items():
            if not player["alive"]:
                continue
            inp = inputs.get(pid, {})
            self._move_player(player, inp, dt)

        # 2. Ruch potworów
        self._update_monsters(dt)

        # 3. Broń/pociski
        for pid, player in self.players.items():
            if not player["alive"]:
                continue
            self._fire_weapons(player, dt)

        # 4. Ruch pocisków
        self._update_bullets(dt)

        # 5. Kolizje
        new_events = self._check_collisions(dt)
        events.extend(new_events)

        # 6. XP orby
        orb_events = self._collect_orbs(dt)
        events.extend(orb_events)

        # 7. Spawning
        self._spawn_monsters()

        # 8. Cleanup
        self._cleanup()

        # 9. Level-up check
        for pid, player in self.players.items():
            if player.get("pendingUpgrade"):
                cards = self._generate_upgrade_cards(player)
                player["upgradeCards"] = cards
                events.append({
                    "type": "upgrade_available",
                    "target": pid,
                    "cards": cards
                })

        return events

    def _move_player(self, player, inp, dt):
        dx = 0
        dy = 0
        if inp.get("w"): dy += 1
        if inp.get("s"): dy -= 1
        if inp.get("a"): dx -= 1
        if inp.get("d"): dx += 1

        if dx or dy:
            length = math.hypot(dx, dy)
            speed = player["speed"] * (1 + player.get("moveSpeedBonus", 0) / 100)
            player["x"] += (dx / length) * speed * dt * 60 * 3
            player["y"] += (dy / length) * speed * dt * 60 * 3

        # Clamp
        half = WORLD / 2
        player["x"] = max(-half, min(half, player["x"]))
        player["y"] = max(-half, min(half, player["y"]))

    def _update_monsters(self, dt):
        for m in self.monsters:
            if m["hp"] <= 0:
                continue
            # Proste AI: idź do najbliższego gracza
            nearest = None
            nearest_dist = 9999
            for p in self.players.values():
                if not p["alive"]:
                    continue
                d = math.hypot(p["x"] - m["x"], p["y"] - m["y"])
                if d < nearest_dist:
                    nearest_dist = d
                    nearest = p

            if nearest and nearest_dist < 800:
                dx = nearest["x"] - m["x"]
                dy = nearest["y"] - m["y"]
                d = math.hypot(dx, dy) or 1
                m["x"] += (dx / d) * m["spd"] * dt * 60
                m["y"] += (dy / d) * m["spd"] * dt * 60

    def _fire_weapons(self, player, dt):
        for w in player["weapons"]:
            if w["timer"] > 0:
                w["timer"] -= dt
                continue

            wd = WEAPONS.get(w["type"])
            if not wd:
                continue

            atk_spd = 1 + player.get("attackSpeedBonus", 0) / 100
            w["timer"] = wd["cooldown"] / max(0.1, atk_spd)

            # Znajdź cel
            target = self._find_nearest_monster(player, 500)
            if not target and w["type"] not in ("aura", "sword", "poison"):
                w["timer"] = 0.1  # Spróbuj ponownie szybko
                continue

            self._create_bullet(player, w, target)

    def _create_bullet(self, player, weapon, target):
        wtype = weapon["type"]
        wd = WEAPONS[wtype]
        stats = wd["stats"]
        dmg = stats.get("dmg", 10) * (1 + player.get("damageBonus", 0) / 100)

        if wtype == "aura":
            return  # Aura jest obsługiwana w kolizjach

        if not target:
            return

        angle = math.atan2(target["y"] - player["y"], target["x"] - player["x"])
        spd = stats.get("bSpd", 15)

        self.bullets.append({
            "id": self.gen_id(),
            "x": player["x"],
            "y": player["y"],
            "vx": math.cos(angle) * spd,
            "vy": math.sin(angle) * spd,
            "dmg": dmg,
            "owner": player["id"],
            "wtype": wtype,
            "sz": stats.get("bSz", 1),
            "pierce": stats.get("pierce", 0),
            "bounces": stats.get("bBnc", 0),
            "life": 5,
            "hit": set(),
            "hitCount": 0,
        })

    def _update_bullets(self, dt):
        for b in self.bullets:
            b["x"] += b["vx"] * dt * 60
            b["y"] += b["vy"] * dt * 60
            b["life"] -= dt

    def _check_collisions(self, dt):
        events = []

        # Pociski vs potwory
        for b in self.bullets:
            if b["life"] <= 0:
                continue

            for m in self.monsters:
                if m["hp"] <= 0 or id(m) in b["hit"]:
                    continue

                dist = math.hypot(b["x"] - m["x"], b["y"] - m["y"])
                hit_r = m["sz"] * 0.75 + b["sz"] * 3

                if dist < hit_r:
                    m["hp"] -= b["dmg"]
                    b["hit"].add(id(m))
                    b["hitCount"] += 1

                    # Track damage
                    owner = self.players.get(b["owner"])
                    if owner:
                        owner["totalDmg"] = owner.get("totalDmg", 0) + b["dmg"]

                    # Bounce
                    if b["bounces"] > 0:
                        b["bounces"] -= 1
                        next_m = self._find_nearest_to(b["x"], b["y"], self.monsters, 350, b["hit"])
                        if next_m:
                            d = math.hypot(next_m["x"] - b["x"], next_m["y"] - b["y"]) or 1
                            spd = math.hypot(b["vx"], b["vy"])
                            b["vx"] = (next_m["x"] - b["x"]) / d * spd
                            b["vy"] = (next_m["y"] - b["y"]) / d * spd
                    elif b["hitCount"] > b["pierce"]:
                        b["life"] = -1

                    break

        # Potwory vs gracze (kontakt)
        for m in self.monsters:
            if m["hp"] <= 0:
                continue
            for p in self.players.values():
                if not p["alive"]:
                    continue
                dist = math.hypot(m["x"] - p["x"], m["y"] - p["y"])
                if dist < m["sz"] * 0.8 + 15:
                    p["hp"] -= m["dmg"] * dt * 2.5

                    if p["hp"] <= 0:
                        p["alive"] = False
                        events.append({
                            "type": "player_death",
                            "target": p["id"],
                            "level": p["level"],
                            "kills": p["killedMonsters"],
                        })

        # Aura damage
        for p in self.players.values():
            if not p["alive"]:
                continue
            aura_w = next((w for w in p["weapons"] if w["type"] == "aura"), None)
            if not aura_w:
                continue
            aura_range = WEAPONS["aura"]["stats"]["range"] * (1 + p.get("areaBonus", 0) / 100)
            aura_dmg = WEAPONS["aura"]["stats"]["dmg"] * (1 + p.get("damageBonus", 0) / 100)

            for m in self.monsters:
                if m["hp"] <= 0:
                    continue
                if math.hypot(m["x"] - p["x"], m["y"] - p["y"]) < aura_range:
                    m["hp"] -= aura_dmg * dt

        # Monster kills
        for m in self.monsters:
            if m["hp"] <= 0:
                # Spawn XP orbs
                self.xp_orbs.append({
                    "id": self.gen_id(),
                    "x": m["x"] + random.uniform(-20, 20),
                    "y": m["y"] + random.uniform(-20, 20),
                    "val": m.get("xp", 10),
                    "life": 30,
                })

                # Find who killed it
                for p in self.players.values():
                    if math.hypot(m["x"] - p["x"], m["y"] - p["y"]) < 800:
                        p["killedMonsters"] += 1
                        events.append({"type": "kill", "target": "all",
                                       "data": {"player": p["name"], "monster": m["type"]}})
                        break

        return events

    def _collect_orbs(self, dt):
        events = []
        for p in self.players.values():
            if not p["alive"]:
                continue

            magnet_range = 100
            for orb in self.xp_orbs:
                if orb["life"] <= 0:
                    continue
                dist = math.hypot(orb["x"] - p["x"], orb["y"] - p["y"])
                if dist < magnet_range:
                    p["xp"] += orb["val"]
                    p["totalXp"] = p.get("totalXp", 0) + orb["val"]
                    orb["life"] = -1

                    # Level up
                    while p["xp"] >= p["xpNeeded"]:
                        p["xp"] -= p["xpNeeded"]
                        p["level"] += 1
                        p["xpNeeded"] = int(100 * (1.18 ** (p["level"] - 1)))
                        p["maxHp"] += 10
                        p["hp"] = min(p["maxHp"], p["hp"] + 20)
                        p["pendingUpgrade"] = True

                        events.append({
                            "type": "level_up",
                            "target": p["id"],
                            "level": p["level"]
                        })

        return events

    def _spawn_monsters(self):
        target_count = 80 + int(self.game_time / 10) * 5
        while len([m for m in self.monsters if m["hp"] > 0]) < target_count:
            angle = random.uniform(0, math.pi * 2)
            dist = random.uniform(200, WORLD / 2 - 200)
            self.monsters.append({
                "id": self.gen_id(),
                "x": math.cos(angle) * dist,
                "y": math.sin(angle) * dist,
                "hp": 20 + random.randint(0, 30),
                "maxHp": 20 + random.randint(0, 30),
                "dmg": 5 + random.randint(0, 10),
                "spd": 1 + random.random() * 2,
                "sz": 15 + random.randint(0, 10),
                "type": "basic",
                "xp": 5 + random.randint(0, 15),
            })

    def _cleanup(self):
        self.monsters = [m for m in self.monsters if m["hp"] > 0]
        self.bullets = [b for b in self.bullets if b["life"] > 0]
        self.xp_orbs = [o for o in self.xp_orbs if o["life"] > 0]

    def _find_nearest_monster(self, player, max_range):
        nearest = None
        nearest_dist = max_range
        for m in self.monsters:
            if m["hp"] <= 0:
                continue
            d = math.hypot(m["x"] - player["x"], m["y"] - player["y"])
            if d < nearest_dist:
                nearest_dist = d
                nearest = m
        return nearest

    def _find_nearest_to(self, x, y, entities, max_range, exclude_set):
        nearest = None
        nearest_dist = max_range
        for e in entities:
            if e.get("hp", 1) <= 0 or id(e) in exclude_set:
                continue
            d = math.hypot(e["x"] - x, e["y"] - y)
            if d < nearest_dist:
                nearest_dist = d
                nearest = e
        return nearest

    def _generate_upgrade_cards(self, player):
        # Uproszczone - zwróć 3 losowe karty
        cards = []
        for i in range(3):
            cards.append({
                "index": i,
                "type": "weaponUpgrade",
                "name": f"Upgrade {i+1}",
                "desc": "Zwiększa obrażenia o 10%",
                "value": 10,
            })
        player["pendingUpgrade"] = False
        return cards

    def apply_upgrade(self, player_id, card_index):
        player = self.players.get(player_id)
        if not player or not player.get("upgradeCards"):
            return
        # Zastosuj upgrade
        card = player["upgradeCards"][card_index]
        player["damageBonus"] = player.get("damageBonus", 0) + card.get("value", 10)
        player["upgradeCards"] = None
        player["pendingUpgrade"] = False

    def cleanup(self):
        self.monsters.clear()
        self.bullets.clear()
        self.xp_orbs.clear()
        self.bosses.clear()
        self.players.clear()