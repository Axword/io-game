import re
from typing import Dict, Any
from config import (
    MAX_NAME_LENGTH, MAX_CHAT_LENGTH, PLAYER_CLASSES, 
    MAX_PLAYERS_PER_ROOM, ROOM_CODE_LENGTH, DIFFICULTY_MULTIPLIERS
)
from exceptions import (
    InvalidNameError, InvalidClassError, InvalidRoomCodeError,
    InvalidConfigError, MessageTooLargeError
)

class Validators:
    @staticmethod
    def validate_player_name(name: str) -> str:
        if not name or not isinstance(name, str):
            raise InvalidNameError()
        
        name = name.strip()
        
        if len(name) == 0 or len(name) > MAX_NAME_LENGTH:
            raise InvalidNameError()
        
        if not re.match(r'^[a-zA-Z0-9_\-\s]+$', name):
            raise InvalidNameError()
        
        return name
    
    @staticmethod
    def validate_player_class(player_class: str) -> str:
        if player_class not in PLAYER_CLASSES:
            raise InvalidClassError()
        return player_class
    
    @staticmethod
    def validate_room_code(code: str) -> str:
        if not code or not isinstance(code, str):
            raise InvalidRoomCodeError()
        
        code = code.upper().strip()
        
        if len(code) != ROOM_CODE_LENGTH:
            raise InvalidRoomCodeError()
        
        if not re.match(r'^[A-Z0-9]+$', code):
            raise InvalidRoomCodeError()
        
        return code
    
    @staticmethod
    def validate_room_config(config: Dict[str, Any]) -> Dict[str, Any]:
        validated = {}
        
        max_players = config.get('maxPlayers', 8)
        if not isinstance(max_players, int) or max_players < 1 or max_players > MAX_PLAYERS_PER_ROOM:
            raise InvalidConfigError('maxPlayers')
        validated['maxPlayers'] = max_players
        
        difficulty = config.get('difficulty', 'medium')
        if difficulty not in DIFFICULTY_MULTIPLIERS:
            raise InvalidConfigError('difficulty')
        validated['difficulty'] = difficulty
        
        friendly_fire = config.get('friendlyFire', False)
        if not isinstance(friendly_fire, bool):
            raise InvalidConfigError('friendlyFire')
        validated['friendlyFire'] = friendly_fire
        
        privacy = config.get('privacy', 'public')
        if privacy not in ['public', 'private']:
            raise InvalidConfigError('privacy')
        validated['privacy'] = privacy
        
        return validated
    
    @staticmethod
    def validate_chat_message(message: str) -> str:
        if not message or not isinstance(message, str):
            raise MessageTooLargeError()
        
        message = message.strip()
        
        if len(message) == 0 or len(message) > MAX_CHAT_LENGTH:
            raise MessageTooLargeError()
        
        return message
    
    @staticmethod
    def validate_position(position: Dict[str, float]) -> Dict[str, float]:
        if not isinstance(position, dict):
            raise InvalidConfigError('position')
        
        x = position.get('x', 0)
        y = position.get('y', 0)
        
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise InvalidConfigError('position')
        
        return {'x': float(x), 'y': float(y)}