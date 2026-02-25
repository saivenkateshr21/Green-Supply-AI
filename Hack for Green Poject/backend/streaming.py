"""
Real-Time Data Streaming Simulator
Simulates live truck GPS and sensor data every 2 seconds.
Uses asyncio for continuous streaming, mimicking Pathway's real-time data ingestion.
"""
import asyncio
import random
import math
import time
from datetime import datetime, timezone
from typing import Dict, List, Callable, Optional


# Truck routes: (origin_lat, origin_lon) -> (dest_lat, dest_lon)
TRUCK_ROUTES = {
    "T-102": {
        "origin": "Los Angeles",
        "destination": "Chicago",
        "origin_coords": (34.0522, -118.2437),
        "dest_coords": (41.8781, -87.6298),
        "driver": "Johnathan Carter",
        "driver_license": "CA-8291",
        "cargo": "Electronics",
        "fuel_level": 78,
    },
    "T-204": {
        "origin": "Phoenix",
        "destination": "Seattle",
        "origin_coords": (33.4484, -112.0740),
        "dest_coords": (47.6062, -122.3321),
        "driver": "Maria Santos",
        "driver_license": "AZ-4512",
        "cargo": "Vaccines (Cold Chain)",
        "fuel_level": 65,
    },
    "T-309": {
        "origin": "Dallas",
        "destination": "Denver",
        "origin_coords": (32.7767, -96.7970),
        "dest_coords": (39.7392, -104.9903),
        "driver": "James Wilson",
        "driver_license": "TX-7723",
        "cargo": "Auto Parts",
        "fuel_level": 82,
    },
    "T-405": {
        "origin": "New York",
        "destination": "Miami",
        "origin_coords": (40.7128, -74.0060),
        "dest_coords": (25.7617, -80.1918),
        "driver": "Aisha Brown",
        "driver_license": "NY-3341",
        "cargo": "Perishable Foods",
        "fuel_level": 55,
    },
    "T-501": {
        "origin": "Atlanta",
        "destination": "Charlotte",
        "origin_coords": (33.7490, -84.3880),
        "dest_coords": (35.2271, -80.8431),
        "driver": "Robert Kim",
        "driver_license": "GA-9102",
        "cargo": "Textiles",
        "fuel_level": 91,
    },
}

# Additional trucks for a more realistic fleet
TRUCK_ROUTES.update({
    "T-607": {
        "origin": "Houston",
        "destination": "Denver",
        "origin_coords": (29.7604, -95.3698),
        "dest_coords": (39.7392, -104.9903),
        "driver": "Carlos Rodriguez",
        "driver_license": "TX-1188",
        "cargo": "Petrochemicals",
        "fuel_level": 48,
    },
    "T-703": {
        "origin": "San Francisco",
        "destination": "Las Vegas",
        "origin_coords": (37.7749, -122.4194),
        "dest_coords": (36.1699, -115.1398),
        "driver": "Linda Wu",
        "driver_license": "CA-4492",
        "cargo": "Retail Goods",
        "fuel_level": 89,
    }
})


