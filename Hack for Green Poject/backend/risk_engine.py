"""
Risk Scoring Engine
Calculates dynamic risk scores for trucks and the overall supply chain.
"""
from typing import Dict, List


class RiskEngine:
    """Dynamic risk scoring for supply chain operations."""

    # Weights for risk factors
    WEIGHTS = {
        "delay": 0.30,
        "temperature": 0.25,
        "speed": 0.25,
        "deviation": 0.20,
    }

    def __init__(self):
        self.truck_risk_history: Dict[str, List[float]] = {}

    def calculate_risk(self, truck_data: Dict, ml_result: Dict, alerts: List[Dict]) -> Dict:
        """Calculate risk score for a truck (0-100)."""
        truck_id = truck_data["truck_id"]
        speed = truck_data["speed"]
        temp = truck_data["temperature"]

        # Delay risk (0-100)
        eta_hours = ml_result.get("eta_hours", 0)
        delay_risk = min(100, max(0, (eta_hours - 4) * 15))  # Risk grows as ETA exceeds 4 hours

        # Temperature risk (0-100)
        temp_risk = 0
        if temp > 38:
            temp_risk = min(100, (temp - 38) * 20)
        elif temp < 28:
            temp_risk = min(100, (28 - temp) * 20)

        # Speed risk (0-100)
        avg_speed = ml_result.get("rolling_avg_speed_mph", 55)
        speed_risk = 0
        if speed < 20:
            speed_risk = 80
        elif speed < 35:
            speed_risk = 50
        elif abs(speed - avg_speed) > 20:
            speed_risk = 40

        # Deviation risk from alerts (0-100)
        deviation_risk = 0
        for alert in alerts:
            if alert.get("type") == "route_deviation":
                deviation_risk = min(100, alert.get("value", 0) * 15)
            if alert.get("type") == "hard_braking":
                deviation_risk = max(deviation_risk, 70)

        # Weighted composite score
        total_risk = (
            self.WEIGHTS["delay"] * delay_risk +
            self.WEIGHTS["temperature"] * temp_risk +
            self.WEIGHTS["speed"] * speed_risk +
            self.WEIGHTS["deviation"] * deviation_risk
        )
        total_risk = round(min(100, max(0, total_risk)), 1)

        # Determine level
        if total_risk >= 75:
            level = "CRITICAL"
        elif total_risk >= 50:
            level = "HIGH"
        elif total_risk >= 25:
            level = "MEDIUM"
        else:
            level = "LOW"

        # Track history
        if truck_id not in self.truck_risk_history:
            self.truck_risk_history[truck_id] = []
        self.truck_risk_history[truck_id].append(total_risk)
        if len(self.truck_risk_history[truck_id]) > 50:
            self.truck_risk_history[truck_id] = self.truck_risk_history[truck_id][-50:]

        return {
            "truck_id": truck_id,
            "risk_score": total_risk,
            "risk_level": level,
            "breakdown": {
                "delay_risk": round(delay_risk, 1),
                "temperature_risk": round(temp_risk, 1),
                "speed_risk": round(speed_risk, 1),
                "deviation_risk": round(deviation_risk, 1),
            },
            "explanation": self._explain_risk(level, delay_risk, temp_risk, speed_risk, deviation_risk, truck_id),
        }

    def _explain_risk(self, level, delay, temp, speed, deviation, truck_id) -> str:
        factors = []
        if delay > 30:
            factors.append(f"significant delivery delay (risk: {delay:.0f}%)")
        if temp > 30:
            factors.append(f"temperature abnormality (risk: {temp:.0f}%)")
        if speed > 30:
            factors.append(f"speed inconsistency (risk: {speed:.0f}%)")
        if deviation > 30:
            factors.append(f"route deviation detected (risk: {deviation:.0f}%)")

        if not factors:
            return f"{truck_id} is operating within normal parameters."

        return f"{truck_id} risk is {level} due to: {', '.join(factors)}."

    def get_fleet_risk(self) -> Dict:
        """Calculate overall fleet risk index."""
        if not self.truck_risk_history:
            return {"overall_score": 0, "overall_level": "LOW", "high_risk_count": 0}

        latest_scores = []
        high_risk = 0
        critical_count = 0
        for truck_id, history in self.truck_risk_history.items():
            if history:
                score = history[-1]
                latest_scores.append(score)
                if score >= 50:
                    high_risk += 1
                if score >= 75:
                    critical_count += 1

        avg_score = sum(latest_scores) / len(latest_scores) if latest_scores else 0

        if avg_score >= 60:
            level = "HIGH"
        elif avg_score >= 35:
            level = "MEDIUM"
        else:
            level = "LOW"

        return {
            "overall_score": round(avg_score, 1),
            "overall_level": level,
            "high_risk_count": high_risk,
            "critical_count": critical_count,
            "total_trucks": len(latest_scores),
        }
