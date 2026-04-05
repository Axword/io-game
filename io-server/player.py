import time
from typing import Dict, Optional
from utils import Utils
from error_handler import ErrorHandler

class Player:
    def __init__(self, player_id: str, name: str, class_type: str):
        self.id = player_id
        self.name = name
        self.class_type = class_type
        self.room_id: Optional[str] = None
        self.websocket = None
        self.last_heartbeat = Utils.get_timestamp()
        
        self.level = 1
        self.xp = 0
        self.hp = 100
        self.max_hp = 100
        self.kills = 0
        self.total_damage = 0
        
        self.x = 0.0
        self.y = 0.0
        
        self.permanent_stats = {
            'luck': 0,
            'speed': 0,
            'hp': 0
        }
        
        self.weapons = [None, None, None, None]
        
        self.is_alive = True
        self.is_ready = False
        self.connected_at = Utils.get_timestamp()
        
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'class': self.class_type,
            'level': self.level,
            'xp': self.xp,
            'hp': self.hp,
            'maxHp': self.max_hp,
            'kills': self.kills,
            'totalDamage': self.total_damage,
            'position': {'x': self.x, 'y': self.y},
            'permanentStats': self.permanent_stats,
            'weapons': self.weapons,
            'isAlive': self.is_alive,
            'isReady': self.is_ready
        }
    
    @ErrorHandler.handle_sync('Player.update_position')
    def update_position(self, x: float, y: float):
        self.x = float(x)
        self.y = float(y)
    
    @ErrorHandler.handle_sync('Player.take_damage')
    def take_damage(self, damage: int) -> bool:
        self.hp = max(0, self.hp - damage)
        if self.hp <= 0:
            self.is_alive = False
            return True
        return False
    
    @ErrorHandler.handle_sync('Player.heal')
    def heal(self, amount: int):
        self.hp = min(self.max_hp, self.hp + amount)
    
    @ErrorHandler.handle_sync('Player.add_xp')
    def add_xp(self, amount: int) -> int:
        self.xp += amount
        levels_gained = 0
        
        while self.xp >= self.get_xp_for_next_level():
            self.xp -= self.get_xp_for_next_level()
            self.level += 1
            levels_gained += 1
            self.max_hp += 10
            self.hp = self.max_hp
        
        return levels_gained
    
    def get_xp_for_next_level(self) -> int:
        return 100 + (self.level - 1) * 50
    
    @ErrorHandler.handle_sync('Player.respawn')
    def respawn(self, x: float, y: float):
        self.is_alive = True
        self.hp = self.max_hp
        self.x = float(x)
        self.y = float(y)
    
    def update_heartbeat(self):
        self.last_heartbeat = Utils.get_timestamp()
    
    def is_connected(self, timeout: int = 60) -> bool:
        return Utils.get_timestamp() - self.last_heartbeat < timeout
    
    def get_connection_duration(self) -> float:
        return Utils.get_timestamp() - self.connected_at