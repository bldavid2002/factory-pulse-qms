from __future__ import annotations

import asyncio
import os
import random
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel


HISTORY_LIMIT = 90
INCIDENT_LIMIT = 50
STATION_CONFIG = (
	("welding", "Welding Robot", 72.0, 0.8),
	("paint", "Paint Booth", 31.0, 0.45),
	("assembly", "Assembly Line", 39.0, 1.2),
)
FAULT_NAMES = {"hardware", "latency", "outage"}


def utc_now() -> str:
	return datetime.now(timezone.utc).isoformat()


class FactorySimulator:
	def __init__(self) -> None:
		self.stations: dict[str, dict[str, Any]] = {
			key: {
				"id": key,
				"name": name,
				"temperature": base_temp,
				"vibration": base_vibration,
				"parts": 0,
				"status": "running",
			}
			for key, name, base_temp, base_vibration in STATION_CONFIG
		}
		self.history: deque[dict[str, Any]] = deque(maxlen=HISTORY_LIMIT)
		self.incidents: deque[dict[str, Any]] = deque(maxlen=INCIDENT_LIMIT)
		self.faults = {name: False for name in FAULT_NAMES}
		self._last_status = {key: "running" for key, *_ in STATION_CONFIG}
		self._ticks = 0

	def _incident(self, message: str, severity: str) -> None:
		self.incidents.appendleft({"time": utc_now(), "message": message, "severity": severity})

	def tick(self) -> dict[str, Any]:
		self._ticks += 1
		timestamp = utc_now()
		sample: dict[str, Any] = {"time": timestamp}

		for key, name, base_temp, base_vibration in STATION_CONFIG:
			station = self.stations[key]
			temperature = base_temp + random.uniform(-2.5, 2.5)
			vibration = max(0.1, base_vibration + random.uniform(-0.25, 0.35))
			if key == "welding" and self.faults["hardware"]:
				temperature = 108 + random.uniform(0, 8)
			elif key == "welding" and self._ticks % 37 == 0:
				temperature = 86 + random.uniform(0, 2)
			station["temperature"] = round(temperature, 1)
			station["vibration"] = round(vibration, 2)
			station["parts"] += random.choice((0, 1, 1, 1, 2))

			if temperature >= 100:
				status = "critical"
			elif temperature >= 85 or vibration >= 7.5:
				status = "warning"
			else:
				status = "running"
			station["status"] = status
			if status != self._last_status[key]:
				severity = "critical" if status == "critical" else "warning" if status == "warning" else "resolved"
				self._incident(f"{name} status changed to {status}", severity)
				self._last_status[key] = status

			sample[f"{key}Temperature"] = station["temperature"]
			sample[f"{key}Vibration"] = station["vibration"]
			sample[f"{key}Parts"] = station["parts"]

		self.history.append(sample)
		return sample

	def set_fault(self, name: str, enabled: bool) -> None:
		if name not in FAULT_NAMES:
			raise ValueError(f"Unknown fault: {name}")
		if self.faults[name] == enabled:
			return
		self.faults[name] = enabled
		label = {"hardware": "Welding robot thermal fault", "latency": "API latency injection", "outage": "30% request failure injection"}[name]
		self._incident(f"{label} {'enabled' if enabled else 'disabled'}", "warning" if enabled else "resolved")

	def snapshot(self) -> dict[str, Any]:
		return {
			"generatedAt": utc_now(),
			"stations": list(self.stations.values()),
			"history": list(self.history),
			"incidents": list(self.incidents),
			"faults": self.faults.copy(),
		}

	async def run(self) -> None:
		while True:
			await asyncio.sleep(1)
			self.tick()


simulator = FactorySimulator()


@asynccontextmanager
async def lifespan(_: FastAPI):
	simulator.tick()
	task = asyncio.create_task(simulator.run())
	try:
		yield
	finally:
		task.cancel()
		try:
			await task
		except asyncio.CancelledError:
			pass


app = FastAPI(title="FactoryPulse API", version="1.0.0", lifespan=lifespan)
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(
	CORSMiddleware,
	allow_origins=origins,
	allow_credentials=True,
	allow_methods=["GET", "POST"],
	allow_headers=["Content-Type"],
)


class FaultRequest(BaseModel):
	enabled: bool


@app.middleware("http")
async def chaos_middleware(request: Request, call_next):
	path = request.url.path
	if path.startswith("/api/") and path not in {"/api/health"}:
		if simulator.faults["latency"]:
			await asyncio.sleep(2)
		if simulator.faults["outage"] and not path.startswith("/api/faults/") and random.random() < 0.3:
			return JSONResponse(status_code=500, content={"detail": "Injected service outage"})
	return await call_next(request)


@app.get("/api/health")
async def health() -> dict[str, str]:
	return {"status": "ok", "service": "factorypulse-api"}


@app.get("/api/state")
async def state() -> dict[str, Any]:
	return simulator.snapshot()


@app.post("/api/faults/{fault_name}")
async def toggle_fault(fault_name: str, payload: FaultRequest) -> dict[str, Any]:
	try:
		simulator.set_fault(fault_name, payload.enabled)
	except ValueError as error:
		raise HTTPException(status_code=404, detail=str(error)) from error
	return simulator.snapshot()
