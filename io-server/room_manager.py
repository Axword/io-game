import logging
from typing import Dict, Optional
from datetime import datetime
from game_state import GameState, GameRoom
from player import Player
from validators import Validators
from error_handler import ErrorHandler, safe_json_dumps
from exceptions import (
    RoomNotFoundError, RoomFullError, RoomAlreadyStartedError,
    UnauthorizedActionError, PlayerNotFoundError
)

logger = logging.getLogger(__name__)

class RoomManager:
    def __init__(self, game_state: GameState):
        self.game_state = game_state
    
    @ErrorHandler.handle_async('RoomManager.handle_create_room')
    async def handle_create_room(self, player: Player, data: Dict) -> Dict:
        config = Validators.validate_room_config(data.get('config', {}))
        room = self.game_state.create_room(player.id, config)
        
        if not room.add_player(player):
            self.game_state.remove_room(room.id)
            raise RoomFullError()
        
        logger.info(f'Player {player.name} created room {room.code}')
        
        return {
            'type': 'room_created',
            'success': True,
            'room': room.to_dict()
        }
    
    @ErrorHandler.handle_async('RoomManager.handle_join_room')
    async def handle_join_room(self, player: Player, data: Dict) -> Dict:
        code = Validators.validate_room_code(data.get('code', ''))
        room = self.game_state.get_room_by_code(code)
        
        if not room:
            raise RoomNotFoundError(code)
        
        if room.state != 'waiting':
            raise RoomAlreadyStartedError()
        
        if len(room.players) >= room.max_players:
            raise RoomFullError()
        
        room.add_player(player)
        logger.info(f'Player {player.name} joined room {room.code}')
        
        await self.broadcast_to_room(room.id, {
            'type': 'player_joined',
            'player': player.to_dict(),
            'room': room.to_dict()
        }, exclude=player.id)
        
        return {
            'type': 'room_joined',
            'success': True,
            'room': room.to_dict()
        }
    
    @ErrorHandler.handle_async('RoomManager.handle_quick_join')
    async def handle_quick_join(self, player: Player, data: Dict) -> Dict:
        room = self.game_state.find_public_room()
        
        if not room:
            default_config = {
                'maxPlayers': 8,
                'difficulty': 'medium',
                'friendlyFire': False,
                'privacy': 'public'
            }
            room = self.game_state.create_room(player.id, default_config)
        
        room.add_player(player)
        logger.info(f'Player {player.name} quick-joined room {room.code}')
        
        await self.broadcast_to_room(room.id, {
            'type': 'player_joined',
            'player': player.to_dict(),
            'room': room.to_dict()
        }, exclude=player.id)
        
        return {
            'type': 'room_joined',
            'success': True,
            'room': room.to_dict()
        }
    
    @ErrorHandler.handle_async('RoomManager.handle_leave_room')
    async def handle_leave_room(self, player: Player) -> Dict:
        if not player.room_id:
            raise PlayerNotFoundError(player.id)
        
        room = self.game_state.get_room(player.room_id)
        if not room:
            raise RoomNotFoundError(player.room_id)
        
        room.remove_player(player.id)
        logger.info(f'Player {player.name} left room {room.code}')
        
        await self.broadcast_to_room(room.id, {
            'type': 'player_left',
            'playerId': player.id,
            'room': room.to_dict()
        })
        
        if room.is_empty():
            self.game_state.remove_room(room.id)
        
        return {
            'type': 'room_left',
            'success': True
        }
    
    @ErrorHandler.handle_async('RoomManager.handle_start_game')
    async def handle_start_game(self, player: Player) -> Dict:
        if not player.room_id:
            raise PlayerNotFoundError(player.id)
        
        room = self.game_state.get_room(player.room_id)
        if not room:
            raise RoomNotFoundError(player.room_id)
        
        if player.id != room.host_id:
            raise UnauthorizedActionError('start_game')
        
        room.start_game()
        logger.info(f'Game started in room {room.code}')
        
        await self.broadcast_to_room(room.id, {
            'type': 'game_started',
            'room': room.to_dict()
        })
        
        return {
            'type': 'game_started',
            'success': True
        }
    
    async def broadcast_to_room(self, room_id: str, message: Dict, exclude: Optional[str] = None):
        room = self.game_state.get_room(room_id)
        if not room:
            return
        
        message_json = safe_json_dumps(message)
        
        for player in room.get_all_players():
            if exclude and player.id == exclude:
                continue
            
            if player.websocket and not player.websocket.closed:
                try:
                    await player.websocket.send(message_json)
                except Exception as e:
                    logger.error(f'Error broadcasting to player {player.id}: {e}')