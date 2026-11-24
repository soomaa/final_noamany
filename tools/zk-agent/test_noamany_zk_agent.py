"""Tests for the agent against an in-process fake ZKTeco device and fake Noamany API.

    python -m unittest test_noamany_zk_agent -v
"""
import http.server
import json
import os
import shutil
import socket
import socketserver
import struct
import tempfile
import threading
import unittest
from datetime import datetime

import noamany_zk_agent as agent


def encode_time(dt):
    days = ((dt.year - 2000) * 12 + (dt.month - 1)) * 31 + (dt.day - 1)
    return struct.pack("<I", days * 86400 + dt.hour * 3600 + dt.minute * 60 + dt.second)


def record40(user_id, dt, state=0, verify=1):
    return struct.pack("<H24sB4sB8s", 1, user_id.encode(), verify, encode_time(dt), state, b"\x00" * 8)


class FakeDevice(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, comm_key, records):
        self.comm_key = comm_key
        self.records = records
        socketserver.ThreadingTCPServer.__init__(self, ("127.0.0.1", 0), FakeDeviceHandler)

    def attlog(self):
        body = b"".join(record40(*r) for r in self.records)
        return struct.pack("<I", len(body)) + body


class FakeDeviceHandler(socketserver.BaseRequestHandler):
    SESSION = 4321

    def frame(self, code, data=b""):
        payload = struct.pack("<4H", code, 0, self.SESSION, 0) + data
        self.request.sendall(struct.pack("<HHI", 0x5050, 0x7D82, len(payload)) + payload)

    def recv_exact(self, n):
        buf = b""
        while len(buf) < n:
            part = self.request.recv(n - len(buf))
            if not part:
                return None
            buf += part
        return buf

    def handle(self):
        authed = False
        buffer = b""
        while True:
            top = self.recv_exact(8)
            if top is None:
                return
            length = struct.unpack("<HHI", top)[2]
            payload = self.recv_exact(length)
            cmd = struct.unpack("<4H", payload[:8])[0]
            data = payload[8:]
            if cmd == agent.CMD_CONNECT:
                self.frame(agent.CMD_ACK_UNAUTH)
            elif cmd == agent.CMD_AUTH:
                authed = data == agent.make_commkey(self.server.comm_key, self.SESSION)
                self.frame(agent.CMD_ACK_OK if authed else 2001)
            elif not authed:
                self.frame(agent.CMD_ACK_UNAUTH)
            elif cmd == agent.CMD_GET_TIME:
                self.frame(agent.CMD_ACK_OK, encode_time(datetime.now()))
            elif cmd == agent.CMD_GET_FREE_SIZES:
                f = [0] * 20
                f[8] = len(self.server.records)
                self.frame(agent.CMD_ACK_OK, struct.pack("<20i", *f) + b"\x00" * 12)
            elif cmd == agent.CMD_PREPARE_BUFFER:
                buffer = self.server.attlog()
                # Force the chunked path the real device uses for big logs.
                self.frame(agent.CMD_ACK_OK, b"\x00" + struct.pack("<I", len(buffer)) + b"\x00" * 4)
            elif cmd == agent.CMD_READ_BUFFER:
                start, size = struct.unpack("<ii", data)
                chunk = buffer[start:start + size]
                self.frame(agent.CMD_PREPARE_DATA, struct.pack("<I", len(chunk)))
                half = len(chunk) // 2
                self.frame(agent.CMD_DATA, chunk[:half])
                self.frame(agent.CMD_DATA, chunk[half:])
                self.frame(agent.CMD_ACK_OK)
            else:  # FREE_DATA, EXIT, ...
                self.frame(agent.CMD_ACK_OK)
                if cmd == agent.CMD_EXIT:
                    return


class FakeNoamany(http.server.HTTPServer):
    def __init__(self, token, retry_user=None):
        self.token = token
        self.retry_user = retry_user
        self.batches = []
        self.seen = set()
        http.server.HTTPServer.__init__(self, ("127.0.0.1", 0), FakeNoamanyHandler)


class FakeNoamanyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path != "/api/attendance/device-agent/punches" or self.headers.get("X-Agent-Token") != self.server.token:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"message":"bad token"}')
            return
        self.server.batches.append(body)
        results = []
        for p in body["punches"]:
            key = (p["userId"], p["time"])
            if p["userId"] == self.server.retry_user:
                status = "retry"
            elif key in self.server.seen:
                status = "duplicate"
            else:
                status = "applied"
                self.server.seen.add(key)
            results.append({"userId": p["userId"], "time": p["time"], "status": status})
        out = json.dumps({"applied": sum(r["status"] == "applied" for r in results), "results": results}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)


def serve(server):
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


