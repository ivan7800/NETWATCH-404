"""Reject malformed persisted monitor history while keeping the local server bootable."""
import json, tempfile
from pathlib import Path
import server
previous = server.MONITOR_FILE
original = (list(server.MONITOR["events"]), list(server.MONITOR["samples"]))
try:
    with tempfile.TemporaryDirectory() as folder:
        server.MONITOR_FILE = Path(folder) / "monitor.json"
        for payload in ({"events": None, "samples": 1}, {"events": {"bad": 1}, "samples": "oops"}, {"events": [None, {}, "bad"], "samples": [True, {"at": "ok"}]}):
            server.MONITOR_FILE.write_text(json.dumps(payload), encoding="utf-8")
            server.monitor_load()
            assert isinstance(server.MONITOR["events"], list)
            assert isinstance(server.MONITOR["samples"], list)
            assert all(isinstance(x, dict) for x in server.MONITOR["events"] + server.MONITOR["samples"])
    print("PASS monitor malformed history (3 cases)")
finally:
    server.MONITOR_FILE = previous
    server.MONITOR["events"], server.MONITOR["samples"] = original
