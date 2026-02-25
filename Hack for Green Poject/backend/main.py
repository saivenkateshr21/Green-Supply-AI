"""
GreenSupply AI — Main Application Server
FastAPI + WebSocket for real-time streaming logistics dashboard.
"""
import asyncio
import os
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException

# Load environment variables
load_dotenv()
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from websocket_handler import ConnectionManager
from streaming import StreamingEngine
from ml_logic import ETAPredictor
from anomaly_detection import AnomalyDetector
from risk_engine import RiskEngine
from llm_agent import LLMAgent

# ── App Setup ──────────────────────────────────────────────────
app = FastAPI(title="GreenSupply AI", version="4.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core Components ────────────────────────────────────────────
manager = ConnectionManager()
streaming_engine = StreamingEngine()
eta_predictor = ETAPredictor()
anomaly_detector = AnomalyDetector()
risk_engine = RiskEngine()
llm_agent = LLMAgent()

# ── State Stores ───────────────────────────────────────────────
truck_states: Dict[str, Dict] = {}
all_alerts: List[Dict] = []
kpi_history: List[Dict] = []
speed_history: List[Dict] = []
eta_history: List[Dict] = []
risk_history: List[Dict] = []

# ── Streaming Callback ────────────────────────────────────────
async def process_stream_batch(truck_data_list: List[Dict]):
    """Process a batch of truck data through the ML pipeline and broadcast."""
    global truck_states, all_alerts

    batch_alerts = []
    truck_updates = []

    for data in truck_data_list:
        truck_id = data["truck_id"]

        # 1. ML: ETA Prediction
        ml_result = eta_predictor.update(
            truck_id, data["latitude"], data["longitude"],
            data["speed"], data["destination"]
        )

        # 2. Anomaly Detection
        alerts = anomaly_detector.detect(data, ml_result)
        batch_alerts.extend(alerts)

        # 3. Risk Scoring
        risk = risk_engine.calculate_risk(data, ml_result, alerts)

        # 4. Merge state
        state = {
            **data,
            **ml_result,
            **risk,
        }
        truck_states[truck_id] = state
        truck_updates.append(state)

    # Store alerts
    all_alerts.extend(batch_alerts)
    if len(all_alerts) > 200:
        all_alerts = all_alerts[-200:]

    # Fleet stats
    fleet_stats = eta_predictor.get_fleet_stats()
    fleet_risk = risk_engine.get_fleet_risk()

    # KPI calculations
    total_trucks = len(truck_states)
    on_time = sum(1 for t in truck_states.values() if t.get("risk_level") in ("LOW", "MEDIUM"))
    delayed = sum(1 for t in truck_states.values() if t.get("risk_level") in ("HIGH", "CRITICAL"))
    high_risk = sum(1 for t in truck_states.values() if t.get("risk_level") == "CRITICAL")
    on_time_pct = round((on_time / max(total_trucks, 1)) * 100)

    kpi = {
        "active_trucks": total_trucks,
        "on_time_pct": on_time_pct,
        "delayed": delayed,
        "high_risk": high_risk,
    }

    # History for charts
    ts = datetime.now(timezone.utc).isoformat()
    speed_history.append({"timestamp": ts, "avg_speed": fleet_stats.get("avg_fleet_speed", 0)})
    eta_history.append({"timestamp": ts, "avg_eta": round(sum(t.get("eta_minutes", 0) for t in truck_states.values()) / max(len(truck_states), 1), 1)})
    risk_history.append({"timestamp": ts, "risk_score": fleet_risk.get("overall_score", 0)})

    # Keep history bounded
    for h in [speed_history, eta_history, risk_history]:
        while len(h) > 100:
            h.pop(0)

    # Update LLM index
    llm_agent.update_index(truck_states, all_alerts, fleet_risk, fleet_stats)

    # Broadcast to all WebSocket clients
    await manager.broadcast({
        "type": "stream_update",
        "trucks": truck_updates,
        "alerts": batch_alerts,
        "kpi": kpi,
        "fleet_stats": fleet_stats,
        "fleet_risk": fleet_risk,
        "timestamp": ts,
    })


# ── Background Streaming Task ─────────────────────────────────
streaming_task = None

async def start_streaming():
    global streaming_task
    if streaming_task is None or streaming_task.done():
        streaming_task = asyncio.create_task(
            streaming_engine.stream(process_stream_batch, interval=2.5)
        )

@app.on_event("startup")
async def startup():
    await start_streaming()
    print("🚀 GreenSupply AI streaming engine started")

@app.on_event("shutdown")
async def shutdown():
    streaming_engine.stop()
    print("🛑 GreenSupply AI streaming engine stopped")


# ── WebSocket Endpoint ────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    # Send initial state
    fleet_stats = eta_predictor.get_fleet_stats()
    fleet_risk = risk_engine.get_fleet_risk()
    total_trucks = len(truck_states)
    on_time = sum(1 for t in truck_states.values() if t.get("risk_level") in ("LOW", "MEDIUM"))
    delayed = sum(1 for t in truck_states.values() if t.get("risk_level") in ("HIGH", "CRITICAL"))
    high_risk = sum(1 for t in truck_states.values() if t.get("risk_level") == "CRITICAL")

    await manager.send_personal(websocket, {
        "type": "initial_state",
        "trucks": list(truck_states.values()),
        "alerts": all_alerts[-20:],
        "kpi": {
            "active_trucks": total_trucks,
            "on_time_pct": round((on_time / max(total_trucks, 1)) * 100),
            "delayed": delayed,
            "high_risk": high_risk,
        },
        "fleet_stats": fleet_stats,
        "fleet_risk": fleet_risk,
        "speed_history": speed_history[-30:],
        "eta_history": eta_history[-30:],
        "risk_history": risk_history[-30:],
    })

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "ai_question":
                question = msg.get("question", "")
                result = await llm_agent.ask(question)
                await manager.send_personal(websocket, {
                    "type": "ai_response",
                    **result,
                })
            elif msg.get("type") == "ping":
                await manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        print(f"[WS Error] {e}")
        await manager.disconnect(websocket)


# ── REST API Endpoints ────────────────────────────────────────
@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "version": "4.2.0",
        "streaming": streaming_engine.running,
        "connected_clients": manager.client_count,
        "active_trucks": len(truck_states),
    }

@app.get("/api/trucks")
async def get_trucks():
    return list(truck_states.values())

@app.get("/api/trucks/{truck_id}")
async def get_truck(truck_id: str):
    if truck_id in truck_states:
        return truck_states[truck_id]
    raise HTTPException(status_code=404, detail="Truck not found")

@app.get("/api/alerts")
async def get_alerts():
    return all_alerts[-50:]

@app.get("/api/fleet-stats")
async def get_fleet_stats():
    return eta_predictor.get_fleet_stats()

@app.get("/api/fleet-risk")
async def get_fleet_risk():
    return risk_engine.get_fleet_risk()

@app.get("/api/history/speed")
async def get_speed_history():
    return speed_history[-50:]

@app.get("/api/history/eta")
async def get_eta_history():
    return eta_history[-50:]

@app.get("/api/history/risk")
async def get_risk_history():
    return risk_history[-50:]

class AIQuestion(BaseModel):
    question: str

@app.post("/api/ai/ask")
async def ask_ai(body: AIQuestion):
    result = await llm_agent.ask(body.question)
    return result

@app.get("/api/ai/history")
async def get_ai_history():
    return llm_agent.get_conversation_history()


# ── Serve Frontend ────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")

# Mount frontend static files
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


# ── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
