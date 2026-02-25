"""
Machine Learning Logic
- ETA prediction using rolling average speed
- Distance-based ETA calculation
- Feature engineering for streaming data
"""
import math
from typing import Dict, List, Optional
from collections import deque


# Destination coordinates (major US cities)
DESTINATIONS = {
    "Chicago": (41.8781, -87.6298),
    "Seattle": (47.6062, -122.3321),
    "Denver": (39.7392, -104.9903),
    "Miami": (25.7617, -80.1918),
    "Charlotte": (35.2271, -80.8431),
    "Los Angeles": (34.0522, -118.2437),
    "Phoenix": (33.4484, -112.0740),
    "Dallas": (32.7767, -96.7970),
    "New York": (40.7128, -74.0060),
    "Atlanta": (33.7490, -84.3880),
}


class ETAPredictor:
    """Continuous ETA prediction using rolling averages."""

    def __init__(self, window_size: int = 20):
        self.window_size = window_size
        self.speed_history: Dict[str, deque] = {}
        self.position_history: Dict[str, deque] = {}

    def haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two GPS coordinates in miles."""
        R = 3959  # Earth's radius in miles
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        return R * c

    def get_rolling_avg_speed(self, truck_id: str) -> float:
        """Get rolling average speed for a truck."""
        if truck_id not in self.speed_history or len(self.speed_history[truck_id]) == 0:
            return 55.0  # Default speed
        speeds = list(self.speed_history[truck_id])
        return sum(speeds) / len(speeds)

    def update(self, truck_id: str, lat: float, lon: float, speed: float, destination: str) -> Dict:
        """Update truck data and compute ETA."""
        # Update speed history
        if truck_id not in self.speed_history:
            self.speed_history[truck_id] = deque(maxlen=self.window_size)
        self.speed_history[truck_id].append(max(speed, 1.0))

        # Update position history
        if truck_id not in self.position_history:
            self.position_history[truck_id] = deque(maxlen=self.window_size)
        self.position_history[truck_id].append((lat, lon))

        # Calculate remaining distance
        dest_coords = DESTINATIONS.get(destination, (41.8781, -87.6298))
        remaining_distance = self.haversine_distance(lat, lon, dest_coords[0], dest_coords[1])

        # Calculate ETA
        avg_speed = self.get_rolling_avg_speed(truck_id)
        eta_hours = remaining_distance / max(avg_speed, 1.0)

        # Calculate progress
        if len(self.position_history[truck_id]) >= 2:
            first_pos = self.position_history[truck_id][0]
            total_dist = self.haversine_distance(first_pos[0], first_pos[1], dest_coords[0], dest_coords[1])
            progress = max(0, min(100, ((total_dist - remaining_distance) / max(total_dist, 1)) * 100))
        else:
            progress = 0

        # Speed trend
        speeds = list(self.speed_history[truck_id])
        if len(speeds) >= 5:
            recent = sum(speeds[-3:]) / 3
            earlier = sum(speeds[:3]) / 3
            speed_trend = "increasing" if recent > earlier * 1.05 else "decreasing" if recent < earlier * 0.95 else "stable"
        else:
            speed_trend = "stable"

        return {
            "truck_id": truck_id,
            "remaining_distance_miles": round(remaining_distance, 1),
            "rolling_avg_speed_mph": round(avg_speed, 1),
            "eta_hours": round(eta_hours, 2),
            "eta_minutes": round(eta_hours * 60, 0),
            "progress_percent": round(progress, 1),
            "speed_trend": speed_trend,
            "destination": destination,
            "dest_lat": dest_coords[0],
            "dest_lon": dest_coords[1],
        }

    def get_fleet_stats(self) -> Dict:
        """Get aggregate fleet statistics."""
        if not self.speed_history:
            return {"avg_fleet_speed": 0, "total_trucks": 0}

        all_speeds = []
        for speeds in self.speed_history.values():
            if speeds:
                all_speeds.append(sum(speeds) / len(speeds))

        return {
            "avg_fleet_speed": round(sum(all_speeds) / len(all_speeds), 1) if all_speeds else 0,
            "total_trucks": len(self.speed_history),
            "urban_avg_speed": round(min(all_speeds) if all_speeds else 0, 1),
            "interstate_avg_speed": round(max(all_speeds) if all_speeds else 0, 1),
        }