class TruckSimulator:
    """Simulates a single truck moving along its route."""

    def __init__(self, truck_id: str, config: Dict):
        self.truck_id = truck_id
        self.config = config
        self.progress = random.uniform(0.1, 0.6)  # Start at various points
        self.speed = random.uniform(55, 72)
        self.temperature = random.uniform(30, 36)
        self.fuel_level = config["fuel_level"]
        self.engine_load = random.uniform(40, 70)
        self.base_speed = random.uniform(60, 68)
        self.anomaly_timer = random.randint(20, 100)
        self.is_anomalous = False
        self.anomaly_duration = 0
        self.traffic_impact = 1.0

    def get_current_position(self) -> tuple:
        """Interpolate position between origin and destination."""
        o = self.config["origin_coords"]
        d = self.config["dest_coords"]
        # Use a non-linear progress for realism (slower near urban centers?)
        # For now, simple linear interpolation with slight jitter
        lat = o[0] + (d[0] - o[0]) * self.progress
        lon = o[1] + (d[1] - o[1]) * self.progress
        
        # Add slight random noise for realism
        lat += random.uniform(-0.005, 0.005)
        lon += random.uniform(-0.005, 0.005)
        return (round(lat, 6), round(lon, 6))

    def tick(self, global_traffic: float = 1.0) -> Dict:
        """Generate next data point."""
        self.traffic_impact = global_traffic
        
        # Progress calculations
        speed_factor = (self.speed * self.traffic_impact) / 70.0
        # Average distance covered in a tick (approx 0.01% of total route)
        self.progress += 0.0008 * speed_factor * random.uniform(0.9, 1.1)
        
        if self.progress >= 0.99:
            self.progress = 0.01
            self.fuel_level = 95.0 # Reset fuel on "arrival"

        # Anomaly management
        self.anomaly_timer -= 1
        if self.anomaly_timer <= 0 and not self.is_anomalous:
            self.is_anomalous = True
            self.anomaly_duration = random.randint(8, 20)
            self.anomaly_timer = random.randint(100, 300)

        if self.is_anomalous:
            self.anomaly_duration -= 1
            if self.anomaly_duration <= 0:
                self.is_anomalous = False

        # Speed simulation with traffic and anomalies
        current_base = self.base_speed * self.traffic_impact
        if self.is_anomalous:
            self.speed = max(10, self.speed - random.uniform(5, 15))
        else:
            self.speed += (current_base - self.speed) * 0.2 + random.uniform(-2, 2)
            
        self.speed = max(5, min(90, self.speed))

        # Temperature simulation
        if self.is_anomalous and self.config["cargo"] in ["Vaccines (Cold Chain)", "Perishable Foods"]:
            self.temperature += random.uniform(0.5, 2.0)
        else:
            target_temp = 33
            self.temperature += (target_temp - self.temperature) * 0.1 + random.uniform(-0.3, 0.3)

        # Fuel consumption
        self.fuel_level = max(5, self.fuel_level - random.uniform(0.01, 0.05))
        if self.fuel_level < 20:
            self.fuel_level = random.uniform(70, 95)  # Refueled

        # Engine load
        self.engine_load = 45 + (self.speed / 85) * 40 + random.uniform(-5, 5)
        self.engine_load = max(20, min(95, self.engine_load))

        lat, lon = self.get_current_position()

        return {
            "truck_id": self.truck_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "latitude": lat,
            "longitude": lon,
            "speed": round(self.speed, 1),
            "temperature": round(self.temperature, 1),
            "fuel_level": round(self.fuel_level, 1),
            "engine_load": round(self.engine_load, 1),
            "destination": self.config["destination"],
            "origin": self.config["origin"],
            "driver": self.config["driver"],
            "driver_license": self.config["driver_license"],
            "cargo": self.config["cargo"],
            "progress": round(self.progress * 100, 1),
        }


class StreamingEngine:
    """Manages all truck simulators and streams data."""

    def __init__(self):
        self.trucks: Dict[str, TruckSimulator] = {}
        self.running = False
        self._init_trucks()

    def _init_trucks(self):
        for truck_id, config in TRUCK_ROUTES.items():
            self.trucks[truck_id] = TruckSimulator(truck_id, config)

    def get_all_truck_data(self) -> List[Dict]:
        """Get current state of all trucks."""
        return [truck.tick() for truck in self.trucks.values()]

    async def stream(self, callback: Callable, interval: float = 2.5):
        """Continuously stream truck data at the given interval."""
        self.running = True
        while self.running:
            data = self.get_all_truck_data()
            await callback(data)
            await asyncio.sleep(interval)

    def stop(self):
        self.running = False

    def get_truck_info(self, truck_id: str) -> Optional[Dict]:
        """Get static info for a truck."""
        if truck_id in TRUCK_ROUTES:
            return TRUCK_ROUTES[truck_id]
        return None
