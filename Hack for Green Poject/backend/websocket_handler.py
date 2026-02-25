"""
WebSocket Connection Manager
Handles multiple client connections and broadcasts real-time data.
"""
from fastapi import WebSocket
from typing import List, Dict, Any
import json
import asyncio


class ConnectionManager:
    """Manages WebSocket connections for real-time streaming."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
        print(f"[WS] Client connected. Total: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        print(f"[WS] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: Dict[str, Any]):
        """Broadcast data to all connected clients."""
        message = json.dumps(data)
        disconnected = []
        async with self._lock:
            for connection in self.active_connections:
                try:
                    await connection.send_text(message)
                except Exception:
                    disconnected.append(connection)
        for conn in disconnected:
            await self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, data: Dict[str, Any]):
        """Send data to a specific client."""
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            await self.disconnect(websocket)

    @property
    def client_count(self) -> int:
        return len(self.active_connections)
