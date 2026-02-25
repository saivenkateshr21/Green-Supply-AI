"""
Anomaly Detection Engine
Detects supply chain anomalies in real-time streaming data.
"""
import math
import time
from typing import Dict, List, Optional
from collections import deque


class AnomalyDetector:
    """Real-time anomaly detection for fleet telemetrics."""

    # Thresholds
    SPEED_DROP_THRESHOLD = 15  # mph sudden drop
    TEMP_HIGH_THRESHOLD = 38.0  # °F above normal
    TEMP_LOW_THRESHOLD = 28.0  # °F below normal (cold chain)
    ROUTE_DEVIATION_MILES = 5.0  # miles off planned route
    ETA_DELAY_THRESHOLD = 30  # minutes beyond expected

    def __init__(self):
        self.prev_speeds: Dict[str, float] = {}
        self.prev_positions: Dict[str, tuple] = {}
        self.eta_baseline: Dict[str, float] = {}
        self.alert_history: deque = deque(maxlen=100)
        self.alert_id_counter = 0

    def _generate_alert_id(self) -> str:
        self.alert_id_counter += 1
        return f"ALT-{self.alert_id_counter:04d}"

    def detect(self, truck_data: Dict, ml_result: Dict) -> List[Dict]:
        """Run all anomaly checks on incoming truck data."""
        alerts = []
        truck_id = truck_data["truck_id"]
        speed = truck_data["speed"]
        temp = truck_data["temperature"]
        lat = truck_data["latitude"]
        lon = truck_data["longitude"]
        ts = truck_data["timestamp"]

        # 1. Speed Drop Detection
        if truck_id in self.prev_speeds:
            speed_delta = self.prev_speeds[truck_id] - speed
            if speed_delta > self.SPEED_DROP_THRESHOLD:
                alerts.append({
                    "id": self._generate_alert_id(),
                    "type": "speed_drop",
                    "severity": "warning" if speed_delta < 30 else "critical",
                    "truck_id": truck_id,
                    "title": f"Sudden Speed Drop on {truck_id}",
                    "message": f"Speed dropped by {speed_delta:.0f} mph (from {self.prev_speeds[truck_id]:.0f} to {speed:.0f} mph). Possible obstruction or mechanical issue.",
                    "timestamp": ts,
                    "value": round(speed_delta, 1),
                    "ai_insight": f"Telematics show {truck_id} decelerated {speed_delta:.0f} mph in one cycle. If speed remains below 20 mph for 5+ minutes, dispatch maintenance alert.",
                })
        self.prev_speeds[truck_id] = speed

        # 2. Temperature Anomaly
        if temp > self.TEMP_HIGH_THRESHOLD:
            alerts.append({
                "id": self._generate_alert_id(),
                "type": "temperature_spike",
                "severity": "critical",
                "truck_id": truck_id,
                "title": f"Temperature Spike on {truck_id}",
                "message": f"Sensor reports {temp:.1f}°F — {temp - 32:.1f}°F above safe threshold. Possible compressor failure. Cargo at risk.",
                "timestamp": ts,
                "value": round(temp, 1),
                "ai_insight": f"Sensor reporting {temp:.1f}°F above threshold. Possible compressor failure detected based on vibration patterns. Cargo at risk if not addressed within 35 minutes.",
            })
        elif temp < self.TEMP_LOW_THRESHOLD:
            alerts.append({
                "id": self._generate_alert_id(),
                "type": "temperature_low",
                "severity": "warning",
                "truck_id": truck_id,
                "title": f"Low Temperature on {truck_id}",
                "message": f"Temperature dropped to {temp:.1f}°F. Below safe minimum for cargo type.",
                "timestamp": ts,
                "value": round(temp, 1),
                "ai_insight": f"Cold chain temperature {temp:.1f}°F is below acceptable range. Recommend checking insulation integrity.",
            })

        # 3. Route Deviation (simplified — check sudden position jumps)
        if truck_id in self.prev_positions:
            prev_lat, prev_lon = self.prev_positions[truck_id]
            dist_moved = self._haversine(prev_lat, prev_lon, lat, lon)
            # If truck moved more than expected for the time interval, flag deviation
            if dist_moved > self.ROUTE_DEVIATION_MILES and speed < 30:
                alerts.append({
                    "id": self._generate_alert_id(),
                    "type": "route_deviation",
                    "severity": "warning",
                    "truck_id": truck_id,
                    "title": f"Route Deviation on {truck_id}",
                    "message": f"Vehicle has deviated {dist_moved:.1f} miles from expected position. Driver has not responded to automated check-in.",
                    "timestamp": ts,
                    "value": round(dist_moved, 1),
                    "ai_insight": f"Vehicle deviated {dist_moved:.1f} miles from planned route. Traffic on original route is clear. Recommend dispatch contact.",
                })
        self.prev_positions[truck_id] = (lat, lon)

        # 4. ETA Delay Detection
        eta_mins = ml_result.get("eta_minutes", 0)
        if truck_id not in self.eta_baseline:
            self.eta_baseline[truck_id] = eta_mins
        else:
            eta_increase = eta_mins - self.eta_baseline[truck_id]
            if eta_increase > self.ETA_DELAY_THRESHOLD:
                alerts.append({
                    "id": self._generate_alert_id(),
                    "type": "eta_delay",
                    "severity": "warning",
                    "truck_id": truck_id,
                    "title": f"ETA Delay on {truck_id}",
                    "message": f"ETA increased by {eta_increase:.0f} minutes beyond baseline. Delivery may be significantly delayed.",
                    "timestamp": ts,
                    "value": round(eta_increase, 0),
                    "ai_insight": f"ETA slipped {eta_increase:.0f} minutes. Contributing factors: current speed {speed:.0f} mph vs avg {ml_result.get('rolling_avg_speed_mph', 0)} mph.",
                })
            # Slowly adjust baseline
            self.eta_baseline[truck_id] = self.eta_baseline[truck_id] * 0.95 + eta_mins * 0.05

        # 5. G-Force / Hard Braking (simulated)
        if truck_id in self.prev_speeds:
            decel = (self.prev_speeds[truck_id] - speed) / 2.0  # approximate
            if decel > 25:  # very hard braking
                alerts.append({
                    "id": self._generate_alert_id(),
                    "type": "hard_braking",
                    "severity": "critical",
                    "truck_id": truck_id,
                    "title": f"Severe G-Force Event {truck_id}",
                    "message": f"Telematics detected hard braking event (>{decel/30:.1f}g). Vehicle may have pulled over.",
                    "timestamp": ts,
                    "value": round(decel, 1),
                    "ai_insight": f"Hard braking event detected. Dashboard cameras uploaded for review. Recommend checking driver status.",
                })

        # Store alerts
        for alert in alerts:
            self.alert_history.append(alert)

        return alerts

    def get_recent_alerts(self, count: int = 20) -> List[Dict]:
        """Return most recent alerts."""
        return list(self.alert_history)[-count:]

    def _haversine(self, lat1, lon1, lat2, lon2) -> float:
        R = 3959
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return R * 2 * math.asin(math.sqrt(a))
