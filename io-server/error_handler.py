import logging
import json
from typing import Dict, Optional, Callable, Any
from functools import wraps
from exceptions import GameException, ValidationException, ConnectionException

logger = logging.getLogger(__name__)

class ErrorHandler:
    @staticmethod
    def create_error_response(error: Exception) -> Dict:
        if isinstance(error, GameException):
            return {
                'type': 'error',
                'error_code': error.error_code,
                'message': error.message
            }
        
        return {
            'type': 'error',
            'error_code': 'INTERNAL_ERROR',
            'message': 'Internal server error'
        }
    
    @staticmethod
    def log_error(error: Exception, context: str = ''):
        if isinstance(error, ValidationException):
            logger.warning(f'Validation error in {context}: {error.message}')
        elif isinstance(error, ConnectionException):
            logger.info(f'Connection error in {context}: {error.message}')
        elif isinstance(error, GameException):
            logger.error(f'Game error in {context}: {error.message}')
        else:
            logger.error(f'Unexpected error in {context}: {str(error)}', exc_info=True)
    
    @staticmethod
    def handle_async(context: str = ''):
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                try:
                    return await func(*args, **kwargs)
                except GameException as e:
                    ErrorHandler.log_error(e, context or func.__name__)
                    return ErrorHandler.create_error_response(e)
                except Exception as e:
                    ErrorHandler.log_error(e, context or func.__name__)
                    return ErrorHandler.create_error_response(e)
            return wrapper
        return decorator
    
    @staticmethod
    def handle_sync(context: str = ''):
        def decorator(func: Callable):
            @wraps(func)
            def wrapper(*args, **kwargs):
                try:
                    return func(*args, **kwargs)
                except GameException as e:
                    ErrorHandler.log_error(e, context or func.__name__)
                    raise
                except Exception as e:
                    ErrorHandler.log_error(e, context or func.__name__)
                    raise
            return wrapper
        return decorator

def safe_json_loads(data: str) -> Optional[Dict]:
    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return None

def safe_json_dumps(data: Any) -> str:
    try:
        return json.dumps(data)
    except (TypeError, ValueError):
        return json.dumps({'type': 'error', 'message': 'Serialization error'})