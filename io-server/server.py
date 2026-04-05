import asyncio
import logging
import websockets
import signal
import sys
import platform
from datetime import datetime
from typing import Set
from websockets.server import WebSocketServerProtocol

from game_state import GameState
from player import Player
from room_manager import RoomManager
from validators import Validators
from error_handler import ErrorHandler, safe_json_loads, safe_json_dumps
from exceptions import NotInitializedError, InvalidMessageFormatError
from config import HOST, PORT, DEBUG, ROOM_CLEANUP_INTERVAL, INACTIVE_ROOM_TIMEOUT

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ArenaIOServer:
    def __init__(self):
        self.game_state = GameState()
        self.room_manager = RoomManager(self.game_state)
        self.connections: Set[WebSocketServerProtocol] = set()
        self.running = True
        
    async def register(self, websocket: WebSocketServerProtocol):
        self.connections.add(websocket)
        logger.info(f'New connection from {websocket.remote_address}. Total: {len(self.connections)}')
    
    async def unregister(self, websocket: WebSocketServerProtocol):
        self.connections.discard(websocket)
        logger.info(f'Connection closed from {websocket.remote_address}. Total: {len(self.connections)}')
    
    @ErrorHandler.handle_async('ArenaIOServer.handle_message')
    async def handle_message(self, websocket: WebSocketServerProtocol, message: str, player: Player):
        data = safe_json_loads(message)
        if not data:
            raise InvalidMessageFormatError()
        
        msg_type = data.get('type')
        logger.debug(f'Received message type: {msg_type} from player: {player.name}')
        
        player.update_heartbeat()
        
        handlers = {
            'create_room': self.room_manager.handle_create_room,
            'join_room': self.room_manager.handle_join_room,
            'quick_join': self.room_manager.handle_quick_join,
            'leave_room': lambda p, d: self.room_manager.handle_leave_room(p),
            'start_game': lambda p, d: self.room_manager.handle_start_game(p),
            'player_update': self.handle_player_update,
            'player_action': self.handle_player_action,
            'chat_message': self.handle_chat_message,
            'heartbeat': self.handle_heartbeat,
        }
        
        handler = handlers.get(msg_type)
        if handler:
            response = await handler(player, data)
            if response:
                await websocket.send(safe_json_dumps(response))
        else:
            logger.warning(f'Unknown message type: {msg_type}')
            await websocket.send(safe_json_dumps({
                'type': 'error',
                'error_code': 'UNKNOWN_MESSAGE_TYPE',
                'message': f'Unknown message type: {msg_type}'
            }))
    
    @ErrorHandler.handle_async('ArenaIOServer.handle_player_update')
    async def handle_player_update(self, player: Player, data: dict) -> dict:
        if not player.room_id:
            return None
        
        room = self.game_state.get_room(player.room_id)
        if not room or room.state != 'playing':
            return None
        
        if 'position' in data:
            pos = Validators.validate_position(data['position'])
            player.update_position(pos['x'], pos['y'])
        
        if 'hp' in data:
            player.hp = int(data['hp'])
        
        if 'level' in data:
            player.level = int(data['level'])
        
        if 'xp' in data:
            player.xp = int(data['xp'])
        
        await self.room_manager.broadcast_to_room(room.id, {
            'type': 'player_update',
            'playerId': player.id,
            'data': {
                'position': {'x': player.x, 'y': player.y},
                'hp': player.hp,
                'level': player.level,
                'xp': player.xp
            }
        }, exclude=player.id)
        
        return None
    
    @ErrorHandler.handle_async('ArenaIOServer.handle_player_action')
    async def handle_player_action(self, player: Player, data: dict) -> dict:
        if not player.room_id:
            return None
        
        room = self.game_state.get_room(player.room_id)
        if not room or room.state != 'playing':
            return None
        
        action_type = data.get('action')
        
        await self.room_manager.broadcast_to_room(room.id, {
            'type': 'player_action',
            'playerId': player.id,
            'action': action_type,
            'data': data.get('data', {})
        }, exclude=player.id)
        
        return None
    
    @ErrorHandler.handle_async('ArenaIOServer.handle_chat_message')
    async def handle_chat_message(self, player: Player, data: dict) -> dict:
        if not player.room_id:
            return None
        
        room = self.game_state.get_room(player.room_id)
        if not room:
            return None
        
        message = Validators.validate_chat_message(data.get('message', ''))
        
        await self.room_manager.broadcast_to_room(room.id, {
            'type': 'chat_message',
            'playerId': player.id,
            'playerName': player.name,
            'message': message,
            'timestamp': datetime.now().isoformat()
        })
        
        return None
    
    @ErrorHandler.handle_async('ArenaIOServer.handle_heartbeat')
    async def handle_heartbeat(self, player: Player, data: dict) -> dict:
        player.update_heartbeat()
        return {
            'type': 'heartbeat_ack',
            'serverTime': datetime.now().isoformat()
        }
    
    async def handle_client(self, websocket: WebSocketServerProtocol, path: str):
        await self.register(websocket)
        player = None
        
        try:
            async for message in websocket:
                if not player:
                    data = safe_json_loads(message)
                    if not data:
                        raise InvalidMessageFormatError()
                    
                    if data.get('type') == 'init':
                        player_name = Validators.validate_player_name(data.get('name', f'Player_{len(self.game_state.players)}'))
                        player_class = Validators.validate_player_class(data.get('class', 'warrior'))
                        
                        from utils import Utils
                        player = Player(
                            player_id=Utils.generate_unique_id(),
                            name=player_name,
                            class_type=player_class
                        )
                        player.websocket = websocket
                        self.game_state.add_player(player)
                        
                        logger.info(f'Player initialized: {player.name} ({player.class_type})')
                        
                        await websocket.send(safe_json_dumps({
                            'type': 'init_success',
                            'playerId': player.id,
                            'player': player.to_dict()
                        }))
                    else:
                        raise NotInitializedError()
                else:
                    await self.handle_message(websocket, message, player)
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f'Connection closed for player: {player.name if player else "unknown"}')
        except Exception as e:
            ErrorHandler.log_error(e, 'handle_client')
            if websocket and not websocket.closed:
                await websocket.send(safe_json_dumps(ErrorHandler.create_error_response(e)))
        finally:
            if player:
                self.game_state.remove_player(player.id)
            await self.unregister(websocket)
    
    async def cleanup_task(self):
        while self.running:
            try:
                await asyncio.sleep(ROOM_CLEANUP_INTERVAL)
                self.game_state.cleanup_inactive_rooms(INACTIVE_ROOM_TIMEOUT)
                
                stats = self.game_state.get_stats()
                logger.info(f'Server stats: {stats}')
                
            except Exception as e:
                ErrorHandler.log_error(e, 'cleanup_task')
    
    async def start(self):
        logger.info(f'Starting Arena.IO server on {HOST}:{PORT}')
        
        cleanup = asyncio.create_task(self.cleanup_task())
        
        async with websockets.serve(self.handle_client, HOST, PORT):
            logger.info(f'Server started successfully on ws://{HOST}:{PORT}')
            logger.info(f'Press Ctrl+C to stop the server')
            
            stop_event = asyncio.Event()
            
            def signal_handler_func(signum, frame):
                logger.info(f'Received signal {signum}')
                stop_event.set()
            
            if platform.system() != 'Windows':
                loop = asyncio.get_running_loop()
                for sig in (signal.SIGTERM, signal.SIGINT):
                    loop.add_signal_handler(sig, lambda: stop_event.set())
            else:
                signal.signal(signal.SIGINT, signal_handler_func)
                signal.signal(signal.SIGTERM, signal_handler_func)
            
            await stop_event.wait()
    
    def stop(self):
        logger.info('Stopping server...')
        self.running = False


async def main():
    server = ArenaIOServer()
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info('Server interrupted by user')
    except Exception as e:
        ErrorHandler.log_error(e, 'main')
    finally:
        server.stop()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\nServer stopped')
        sys.exit(0)