import requests
import time
import json
from datetime import datetime

API_URL = "http://localhost:8000/api/ai/ask" # Example endpoint

def simulate_realtime_ingestion():
    """
    Demonstrates how real-time data can be pushed to the GreenSupply AI system.
    In a real scenario, this would be a webhook from a GPS provider or an IoT gateway.
    """
    print("🚀 Starting real-time data ingestion simulation...")
    
    # Example truck data point
    data_point = {
        "truck_id": "T-999",
        "latitude": 35.6895,
        "longitude": 139.6917,
        "speed": 62.5,
        "temperature": 31.8,
        "cargo": "High Value Assets",
        "timestamp": datetime.now().isoformat()
    }
    
    print(f"📡 Sending real-time telemetry: {data_point['truck_id']} at {data_point['speed']} mph")
    
    # In this project, the streaming is handled internally by StreamingEngine,
    # but the AI can be queried about this new 'virtual' data if we integrated it.
    
    # For now, we show how to interact with the system via the AI Assistant
    query = {
        "question": "What is the status of the new truck T-999 that just reported in?"
    }
    
    try:
        response = requests.post(API_URL, json=query)
        if response.status_code == 200:
            print("🤖 AI Assistant Response:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"❌ Failed to reach AI Assistant: {response.status_code}")
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    simulate_realtime_ingestion()
