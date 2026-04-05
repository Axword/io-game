class GameException(Exception):
    def __init__(self, message: str, error_code: str = 'UNKNOWN_ERROR'):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)

class PlayerException(GameException):
    pass

class PlayerNotFoundError(PlayerException):
    def __init__(self, player_id: str):
        super().__init__(f'Player {player_id} not found', 'PLAYER_NOT_FOUND')

class PlayerAlreadyInRoomError(PlayerException):
    def __init__(self):
        super().__init__('Player already in room', 'PLAYER_IN_ROOM')

class RoomException(GameException):
    pass

class RoomNotFoundError(RoomException):
    def __init__(self, identifier: str):
        super().__init__(f'Room {identifier} not found', 'ROOM_NOT_FOUND')

class RoomFullError(RoomException):
    def __init__(self):
        super().__init__('Room is full', 'ROOM_FULL')

class RoomAlreadyStartedError(RoomException):
    def __init__(self):
        super().__init__('Game already started', 'GAME_STARTED')

class RoomNotStartableError(RoomException):
    def __init__(self):
        super().__init__('Cannot start game', 'CANNOT_START')

class UnauthorizedActionError(GameException):
    def __init__(self, action: str):
        super().__init__(f'Unauthorized action: {action}', 'UNAUTHORIZED')

class ValidationException(GameException):
    pass

class InvalidNameError(ValidationException):
    def __init__(self):
        super().__init__('Invalid player name', 'INVALID_NAME')

class InvalidClassError(ValidationException):
    def __init__(self):
        super().__init__('Invalid player class', 'INVALID_CLASS')

class InvalidRoomCodeError(ValidationException):
    def __init__(self):
        super().__init__('Invalid room code', 'INVALID_CODE')

class InvalidConfigError(ValidationException):
    def __init__(self, field: str):
        super().__init__(f'Invalid config: {field}', 'INVALID_CONFIG')

class MessageTooLargeError(ValidationException):
    def __init__(self):
        super().__init__('Message too large', 'MESSAGE_TOO_LARGE')

class ConnectionException(GameException):
    pass

class ConnectionTimeoutError(ConnectionException):
    def __init__(self):
        super().__init__('Connection timeout', 'CONNECTION_TIMEOUT')

class InvalidMessageFormatError(ConnectionException):
    def __init__(self):
        super().__init__('Invalid message format', 'INVALID_FORMAT')

class NotInitializedError(ConnectionException):
    def __init__(self):
        super().__init__('Client not initialized', 'NOT_INITIALIZED')