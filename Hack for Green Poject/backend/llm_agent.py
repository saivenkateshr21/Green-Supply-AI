"""
LLM Agent for AI Assistant
Provides natural language explanations using RAG over live indexed data.
Uses Google Gemini API (with fallback to rule-based responses).
"""
import os
import json
from typing import Dict, List, Optional
from datetime import datetime


class LLMAgent:
    """AI Assistant powered by Gemini (with intelligent fallback)."""

    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY", "")
        self.grok_key = os.getenv("GROK_API_KEY", "")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "llama3") # Default to llama3
        self.use_ollama = bool(os.getenv("USE_OLLAMA", "False").lower() == "true")
        
        self.model = None
        self.use_grok = False
        self.conversation_history: List[Dict] = []
        self.indexed_data: Dict = {}
        self.token_usage = 0
        self.max_tokens = 10000

        # Pre-check Ollama if enabled
        if self.use_ollama:
            print(f"[LLM] Ollama enabled: Model={self.ollama_model} URL={self.ollama_url}")

        # Try to initialize Grok (xAI) if available
        if self.grok_key:
            try:
                import httpx
                self.use_grok = True
                print("[LLM] Grok API (xAI) initialized successfully")
            except Exception as e:
                print(f"[LLM] Grok initialization failed: {e}")

        # Fallback to Gemini if Grok isn't available or as secondary
        if not self.use_grok and self.gemini_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.gemini_key)
                self.model = genai.GenerativeModel("gemini-2.0-flash")
                print("[LLM] Gemini API initialized successfully")
            except Exception as e:
                print(f"[LLM] Gemini init failed: {e}. Using rule-based fallback.")
        
        if not self.use_ollama and not self.use_grok and not self.model:
            print("[LLM] No AI keys or local LLM set. Using intelligent rule-based assistant.")
            
        # Load example historical data from /data folder if available
        self.reference_events = []
        try:
            data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "iot_sensor_events.json")
            if os.path.exists(data_path):
                with open(data_path, 'r') as f:
                    self.reference_events = json.load(f)
                print(f"[LLM] Loaded {len(self.reference_events)} reference data points from /data")
        except Exception as e:
            print(f"[LLM] Reference data load failed: {e}")

    def update_index(self, truck_states: Dict, alerts: List[Dict], risk_data: Dict, fleet_stats: Dict):
        """Update the live data index for RAG retrieval."""
        self.indexed_data = {
            "truck_states": truck_states,
            "recent_alerts": alerts[-20:] if alerts else [],
            "risk_data": risk_data,
            "fleet_stats": fleet_stats,
            "last_updated": datetime.utcnow().isoformat(),
        }

    def _build_context(self) -> str:
        """Build context string from indexed data for RAG."""
        ctx = "=== LIVE SUPPLY CHAIN DATA ===\n\n"

        # Truck states
        if self.indexed_data.get("truck_states"):
            ctx += "## Active Trucks:\n"
            for tid, state in self.indexed_data["truck_states"].items():
                ctx += f"- {tid}: Speed {state.get('speed', 'N/A')} mph, "
                ctx += f"Temp {state.get('temperature', 'N/A')}°F, "
                ctx += f"Route: {state.get('origin', '?')} → {state.get('destination', '?')}, "
                ctx += f"ETA: {state.get('eta_minutes', 'N/A')} mins, "
                ctx += f"Risk: {state.get('risk_level', 'N/A')} ({state.get('risk_score', 0)})\n"

        # Recent alerts
        if self.indexed_data.get("recent_alerts"):
            ctx += "\n## Recent Alerts:\n"
            for alert in self.indexed_data["recent_alerts"][-10:]:
                ctx += f"- [{alert.get('severity', '').upper()}] {alert.get('title', '')}: {alert.get('message', '')}\n"

        # Fleet stats
        if self.indexed_data.get("fleet_stats"):
            stats = self.indexed_data["fleet_stats"]
            ctx += f"\n## Fleet Overview:\n"
            ctx += f"- Average Speed: {stats.get('avg_fleet_speed', 0)} mph\n"
            ctx += f"- Total Trucks: {stats.get('total_trucks', 0)}\n"

        # Risk overview
        if self.indexed_data.get("risk_data"):
            risk = self.indexed_data["risk_data"]
            ctx += f"\n## Risk Index:\n"
            ctx += f"- Overall: {risk.get('overall_level', 'N/A')} (Score: {risk.get('overall_score', 0)})\n"
            ctx += f"- High Risk Trucks: {risk.get('high_risk_count', 0)}\n"
            ctx += f"- Critical: {risk.get('critical_count', 0)}\n"

        # Reference Data (Historical/Example Context)
        if self.reference_events:
            ctx += "\n## Historical Reference Data (from /data):\n"
            for event in self.reference_events[-5:]:
                ctx += f"- {event.get('timestamp')}: {event.get('truck_id')} reported {event.get('sensor_type')} as {event.get('value')}."
                if event.get('message'):
                    ctx += f" Msg: {event.get('message')}"
                ctx += "\n"

        return ctx

    async def ask(self, question: str) -> Dict:
        """Process a user question through the AI assistant."""
        context = self._build_context()

        if self.use_ollama:
            return await self._ask_ollama(question, context)
        elif self.use_grok:
            return await self._ask_grok(question, context)
        elif self.model:
            return await self._ask_gemini(question, context)
        else:
            return self._ask_fallback(question, context)

    async def _ask_ollama(self, question: str, context: str) -> Dict:
        """Ask local Ollama with RAG context."""
        import httpx
        try:
            url = f"{self.ollama_url}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            
            prompt = f"""You are GreenSupply AI Assistant, an expert logistics AI monitoring a real-time fleet.
Use the following live data to answer questions accurately and concisely.

{context}

User Question: {question}

Provide a clear, structured answer. Use specific truck IDs and numbers from the data.
If asked about risks, explain the factors contributing to the risk score.
If asked about delays, explain with specific speed, distance, and ETA data.
Keep response under 200 words."""

            payload = {
                "model": self.ollama_model,
                "messages": [
                    {"role": "system", "content": "You are a specialized logistics intelligence assistant."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,
                "stream": False
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=60.0)
                if response.status_code != 200:
                    raise Exception(f"Ollama returned status {response.status_code}")
                
                data = response.json()
                answer = data["choices"][0]["message"]["content"]

                self.conversation_history.append({"role": "user", "content": question, "timestamp": datetime.utcnow().isoformat()})
                self.conversation_history.append({"role": "assistant", "content": answer, "timestamp": datetime.utcnow().isoformat()})

                return {
                    "response": answer,
                    "source": "ollama",
                    "token_usage": 0, # Local, no cost
                    "max_tokens": self.max_tokens,
                }
        except Exception as e:
            print(f"[LLM] Ollama error: {e}. Falling back to other providers.")
            if self.use_grok:
                return await self._ask_grok(question, context)
            elif self.model:
                return await self._ask_gemini(question, context)
            return self._ask_fallback(question, context)

    async def _ask_grok(self, question: str, context: str) -> Dict:
        """Ask Grok (xAI) with RAG context via OpenAI-compatible API."""
        import httpx
        try:
            url = "https://api.x.ai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.grok_key}",
                "Content-Type": "application/json"
            }
            
            prompt = f"""You are GreenSupply AI Assistant, an expert logistics AI monitoring a real-time fleet.
Use the following live data to answer questions accurately and concisely.

{context}

User Question: {question}

Provide a clear, structured answer. Use specific truck IDs and numbers from the data.
If asked about risks, explain the factors contributing to the risk score.
If asked about delays, explain with specific speed, distance, and ETA data.
Keep response under 200 words."""

            payload = {
                "model": "grok-beta", # Or grok-2 if available
                "messages": [
                    {"role": "system", "content": "You are a specialized logistics intelligence assistant."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                
                answer = data["choices"][0]["message"]["content"]
                self.token_usage += 100 # Approx

                self.conversation_history.append({"role": "user", "content": question, "timestamp": datetime.utcnow().isoformat()})
                self.conversation_history.append({"role": "assistant", "content": answer, "timestamp": datetime.utcnow().isoformat()})

                return {
                    "response": answer,
                    "source": "grok",
                    "token_usage": self.token_usage,
                    "max_tokens": self.max_tokens,
                }
        except Exception as e:
            print(f"[LLM] Grok error: {e}")
            if self.model:
                return await self._ask_gemini(question, context)
            return self._ask_fallback(question, context)

    async def _ask_gemini(self, question: str, context: str) -> Dict:
        """Ask Gemini with RAG context."""
        try:
            prompt = f"""You are GreenSupply AI Assistant, an expert logistics AI monitoring a real-time fleet.
Use the following live data to answer questions accurately and concisely.

{context}

User Question: {question}

Provide a clear, structured answer. Use specific truck IDs and numbers from the data.
If asked about risks, explain the factors contributing to the risk score.
If asked about delays, explain with specific speed, distance, and ETA data.
Keep response under 200 words."""

            response = self.model.generate_content(prompt)
            self.token_usage += 50  # Approximate

            self.conversation_history.append({
                "role": "user",
                "content": question,
                "timestamp": datetime.utcnow().isoformat(),
            })
            self.conversation_history.append({
                "role": "assistant",
                "content": response.text,
                "timestamp": datetime.utcnow().isoformat(),
            })

            return {
                "response": response.text,
                "source": "gemini",
                "token_usage": self.token_usage,
                "max_tokens": self.max_tokens,
            }
        except Exception as e:
            print(f"[LLM] Gemini error: {e}")
            return self._ask_fallback(question, context)

    def _ask_fallback(self, question: str, context: str) -> Dict:
        """Intelligent rule-based fallback when no LLM API is available."""
        question_lower = question.lower()
        trucks = self.indexed_data.get("truck_states", {})
        alerts = self.indexed_data.get("recent_alerts", [])
        risk = self.indexed_data.get("risk_data", {})
        stats = self.indexed_data.get("fleet_stats", {})

        response = ""

        # Check for specific truck queries
        for tid in trucks:
            if tid.lower() in question_lower:
                t = trucks[tid]
                response = f"""**{tid} Status Report:**

• **Route:** {t.get('origin', '?')} → {t.get('destination', '?')}
• **Current Speed:** {t.get('speed', 0)} mph
• **Temperature:** {t.get('temperature', 0)}°F
• **Fuel Level:** {t.get('fuel_level', 0)}%
• **ETA:** {t.get('eta_minutes', 0):.0f} minutes ({t.get('eta_hours', 0):.1f} hours)
• **Risk Level:** {t.get('risk_level', 'N/A')} (Score: {t.get('risk_score', 0)})
• **Driver:** {t.get('driver', 'N/A')}

{t.get('risk_explanation', '')}"""
                break

        if not response and ("delay" in question_lower or "late" in question_lower):
            delayed = [(tid, t) for tid, t in trucks.items()
                       if t.get('risk_level') in ('HIGH', 'CRITICAL')]
            if delayed:
                response = "**Delayed/High-Risk Shipments:**\n\n"
                for tid, t in delayed:
                    response += f"• **{tid}** ({t.get('origin')} → {t.get('destination')}): "
                    response += f"Risk {t.get('risk_level')} — Speed {t.get('speed')} mph, "
                    response += f"ETA {t.get('eta_minutes', 0):.0f} min\n"
                response += f"\n_Contributing factors include speed inconsistencies and route conditions._"
            else:
                response = "All shipments are currently on schedule. No significant delays detected."

        elif not response and ("risk" in question_lower or "danger" in question_lower):
            response = f"""**Fleet Risk Assessment:**

• **Overall Risk Level:** {risk.get('overall_level', 'LOW')}
• **Risk Score:** {risk.get('overall_score', 0)}/100
• **High Risk Trucks:** {risk.get('high_risk_count', 0)}
• **Critical Alerts:** {risk.get('critical_count', 0)}

Risk factors include delay magnitude, temperature abnormalities, speed inconsistencies, and route deviations."""

        elif not response and ("alert" in question_lower or "warning" in question_lower):
            if alerts:
                response = f"**Recent Alerts ({len(alerts)}):**\n\n"
                for a in alerts[-5:]:
                    response += f"• [{a.get('severity', '').upper()}] **{a.get('title', '')}**\n  {a.get('message', '')}\n\n"
            else:
                response = "No active alerts at this time. All systems operating normally."

        elif not response and ("summary" in question_lower or "overview" in question_lower or "status" in question_lower):
            response = f"""**GreenSupply AI Operations Summary:**

• **Active Fleet:** {stats.get('total_trucks', 0)} trucks
• **Average Speed:** {stats.get('avg_fleet_speed', 0)} mph
• **Risk Level:** {risk.get('overall_level', 'LOW')} ({risk.get('overall_score', 0)}/100)
• **Active Alerts:** {len(alerts)}
• **High Risk Shipments:** {risk.get('high_risk_count', 0)}

All trucks are being monitored in real-time with continuous ETA prediction and anomaly detection."""

        elif not response and ("eta" in question_lower or "arrival" in question_lower):
            response = "**ETA Predictions:**\n\n"
            for tid, t in trucks.items():
                response += f"• **{tid}** → {t.get('destination')}: "
                response += f"{t.get('eta_minutes', 0):.0f} min (Avg Speed: {t.get('rolling_avg_speed', 0)} mph)\n"

        elif not response and ("help" in question_lower or "what can" in question_lower):
            response = """**I can help you with:**

• **Truck Status** — Ask about any truck (e.g., "What's the status of T-102?")
• **Delays** — "Which trucks are delayed?"
• **Risk Assessment** — "What's the current risk level?"
• **Alerts** — "Show me recent alerts"
• **Fleet Summary** — "Give me an operations overview"
• **ETA Predictions** — "When will trucks arrive?"

Just ask in natural language!"""

        elif not response:
            response = f"""Based on current fleet data:

• **{stats.get('total_trucks', 0)} trucks** are active
• **Fleet avg speed:** {stats.get('avg_fleet_speed', 0)} mph
• **Risk level:** {risk.get('overall_level', 'LOW')}
• **Active alerts:** {len(alerts)}

Ask me about specific trucks, delays, risks, or fleet operations for detailed analysis."""

        self.token_usage += 25
        self.conversation_history.append({"role": "user", "content": question, "timestamp": datetime.utcnow().isoformat()})
        self.conversation_history.append({"role": "assistant", "content": response, "timestamp": datetime.utcnow().isoformat()})

        return {
            "response": response,
            "source": "rule-based",
            "token_usage": self.token_usage,
            "max_tokens": self.max_tokens,
        }

    def get_conversation_history(self) -> List[Dict]:
        return self.conversation_history[-20:]
