import os
from dotenv import load_dotenv

load_dotenv()

HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', 3000))

MAX_PLAYERS_PER_ROOM = 12
ROOM_CODE_LENGTH = 6
ROOM_CLEANUP_INTERVAL = 300
INACTIVE_ROOM_TIMEOUT = 1800
HEARTBEAT_INTERVAL = 30
MAX_MESSAGE_SIZE = 1024 * 1024
MAX_NAME_LENGTH = 16
MAX_CHAT_LENGTH = 200
CONNECTION_TIMEOUT = 60

DIFFICULTY_MULTIPLIERS = {
    'easy': {
        'monster_health': 0.7,
        'monster_damage': 0.7,
        'monster_speed': 0.8,
        'spawn_rate': 0.8
    },
    'medium': {
        'monster_health': 1.0,
        'monster_damage': 1.0,
        'monster_speed': 1.0,
        'spawn_rate': 1.0
    },
    'hard': {
        'monster_health': 1.5,
        'monster_damage': 1.3,
        'monster_speed': 1.2,
        'spawn_rate': 1.3
    },
    'extreme': {
        'monster_health': 2.5,
        'monster_damage': 1.8,
        'monster_speed': 1.5,
        'spawn_rate': 1.8
    }
}

PLAYER_CLASSES = ['warrior', 'archer', 'mage', 'berserker']

DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'