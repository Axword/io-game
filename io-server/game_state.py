from typing import Dict, List, Optional, Set
from player import Player
from utils import Utils
from error_handler import ErrorHandler
from config import DIFFICULTY_MULTIPLIERS, MAX_PLAYERS_PER_ROOM
from exceptions import RoomFullError, RoomAlreadyStartedError

class GameRoom:
    def __init__(self, room_id: str, host_id: str, config: Dict):
        self.id = room_id
        self.code = Utils.generate_room_code()
        self.host_id = host_id
        self.created_at = Utils.get_timestamp()
        self.last_activity = Utils.get_timestamp()
        
        self.max_players = config.get('maxPlayers', 8)
        self.difficulty = config.get('difficulty', 'medium')
        self.friendly_fire = config.get('friendlyFire', False)
        self.privacy = config.get('privacy', 'public')
        
        self.players: Dict[str, Player] = {}
        self.player_order: List[str] = []
        
        self.state = 'waiting'
        self.game_started_at: Optional[float] = None
        self.winner_id: Optional[str] = None
        
        self.monsters = []
        self.bullets = []
        self.xp_orbs = []
        self.bosses = []
    
    @ErrorHandler.handle_sync('GameRoom.add_player')
    def add_player(self, player: Player) -> bool:
        if len(self.players) >= self.max_players:
            raise RoomFullError()
        
        if player.id in self.players:
            return False
        
        self.players[player.id] = player
        self.player_order.append(player.id)
        player.room_id = self.id
        self.update_activity()
        return True
    
    @ErrorHandler.handle_sync('GameRoom.remove_player')
    def remove_player(self, player_id: str) -> bool:
        if player_id not in self.players:
            return False
        
        player = self.players[player_id]
        player.room_id = None
        del self.players[player_id]
        
        if player_id in self.player_order:
            self.player_order.remove(player_id)
        
        self.update_activity()
        
        if player_id == self.host_id and self.player_order:
            self.host_id = self.player_order[0]
        
        return True
    
    def get_player(self, player_id: str) -> Optional[Player]:
        return self.players.get(player_id)
    
    def get_all_players(self) -> List[Player]:
        return list(self.players.values())
    
    def get_alive_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.is_alive]
    
    def can_start(self) -> bool:
        return len(self.players) >= 1 and self.state == 'waiting'
    
    @ErrorHandler.handle_sync('GameRoom.start_game')
    def start_game(self) -> bool:
        if self.state != 'waiting':
            raise RoomAlreadyStartedError()
        
        if len(self.players) < 1:
            return False
        
        self.state = 'playing'
        self.game_started_at = Utils.get_timestamp()
        
        for player in self.players.values():
            player.is_alive = True
            player.hp = player.max_hp
        
        return True
    
    def end_game(self, winner_id: Optional[str] = None):
        self.state = 'ended'
        self.winner_id = winner_id
    
    def get_difficulty_multiplier(self, key: str) -> float:
        return DIFFICULTY_MULTIPLIERS.get(self.difficulty, {}).get(key, 1.0)
    
    def to_dict(self) -> Dict:
        game_time = 0
        if self.game_started_at:
            game_time = Utils.get_timestamp() - self.game_started_at
        
        return {
            'id': self.id,
            'code': self.code,
            'hostId': self.host_id,
            'maxPlayers': self.max_players,
            'currentPlayers': len(self.players),
            'difficulty': self.difficulty,
            'friendlyFire': self.friendly_fire,
            'privacy': self.privacy,
            'state': self.state,
            'players': [p.to_dict() for p in self.players.values()],
            'gameTime': game_time
        }
    
    def update_activity(self):
        self.last_activity = Utils.get_timestamp()
    
    def is_inactive(self, timeout: int) -> bool:
        return Utils.get_timestamp() - self.last_activity > timeout
    
    def is_empty(self) -> bool:
        return len(self.players) == 0
    
    def get_duration(self) -> float:
        return Utils.get_timestamp() - self.created_at


class GameState:
    def __init__(self):
        self.rooms: Dict[str, GameRoom] = {}
        self.players: Dict[str, Player] = {}
        self.room_codes: Dict[str, str] = {}
        self.public_rooms: Set[str] = set()
    
    @ErrorHandler.handle_sync('GameState.create_room')
    def create_room(self, host_id: str, config: Dict) -> GameRoom:
        room_id = Utils.generate_unique_id()
        room = GameRoom(room_id, host_id, config)
        
        self.rooms[room_id] = room
        self.room_codes[room.code] = room_id
        
        if room.privacy == 'public':
            self.public_rooms.add(room_id)
        
        return room
    
    def get_room(self, room_id: str) -> Optional[GameRoom]:
        return self.rooms.get(room_id)
    
    def get_room_by_code(self, code: str) -> Optional[GameRoom]:
        room_id = self.room_codes.get(code.upper())
        return self.rooms.get(room_id) if room_id else None
    
    def find_public_room(self) -> Optional[GameRoom]:
        for room_id in self.public_rooms:
            room = self.rooms.get(room_id)
            if room and room.state == 'waiting' and len(room.players) < room.max_players:
                return room
        return None
    
    @ErrorHandler.handle_sync('GameState.remove_room')
    def remove_room(self, room_id: str):
        room = self.rooms.get(room_id)
        if not room:
            return
        
        if room.code in self.room_codes:
            del self.room_codes[room.code]
        
        if room_id in self.public_rooms:
            self.public_rooms.remove(room_id)
        
        del self.rooms[room_id]
    
    def add_player(self, player: Player):
        self.players[player.id] = player
    
    @ErrorHandler.handle_sync('GameState.remove_player')
    def remove_player(self, player_id: str):
        player = self.players.get(player_id)
        if player and player.room_id:
            room = self.get_room(player.room_id)
            if room:
                room.remove_player(player_id)
                
                if room.is_empty():
                    self.remove_room(room.id)
        
        if player_id in self.players:
            del self.players[player_id]
    
    def get_player(self, player_id: str) -> Optional[Player]:
        return self.players.get(player_id)
    
    @ErrorHandler.handle_sync('GameState.cleanup_inactive_rooms')
    def cleanup_inactive_rooms(self, timeout: int):
        rooms_to_remove = []
        
        for room_id, room in self.rooms.items():
            if room.is_inactive(timeout) or room.is_empty():
                rooms_to_remove.append(room_id)
        
        for room_id in rooms_to_remove:
            self.remove_room(room_id)
    
    def get_stats(self) -> Dict:
        return {
            'totalRooms': len(self.rooms),
            'totalPlayers': len(self.players),
            'publicRooms': len(self.public_rooms),
            'playingRooms': len([r for r in self.rooms.values() if r.state == 'playing'])
        }