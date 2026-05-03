import asyncio
import time
import uuid
import msgpack
from game_loop import GameLoop


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, GameRoom] = {}

    def create_room(self, config: dict) -> str:
        room_id = self._generate_code()
        self.rooms[room_id] = GameRoom(room_id, config)
        return room_id

    def find_or_create_room(self) -> str:
        # Znajdź pokój z miejscem
        for rid, room in self.rooms.items():
            if len(room.players) < room.max_players and room.state == "waiting":
                return rid
        return self.create_room({})

    def room_exists(self, room_id: str) -> bool:
        return room_id in self.rooms

    def join_room(self, room_id: str, ws, name: str) -> str:
        room = self.rooms[room_id]
        player_id = str(uuid.uuid4())[:8]
        room.add_player(player_id, ws, name)
        return player_id

    def leave_room(self, room_id: str, player_id: str):
        if room_id in self.rooms:
            room = self.rooms[room_id]
            room.remove_player(player_id)
            if len(room.players) == 0:
                room.stop()
                del self.rooms[room_id]

    def select_class(self, room_id: str, player_id: str, class_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].select_class(player_id, class_id)

    def update_input(self, room_id: str, player_id: str, input_data: dict, seq: int):
        if room_id in self.rooms:
            self.rooms[room_id].update_input(player_id, input_data, seq)

    def select_upgrade(self, room_id: str, player_id: str, card_index: int):
        if room_id in self.rooms:
            self.rooms[room_id].select_upgrade(player_id, card_index)

    def respawn_player(self, room_id: str, player_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].respawn_player(player_id)

    async def run_all_loops(self):
        """Główna pętla - tickuje wszystkie pokoje"""
        while True:
            start = time.perf_counter()

            for room in list(self.rooms.values()):
                if room.state == "playing":
                    room.tick()
                    await room.broadcast_state()

            elapsed = time.perf_counter() - start
            # 20 ticków/s serwerowych
            sleep_time = max(0, (1 / 20) - elapsed)
            await asyncio.sleep(sleep_time)

    def _generate_code(self) -> str:
        import random
        import string
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class GameRoom:
    def __init__(self, room_id: str, config: dict):
        self.room_id = room_id
        self.config = config
        self.max_players = config.get("maxPlayers", 8)
        self.difficulty = config.get("difficulty", "medium")
        self.state = "waiting"  # waiting | playing | ended

        self.players: dict[str, PlayerConnection] = {}
        self.game = GameLoop(self.difficulty)

        self.tick_count = 0
        self.events = []  # Eventy do wysłania (kille, level-upy, itp.)

    def add_player(self, player_id: str, ws, name: str):
        self.players[player_id] = PlayerConnection(
            player_id=player_id,
            ws=ws,
            name=name
        )

    def remove_player(self, player_id: str):
        if player_id in self.players:
            self.game.remove_player(player_id)
            del self.players[player_id]

    def select_class(self, player_id: str, class_id: str):
        self.game.spawn_player(player_id, class_id, self.players[player_id].name)

        # Jeśli wszyscy wybrali klasę, start
        if all(p.class_selected for p in self.players.values()):
            self.state = "playing"

        self.players[player_id].class_selected = True

    def update_input(self, player_id: str, input_data: dict, seq: int):
        if player_id in self.players:
            self.players[player_id].last_input = input_data
            self.players[player_id].input_seq = seq

    def select_upgrade(self, player_id: str, card_index: int):
        self.game.apply_upgrade(player_id, card_index)

    def respawn_player(self, player_id: str):
        self.game.respawn_player(player_id)

    def tick(self):
        """Jeden tick serwera (50ms = 20Hz)"""
        dt = 1 / 20

        # Zbierz inputy
        inputs = {}
        for pid, pc in self.players.items():
            inputs[pid] = pc.last_input or {}

        # Tick logiki gry
        events = self.game.update(dt, inputs)
        self.events.extend(events)
        self.tick_count += 1

    async def broadcast_state(self):
        """Wyślij stan gry do wszystkich graczy"""
        for pid, pc in list(self.players.items()):
            try:
                snapshot = self.build_snapshot(pid)
                await pc.ws.send_bytes(msgpack.packb(snapshot))
            except Exception:
                self.remove_player(pid)

        self.events.clear()

    def build_snapshot(self, for_player_id: str) -> dict:
        """Buduje snapshot widoczny dla gracza (culling)"""
        player = self.game.get_player(for_player_id)
        if not player:
            return {"type": "snapshot", "players": [], "monsters": []}

        px, py = player["x"], player["y"]
        view_range = 1200  # Widoczny obszar

        # Filtruj do widocznych
        visible_monsters = [
            {"id": m["id"], "x": round(m["x"]), "y": round(m["y"]),
             "hp": round(m["hp"]), "type": m["type"], "sz": m["sz"]}
            for m in self.game.monsters
            if abs(m["x"] - px) < view_range and abs(m["y"] - py) < view_range
        ]

        visible_bullets = [
            {"id": b["id"], "x": round(b["x"]), "y": round(b["y"]),
             "vx": round(b["vx"], 1), "vy": round(b["vy"], 1),
             "wtype": b["wtype"], "sz": b["sz"]}
            for b in self.game.bullets
            if abs(b["x"] - px) < view_range and abs(b["y"] - py) < view_range
        ]

        visible_orbs = [
            {"id": o["id"], "x": round(o["x"]), "y": round(o["y"]), "val": o["val"]}
            for o in self.game.xp_orbs
            if abs(o["x"] - px) < view_range and abs(o["y"] - py) < view_range
        ]

        all_players = [
            {"id": p["id"], "x": round(p["x"]), "y": round(p["y"]),
             "hp": round(p["hp"]), "maxHp": round(p["maxHp"]),
             "level": p["level"], "cls": p["cls"], "name": p["name"]}
            for p in self.game.players.values()
        ]

        bosses = [
            {"id": b["id"], "x": round(b["x"]), "y": round(b["y"]),
             "hp": round(b["hp"]), "maxHp": round(b["maxHp"]),
             "type": b["type"]}
            for b in self.game.bosses
        ]

        snapshot = {
            "type": "snapshot",
            "tick": self.tick_count,
            "seq": self.players[for_player_id].input_seq,
            "you": {
                "x": round(px), "y": round(py),
                "hp": round(player["hp"]),
                "maxHp": round(player["maxHp"]),
                "xp": player["xp"],
                "xpNeeded": player["xpNeeded"],
                "level": player["level"],
                "weapons": player["weapons"],
                "pendingUpgrade": player.get("pendingUpgrade", False),
                "upgradeCards": player.get("upgradeCards", None),
            },
            "players": all_players,
            "monsters": visible_monsters,
            "bullets": visible_bullets,
            "orbs": visible_orbs,
            "bosses": bosses,
        }

        # Dodaj eventy
        player_events = [e for e in self.events if e.get("target") in (for_player_id, "all")]
        if player_events:
            snapshot["events"] = player_events

        return snapshot

    def stop(self):
        self.state = "ended"
        self.game.cleanup()


class PlayerConnection:
    def __init__(self, player_id: str, ws, name: str):
        self.player_id = player_id
        self.ws = ws
        self.name = name
        self.class_selected = False
        self.last_input = {}
        self.input_seq = 0