class ProtocolTests(unittest.TestCase):
    def test_time_round_trip(self):
        dt = datetime(2026, 11, 24, 12, 48, 5)
        self.assertEqual(agent.decode_time(encode_time(dt)), dt)

    def test_commkey_is_four_bytes_and_depends_on_key(self):
        self.assertEqual(len(agent.make_commkey(123456, 4321)), 4)
        self.assertNotEqual(agent.make_commkey(1, 4321), agent.make_commkey(2, 4321))

    def test_parse_16_byte_records(self):
        rec = struct.pack("<I4sBB2sI", 77, encode_time(datetime(2026, 1, 2, 3, 4, 5)), 1, 0, b"\0\0", 0)
        rows = agent.parse_attendance(struct.pack("<I", 16) + rec, 1)
        self.assertEqual(rows, [("77", datetime(2026, 1, 2, 3, 4, 5), 0, 1)])

    def test_parse_8_byte_records_maps_uid_to_user_id(self):
        rec = struct.pack("<HB4sB", 3, 1, encode_time(datetime(2026, 1, 2, 3, 4, 5)), 1)
        rows = agent.parse_attendance(struct.pack("<I", 8) + rec, 1, {3: "1008"})
        self.assertEqual(rows[0][0], "1008")

    def test_reads_chunked_log_with_comm_key(self):
        when = datetime(2026, 11, 24, 8, 0, 0)
        dev = serve(FakeDevice(123456, [("15", when, 0, 1), ("1008", when.replace(minute=5), 1, 15)]))
        try:
            with agent.ZKClient("127.0.0.1", dev.server_address[1], 123456) as zk:
                rows = zk.attendance()
        finally:
            dev.shutdown(); dev.server_close()
        self.assertEqual([(r[0], r[1].minute, r[2], r[3]) for r in rows], [("15", 0, 0, 1), ("1008", 5, 1, 15)])

    def test_wrong_comm_key_is_reported(self):
        dev = serve(FakeDevice(123456, []))
        try:
            with self.assertRaises(agent.ZKError):
                agent.ZKClient("127.0.0.1", dev.server_address[1], 999).connect()
        finally:
            dev.shutdown(); dev.server_close()


class AdvanceTests(unittest.TestCase):
    def test_stops_before_first_retry(self):
        sent = [{"userId": "1", "time": "2026-11-24 08:00:00"},
                {"userId": "2", "time": "2026-11-24 08:01:00"},
                {"userId": "3", "time": "2026-11-24 08:02:00"}]
        results = [{"userId": "1", "time": sent[0]["time"], "status": "applied"},
                   {"userId": "2", "time": sent[1]["time"], "status": "retry"},
                   {"userId": "3", "time": sent[2]["time"], "status": "applied"}]
        cursor, done, complete = agent.advance("2026-11-24 07:00:00", set(), sent, results)
        self.assertEqual((cursor, done, complete), ("2026-11-24 08:00:00", {"1|2026-11-24 08:00:00"}, False))


class EndToEndTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def config(self, dev, api, start_from):
        path = os.path.join(self.tmp, "config.ini")
        with open(path, "w") as fh:
            fh.write("[device]\nip=127.0.0.1\nport=%d\ncomm_key=123456\n" % dev.server_address[1])
            fh.write("[noamany]\napi_url=http://127.0.0.1:%d/api\ndevice_id=1\ntoken=secret-token\n" % api.server_address[1])
            fh.write("[agent]\nstart_from=%s\n" % start_from)
        return agent.Config(path)

    def test_sends_only_new_punches_and_never_resends(self):
        old = datetime(2026, 11, 1, 9, 0, 0)
        new1 = datetime(2026, 11, 24, 8, 0, 0)
        new2 = datetime(2026, 11, 24, 8, 0, 0)  # two people in the same second
        dev = serve(FakeDevice(123456, [("15", old), ("15", new1), ("16", new2)]))
        api = serve(FakeNoamany("secret-token"))
        try:
            cfg = self.config(dev, api, "2026-11-20 00:00:00")
            agent.sync_once(cfg)
            agent.sync_once(cfg)  # nothing new: must not post again
            dev.records.append(("15", datetime(2026, 11, 24, 17, 0, 0)))
            agent.sync_once(cfg)
        finally:
            dev.shutdown(); dev.server_close()
            api.shutdown(); api.server_close()
        sent = [[(p["userId"], p["time"]) for p in b["punches"]] for b in api.batches]
        self.assertEqual(sent, [
            [("15", "2026-11-24 08:00:00"), ("16", "2026-11-24 08:00:00")],
            [("15", "2026-11-24 17:00:00")],
        ])

    def test_retry_keeps_punch_for_next_cycle(self):
        when = datetime(2026, 11, 24, 8, 0, 0)
        dev = serve(FakeDevice(123456, [("15", when)]))
        api = serve(FakeNoamany("secret-token", retry_user="15"))
        try:
            cfg = self.config(dev, api, "2026-11-20 00:00:00")
            agent.sync_once(cfg)
            api.retry_user = None
            agent.sync_once(cfg)
        finally:
            dev.shutdown(); dev.server_close()
            api.shutdown(); api.server_close()
        self.assertEqual(len(api.batches), 2)
        self.assertIn(("15", "2026-11-24 08:00:00"), api.seen)


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_setup_retries_wrong_key_saves_answers_and_keeps_comments(self):
        dev = serve(FakeDevice(123456, []))
        api = serve(FakeNoamany("secret-token"))
        path = os.path.join(self.tmp, "config.ini")
        with open(path, "w") as fh:
            fh.write("[device]\n; keep me\nip = 127.0.0.1\nport = %d\ncomm_key = 0\n" % dev.server_address[1])
            fh.write("[noamany]\napi_url = http://127.0.0.1:%d/api\ndevice_id =\ntoken = secret-token\n" % api.server_address[1])
        answers = iter(["999", "123456", "7"])
        original_input = agent.input if hasattr(agent, "input") else None
        agent.input = lambda prompt="": next(answers)
        os.environ["APPDATA"] = self.tmp
        os.makedirs(os.path.join(self.tmp, "Microsoft", "Windows", "Start Menu", "Programs", "Startup"))
        try:
            self.assertEqual(agent.setup(path), 0)
        finally:
            del agent.input
            dev.shutdown(); dev.server_close()
            api.shutdown(); api.server_close()
        cfg = agent.Config(path)
        self.assertEqual((cfg.comm_key, cfg.device_id), (123456, 7))
        self.assertIn("; keep me", open(path).read())
        self.assertEqual(api.batches, [{"deviceId": 7, "punches": []}])
        startup = os.path.join(self.tmp, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "noamany-zk-agent.bat")
        self.assertIn("run-agent.bat", open(startup).read())


if __name__ == "__main__":
    unittest.main()
