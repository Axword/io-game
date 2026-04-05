import uuid
import random
import string
import time
from typing import Dict, List
from config import ROOM_CODE_LENGTH

class Utils:
    @staticmethod
    def generate_unique_id() -> str:
        return str(uuid.uuid4())
    
    @staticmethod
    def generate_room_code() -> str:
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=ROOM_CODE_LENGTH))
    
    @staticmethod
    def get_timestamp() -> float:
        return time.time()
    
    @staticmethod
    def format_duration(seconds: float) -> str:
        seconds = int(seconds)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        
        if hours > 0:
            return f'{hours}h {minutes}m {secs}s'
        return f'{minutes}m {secs}s'
    
    @staticmethod
    def clamp(value: float, min_val: float, max_val: float) -> float:
        return max(min_val, min(max_val, value))
    
    @staticmethod
    def sanitize_dict(data: Dict, allowed_keys: List[str]) -> Dict:
        return {k: v for k, v in data.items() if k in allowed_keys}