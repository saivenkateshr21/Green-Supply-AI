🚚 GreenSupply AI — Real-Time Logistics Intelligence
GreenSupply AI is a next-generation logistics monitoring platform that leverages real-time streaming, machine learning, and Generative AI to provide deep insights into fleet operations. It features a stunning, dark-themed dashboard, continuous ETA prediction, anomaly detection, and a powerful AI assistant powered by Grok, Gemini, or local Ollama.

✨ Key Features
Live Fleet Tracking: Real-time GPS and sensor streaming via WebSockets.
Predictive Analytics: Rolling-average ETA prediction and dynamic Supply Chain Risk Indexing.
AI Assistant (RAG): A dedicated AI chat interface with full context of your live fleet data. Supports Grok (xAI), Google Gemini, and Local Ollama.
Anomalous Event Detection: Instant alerts for speed drops, temperature deviations, and route inconsistencies.
Enterprise Security: Full Firebase Authentication (Email/Password & Google Sign-In) and Firestore data persistence.
Cloud-First Design: Native support for Docker containerization and easy deployment.
🛠️ Technology Stack
Backend: FastAPI, WebSockets, Pydantic, Python.
Frontend: Vanilla JavaScript (ESLint clean), CSS3 (Modern Glassmorphism), HTML5.
AI/LLM: Grok-Beta (xAI), Gemini 2.0 Flash, Ollama (Llama 3/Mistral).
Database/Auth: Firebase Authentication & Google Cloud Firestore.
Visualization: Leaflet.js (Maps), Chart.js (Real-time Analytics).
📂 Project Structure
├── backend/                # FastAPI Application
│   ├── main.py             # Server Entry Point
│   ├── llm_agent.py        # AI Assistant Logic (RAG)
│   ├── streaming.py        # Live Truck Simulation
│   ├── ml_logic.py         # ETA & Speed Prediction
│   └── ...                 # Anomaly, Risk, & Socket Handlers
├── frontend/               # Dashboard Layout & Logic
│   ├── index.html          # Main Shell
│   ├── auth.html           # Auth Experience
│   ├── script.js           # Controller
│   └── styles.css          # Design System
├── data/                   # Real-time Example Data & Snapshots
├── DEPLOYMENT.md           # Hosting Guide (Render, Docker, etc.)
└── docker-compose.yml      # Container Orchestration
🚀 Getting Started
1. Requirements
Python 3.9+
Firebase Project (for Auth & DB)
(Optional) Docker Desktop & Ollama (for local LLMs)
2. Installation
# Clone the repository
git clone <repository-url>
cd GreenSupply-AI

# Install dependencies
pip install -r backend/requirements.txt
3. Configuration
Create a .env file in the backend/ directory:

GROK_API_KEY=your_xai_key
GEMINI_API_KEY=your_google_key
USE_OLLAMA=false
4. Running the App
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
Open http://localhost:8000 in your browser.

🐳 Running with Docker
docker compose up -d --build
🌍 Hosting
For detailed hosting instructions on platforms like Render, Firebase, or VPS, please refer to the DEPLOYMENT.md file.

🧪 Simulation Data
The project includes a data/ directory with example IoT sensor logs and a data/ingest_realtime.py script to demonstrate how external systems can push telemetry into the platform.

