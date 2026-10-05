import unittest

from main import FactorySimulator, HISTORY_LIMIT


class FactorySimulatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.simulator = FactorySimulator()

    def test_hardware_fault_drives_welding_station_critical(self) -> None:
        self.simulator.set_fault("hardware", True)

        self.simulator.tick()

        welding = next(station for station in self.simulator.snapshot()["stations"] if station["id"] == "welding")
        self.assertGreaterEqual(welding["temperature"], 100)
        self.assertEqual(welding["status"], "critical")

    def test_disabling_hardware_fault_returns_station_to_running(self) -> None:
        self.simulator.set_fault("hardware", True)
        self.simulator.tick()
        self.simulator.set_fault("hardware", False)

        self.simulator.tick()

        welding = next(station for station in self.simulator.snapshot()["stations"] if station["id"] == "welding")
        self.assertEqual(welding["status"], "running")
        self.assertEqual(self.simulator.snapshot()["incidents"][0]["severity"], "resolved")

    def test_normal_load_spike_enters_warning_state(self) -> None:
        for _ in range(37):
            self.simulator.tick()

        welding = next(station for station in self.simulator.snapshot()["stations"] if station["id"] == "welding")
        self.assertEqual(welding["status"], "warning")
        self.assertGreaterEqual(welding["temperature"], 85)

    def test_history_is_bounded_and_contains_all_stations(self) -> None:
        for _ in range(HISTORY_LIMIT + 5):
            self.simulator.tick()

        history = self.simulator.snapshot()["history"]
        self.assertEqual(len(history), HISTORY_LIMIT)
        self.assertIn("weldingTemperature", history[-1])
        self.assertIn("paintVibration", history[-1])
        self.assertIn("assemblyParts", history[-1])


if __name__ == "__main__":
    unittest.main()