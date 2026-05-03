import asyncio
import time
import json
import msgpack  # pip install msgpack - szybszy niż JSON
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from game_loop import GameLoop
from room import RoomManager

app = FastAPI()
room_manager = RoomManager()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    player_id = None
    room_id = None

    try:
        while True:
            raw = await ws.receive_bytes()
            msg = msgpack.unpackb(raw, raw=False)
            msg_type = msg.get("type")

            if msg_type == "create_room":
                room_id = room_manager.create_room(msg.get("config", {}))
                player_id = room_manager.join_room(room_id, ws, msg.get("name", "Player"))
                await ws.send_bytes(msgpack.packb({
                    "type": "room_joined",
                    "roomId": room_id,
                    "playerId": player_id
                }))

            elif msg_type == "join_room":
                room_id = msg.get("code")
                if room_manager.room_exists(room_id):
                    player_id = room_manager.join_room(room_id, ws, msg.get("name", "Player"))
                    await ws.send_bytes(msgpack.packb({
                        "type": "room_joined",
                        "roomId": room_id,
                        "playerId": player_id
                    }))
                else:
                    await ws.send_bytes(msgpack.packb({
                        "type": "error",
                        "msg": "Room not found"
                    }))

            elif msg_type == "quick_join":
                room_id = room_manager.find_or_create_room()
                player_id = room_manager.join_room(room_id, ws, msg.get("name", "Player"))
                await ws.send_bytes(msgpack.packb({
                    "type": "room_joined",
                    "roomId": room_id,
                    "playerId": player_id
                }))

            elif msg_type == "select_class":
                if room_id and player_id:
                    room_manager.select_class(room_id, player_id, msg["classId"])

            elif msg_type == "input":
                if room_id and player_id:
                    room_manager.update_input(room_id, player_id, msg["input"], msg.get("seq", 0))

            elif msg_type == "select_upgrade":
                if room_id and player_id:
                    room_manager.select_upgrade(room_id, player_id, msg["cardIndex"])

            elif msg_type == "respawn":
                if room_id and player_id:
                    room_manager.respawn_player(room_id, player_id)

            elif msg_type == "leave":
                if room_id and player_id:
                    room_manager.leave_room(room_id, player_id)
                    room_id = None
                    player_id = None

    except WebSocketDisconnect:
        if room_id and player_id:
            room_manager.leave_room(room_id, player_id)


@app.on_event("startup")
async def startup():
    asyncio.create_task(room_manager.run_all_loops())