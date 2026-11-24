#!/usr/bin/env python3
"""
Noamany fingerprint agent.

Runs on a PC inside the gym network, reads punches from a ZKTeco device over its
standard TCP protocol (port 4370) and pushes them to Noamany:
    POST {api_url}/attendance/device-agent/punches   (header X-Agent-Token)

Standard library only, compatible with Python 3.8 (last release for Windows 7).

    python noamany_zk_agent.py --check     # talk to the device only, print what it has
    python noamany_zk_agent.py --once      # one sync cycle
    python noamany_zk_agent.py             # sync forever every interval_seconds
"""
import argparse
import configparser
import json
import logging
import logging.handlers
import os
import socket
import ssl
import struct
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

VERSION = "1.0.0"
TIME_FMT = "%Y-%m-%d %H:%M:%S"
BATCH_SIZE = 200

# ---------------------------------------------------------------------------
# ZK protocol (TCP framing; same wire format the vendor software uses)
# ---------------------------------------------------------------------------
USHRT_MAX = 65535
TCP_MAGIC = (0x5050, 0x7D82)

CMD_CONNECT = 1000
CMD_EXIT = 1001
CMD_AUTH = 1102
CMD_GET_VERSION = 1100
CMD_OPTIONS_RRQ = 11
CMD_GET_FREE_SIZES = 50
CMD_GET_TIME = 201
CMD_USERTEMP_RRQ = 9
CMD_ATTLOG_RRQ = 13
CMD_PREPARE_DATA = 1500
CMD_DATA = 1501
CMD_FREE_DATA = 1502
CMD_PREPARE_BUFFER = 1503
CMD_READ_BUFFER = 1504
CMD_REG_EVENT = 500
CMD_ACK_OK = 2000
CMD_ACK_UNAUTH = 2005
FCT_USER = 5
MAX_CHUNK = 0xFFC0


class ZKError(Exception):
    pass


def zk_checksum(buf):
    total = 0
    length = len(buf)
    i = 0
    while length > 1:
        total += buf[i] | (buf[i + 1] << 8)
        if total > USHRT_MAX:
            total -= USHRT_MAX
        i += 2
        length -= 2
    if length:
        total += buf[-1]
    while total > USHRT_MAX:
        total -= USHRT_MAX
    total = ~total
    while total < 0:
        total += USHRT_MAX
    return total


def make_commkey(key, session_id, ticks=50):
    """Scrambles the numeric Comm Key with the session id, as the device expects."""
    key = int(key)
    k = 0
    for i in range(32):
        k = (k << 1 | 1) if key & (1 << i) else k << 1
    k = (k + int(session_id)) & 0xFFFFFFFF
    b = struct.unpack("BBBB", struct.pack("<I", k))
    b = struct.pack("BBBB", b[0] ^ ord("Z"), b[1] ^ ord("K"), b[2] ^ ord("S"), b[3] ^ ord("O"))
    h = struct.unpack("<HH", b)
    b = struct.unpack("BBBB", struct.pack("<HH", h[1], h[0]))
    t = 0xFF & ticks
    return struct.pack("BBBB", b[0] ^ t, b[1] ^ t, t, b[3] ^ t)


def decode_time(raw):
    t = struct.unpack("<I", raw)[0]
    second = t % 60
    t //= 60
    minute = t % 60
    t //= 60
    hour = t % 24
    t //= 24
    day = t % 31 + 1
    t //= 31
    month = t % 12 + 1
    t //= 12
    return datetime(t + 2000, month, day, hour, minute, second)


def _cstr(raw):
    return raw.split(b"\x00")[0].decode("utf-8", "ignore").strip()


def parse_users(data, user_count):
    """Maps the device's internal uid -> visible user id ("AC No")."""
    users = {}
    if user_count <= 0 or len(data) < 4:
        return users
    total = struct.unpack("<I", data[:4])[0]
    body = data[4:4 + total]
    size = total // user_count if user_count else 0
    if size not in (28, 72):
        size = 72 if total % 72 == 0 else 28
    for off in range(0, len(body) - size + 1, size):
        rec = body[off:off + size]
        if size == 28:
            uid = struct.unpack("<H", rec[:2])[0]
            user_id = str(struct.unpack("<I", rec[24:28])[0])
        else:
            uid = struct.unpack("<H", rec[:2])[0]
            user_id = _cstr(rec[48:72])
        users[uid] = user_id
    return users


def parse_attendance(data, record_count, users=None):
    """Returns [(user_id, datetime, state, verify)] for 8/16/40-byte record layouts."""
    if record_count <= 0 or len(data) < 4:
        return []
    total = struct.unpack("<I", data[:4])[0]
    body = data[4:4 + total]
    size = total // record_count
    if size not in (8, 16, 40):
        raise ZKError("Unknown attendance record size %d (total %d / %d)" % (size, total, record_count))
    out = []
    for off in range(0, len(body) - size + 1, size):
        rec = body[off:off + size]
        if size == 8:
            uid, verify, ts, state = struct.unpack("<HB4sB", rec)
            user_id = (users or {}).get(uid, str(uid))
        elif size == 16:
            uid_num, ts, verify, state, _r, _w = struct.unpack("<I4sBB2sI", rec)
            user_id = str(uid_num)
        else:
            _uid, raw_id, verify, ts, state, _r = struct.unpack("<H24sB4sB8s", rec)
            user_id = _cstr(raw_id)
        try:
            when = decode_time(ts)
        except ValueError:
            continue  # corrupt/empty slot
        out.append((user_id, when, state, verify))
    return out


class ZKClient(object):
    def __init__(self, ip, port=4370, comm_key=0, timeout=15):
        self.ip = ip
        self.port = int(port)
        self.comm_key = int(comm_key or 0)
        self.timeout = timeout
        self.sock = None
        self.session = 0
        self.reply = USHRT_MAX - 1

    # -- framing --
    def _recv_exact(self, n):
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ZKError("Device closed the connection")
            buf += chunk
        return bytes(buf)

    def _send(self, command, data=b""):
        head = struct.pack("<4H", command, 0, self.session, self.reply) + data
        chk = zk_checksum(head)
        self.reply += 1
        if self.reply >= USHRT_MAX:
            self.reply -= USHRT_MAX
        packet = struct.pack("<4H", command, chk, self.session, self.reply) + data
        self.sock.sendall(struct.pack("<HHI", TCP_MAGIC[0], TCP_MAGIC[1], len(packet)) + packet)

    def _recv(self):
        while True:
            m1, m2, length = struct.unpack("<HHI", self._recv_exact(8))
            if (m1, m2) != TCP_MAGIC or length < 8:
                raise ZKError("Bad frame from device")
            payload = self._recv_exact(length)
            code, _chk, session, _reply = struct.unpack("<4H", payload[:8])
            if code == CMD_REG_EVENT:
                continue  # live event we did not ask for
            return code, session, payload[8:]

    def _cmd(self, command, data=b""):
        self._send(command, data)
        return self._recv()

    # -- session --
    def connect(self):
        self.sock = socket.create_connection((self.ip, self.port), timeout=self.timeout)
        self.session = 0
        self.reply = USHRT_MAX - 1
        code, session, _ = self._cmd(CMD_CONNECT)
        self.session = session
        if code == CMD_ACK_UNAUTH:
            code, _, _ = self._cmd(CMD_AUTH, make_commkey(self.comm_key, self.session))
            if code != CMD_ACK_OK:
                self.close()
                raise ZKError("Device rejected the Comm Key (check [device] comm_key)")
        elif code != CMD_ACK_OK:
            self.close()
            raise ZKError("Device refused connection (code %d)" % code)

    def close(self):
        if self.sock is None:
            return
        try:
            self._cmd(CMD_EXIT)
        except Exception:
            pass
        try:
            self.sock.close()
        finally:
            self.sock = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *exc):
        self.close()

    # -- reads --
    def option(self, name):
        code, _, data = self._cmd(CMD_OPTIONS_RRQ, name.encode() + b"\x00")
        if code != CMD_ACK_OK:
            return ""
        text = _cstr(data)
        return text.split("=", 1)[1] if "=" in text else text

    def firmware(self):
        code, _, data = self._cmd(CMD_GET_VERSION)
        return _cstr(data) if code == CMD_ACK_OK else ""

    def device_time(self):
        code, _, data = self._cmd(CMD_GET_TIME)
        if code != CMD_ACK_OK or len(data) < 4:
            return None
        return decode_time(data[:4])

    def sizes(self):
        code, _, data = self._cmd(CMD_GET_FREE_SIZES)
        if code != CMD_ACK_OK or len(data) < 80:
            raise ZKError("Could not read record counts")
        f = struct.unpack("<20i", data[:80])
        return {"users": f[4], "fingers": f[6], "records": f[8]}

    def _read_chunk(self, start, size):
        self._send(CMD_READ_BUFFER, struct.pack("<ii", start, size))
        code, _, data = self._recv()
        if code == CMD_DATA:
            return data
        if code != CMD_PREPARE_DATA:
            raise ZKError("Unexpected reply %d while reading data" % code)
        total = struct.unpack("<I", data[:4])[0]
        buf = bytearray()
        while len(buf) < total:
            code, _, part = self._recv()
            if code != CMD_DATA:
                raise ZKError("Unexpected reply %d inside data stream" % code)
            buf += part
        code, _, _ = self._recv()
        if code != CMD_ACK_OK:
            raise ZKError("Data stream not acknowledged (%d)" % code)
        return bytes(buf[:total])

    def read_buffer(self, command, fct=0, ext=0):
        code, _, data = self._cmd(CMD_PREPARE_BUFFER, struct.pack("<bhii", 1, command, fct, ext))
        if code == CMD_DATA:
            return data
        if code != CMD_ACK_OK or len(data) < 5:
            raise ZKError("Device refused buffered read (%d)" % code)
        size = struct.unpack("<I", data[1:5])[0]
        out = bytearray()
        start = 0
        while start < size:
            n = min(MAX_CHUNK, size - start)
            out += self._read_chunk(start, n)
            start += n
        self._cmd(CMD_FREE_DATA)
        return bytes(out)

    def attendance(self):
        counts = self.sizes()
        if counts["records"] <= 0:
            return []
        data = self.read_buffer(CMD_ATTLOG_RRQ)
        total = struct.unpack("<I", data[:4])[0] if len(data) >= 4 else 0
        users = None
        if total and total // counts["records"] == 8:
            users = parse_users(self.read_buffer(CMD_USERTEMP_RRQ, FCT_USER), counts["users"])
        return parse_attendance(data, counts["records"], users)


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
log = logging.getLogger("noamany-zk")


class Config(object):
    def __init__(self, path):
        cp = configparser.ConfigParser()
        if not cp.read(path, encoding="utf-8"):
            raise SystemExit("Config file not found: %s (copy config.example.ini to config.ini)" % path)
        base = os.path.dirname(os.path.abspath(path))

        def num(section, key, default):
            raw = cp.get(section, key, fallback="").strip()
            if not raw:
                return default
            try:
                return int(raw)
            except ValueError:
                raise SystemExit("[%s] %s must be a number, got %r" % (section, key, raw))

        self.ip = cp.get("device", "ip")
        self.port = num("device", "port", 4370)
        self.comm_key = num("device", "comm_key", 0)
        self.api_url = cp.get("noamany", "api_url", fallback="").rstrip("/")
        self.device_id = num("noamany", "device_id", 0)
        self.token = cp.get("noamany", "token", fallback="").strip()
        ca_file = cp.get("noamany", "ca_file", fallback="").strip()
        self.ca_file = os.path.join(base, ca_file) if ca_file else ""
        self.bundled_ca = os.path.join(os.path.dirname(os.path.abspath(__file__)), "isrg-root-x1.pem")
        self.interval = max(15, num("agent", "interval_seconds", 60))
        self.start_from = cp.get("agent", "start_from", fallback="").strip()
        self.state_file = os.path.join(base, cp.get("agent", "state_file", fallback="state.json"))
        self.log_file = os.path.join(base, cp.get("agent", "log_file", fallback="agent.log"))


def punch_key(p):
    return "%s|%s" % (p["userId"], p["time"])


def load_state(cfg):
    """(cursor, keys already settled at exactly the cursor second)."""
    try:
        with open(cfg.state_file, "r", encoding="utf-8") as fh:
            state = json.load(fh)
        return state["cursor"], set(state.get("done_at_cursor", []))
    except (IOError, OSError, ValueError, KeyError):
        pass
    if cfg.start_from:
        datetime.strptime(cfg.start_from, TIME_FMT)  # validate
        return cfg.start_from, set()
    # First run without start_from: only punches from now on, never the whole history.
    return datetime.now().strftime(TIME_FMT), set()


def save_state(cfg, cursor, done_at_cursor):
    tmp = cfg.state_file + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({
            "cursor": cursor,
            "done_at_cursor": sorted(done_at_cursor),
            "saved_at": datetime.now().strftime(TIME_FMT),
        }, fh)
    os.replace(tmp, cfg.state_file)


def post_batch(cfg, punches):
    body = json.dumps({"deviceId": cfg.device_id, "punches": punches}).encode("utf-8")
    req = urllib.request.Request(
        cfg.api_url + "/attendance/device-agent/punches",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Agent-Token": cfg.token,
            "User-Agent": "noamany-zk-agent/" + VERSION,
        },
        method="POST",
    )
    # Windows' own roots plus the bundled Let's Encrypt root: old Windows 7 often lacks it
    # and Python, unlike browsers, never downloads missing roots on demand.
    ctx = ssl.create_default_context()
    for extra in (cfg.ca_file, cfg.bundled_ca):
        if extra and os.path.isfile(extra):
            ctx.load_verify_locations(cafile=extra)
    try:
        with urllib.request.urlopen(req, timeout=90, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "ignore")[:300]
        raise RuntimeError("Noamany answered HTTP %d: %s" % (err.code, detail))


def advance(cursor, done, sent, results):
    """Move the cursor over every punch the server settled, stopping at the first 'retry'.

    Returns (cursor, done_at_cursor, complete). Punches sharing the cursor second are
    remembered by key so they are not sent again; the server would skip them anyway.
    """
    status = {}
    for r in results:
        status.setdefault("%s|%s" % (r.get("userId"), r.get("time")), r.get("status"))
    for p in sent:  # sent is sorted by time
        if status.get(punch_key(p)) == "retry":
            return cursor, done, False
        if p["time"] != cursor:
            cursor, done = p["time"], set()
        done.add(punch_key(p))
    return cursor, done, True


def sync_once(cfg):
    cursor, done = load_state(cfg)
    with ZKClient(cfg.ip, cfg.port, cfg.comm_key) as zk:
        dev_time = zk.device_time()
        records = zk.attendance()
    if dev_time is not None:
        drift = abs((datetime.now() - dev_time).total_seconds())
        if drift > 300:
            log.warning("Device clock differs from this PC by %d minutes - fix the device time", drift // 60)

    pending = sorted(
        (
            {"userId": uid, "time": when.strftime(TIME_FMT), "state": state, "verify": verify}
            for uid, when, state, verify in records
            if uid and when.strftime(TIME_FMT) >= cursor
        ),
        key=lambda p: p["time"],
    )
    pending = [p for p in pending if punch_key(p) not in done]
    if not pending:
        log.info("Device has %d records, nothing new since %s", len(records), cursor)
        save_state(cfg, cursor, done)
        return
    log.info("Sending %d punch(es) since %s", len(pending), cursor)
    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i:i + BATCH_SIZE]
        res = post_batch(cfg, batch)
        log.info(
            "Noamany: applied=%s rejected=%s ignored=%s duplicate=%s retry=%s",
            res.get("applied"), res.get("rejected"), res.get("ignored"), res.get("duplicate"), res.get("retry"),
        )
        for r in res.get("results", []):
            if r.get("status") in ("rejected", "retry"):
                log.warning("  %s %s user=%s: %s", r.get("status"), r.get("time"), r.get("userId"), r.get("message"))
        cursor, done, complete = advance(cursor, done, batch, res.get("results", []))
        save_state(cfg, cursor, done)
        if not complete:
            log.info("Some punches will be retried next cycle")
            return


def check(cfg):
    with ZKClient(cfg.ip, cfg.port, cfg.comm_key) as zk:
        print("Connected to %s:%d" % (cfg.ip, cfg.port))
        print("Model     :", zk.option("~DeviceName"))
        print("Serial    :", zk.option("~SerialNumber"))
        print("Firmware  :", zk.firmware())
        print("Platform  :", zk.option("~Platform"))
        print("Device time:", zk.device_time(), " | this PC:", datetime.now().strftime(TIME_FMT))
        counts = zk.sizes()
        print("Users=%(users)d  Fingerprints=%(fingers)d  Attendance records=%(records)d" % counts)
        records = zk.attendance()
    print("Last punches on the device:")
    for uid, when, state, verify in sorted(records, key=lambda r: r[1])[-10:]:
        print("  user=%-8s %s state=%s verify=%s" % (uid, when.strftime(TIME_FMT), state, verify))
    print("Punches will be sent from:", load_state(cfg)[0])


def setup_logging(cfg):
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    log.setLevel(logging.INFO)
    fh = logging.handlers.RotatingFileHandler(cfg.log_file, maxBytes=2 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    log.addHandler(fh)
    log.addHandler(sh)


# ---------------------------------------------------------------------------
# One-time interactive setup (setup.bat)
# ---------------------------------------------------------------------------
def set_ini_value(path, section, key, value):
    """Rewrites one "key = value" line in place, keeping the file's comments."""
    with open(path, "r", encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    current, done = None, False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            if current == section and not done:
                lines.insert(i, "%s = %s" % (key, value))
                done = True
                break
            current = stripped[1:-1]
        elif current == section and stripped.split("=", 1)[0].strip() == key and "=" in stripped:
            lines[i] = "%s = %s" % (key, value)
            done = True
            break
    if not done:
        if current != section:
            lines.append("[%s]" % section)
        lines.append("%s = %s" % (key, value))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def ask(prompt, current):
    shown = " [%s]" % current if current not in ("", None) else ""
    answer = input("%s%s: " % (prompt, shown)).strip()
    return answer or str(current)


def install_startup(agent_dir):
    startup = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
    if not os.path.isdir(startup):
        return None
    target = os.path.join(startup, "noamany-zk-agent.bat")
    with open(target, "w") as fh:
        fh.write('@echo off\r\nstart "Noamany fingerprint" /min cmd /c ""%s""\r\n' % os.path.join(agent_dir, "run-agent.bat"))
    return target


def setup(path):
    print("=" * 60)
    print(" Noamany fingerprint agent - setup")
    print("=" * 60)
    cfg = Config(path)

    print("\n[1/3] Fingerprint device %s" % cfg.ip)
    print("      Comm Key is on the device: M/OK > Comm. > PC Connection > Comm Key")
    while True:
        key = ask("      Comm Key", cfg.comm_key)
        if not key.isdigit():
            print("      Numbers only.")
            continue
        try:
            with ZKClient(cfg.ip, cfg.port, int(key)) as zk:
                counts = zk.sizes()
            print("      OK - device has %(users)d users and %(records)d attendance records." % counts)
            set_ini_value(path, "device", "comm_key", key)
            break
        except ZKError as exc:
            print("      Device said: %s" % exc)
        except (socket.error, OSError) as exc:
            print("      Cannot reach the device at %s:%d (%s). Is this PC on the gym network?" % (cfg.ip, cfg.port, exc))
            if input("      Try again? (y/n): ").strip().lower() != "y":
                break

    print("\n[2/3] Noamany  %s" % cfg.api_url)
    print("      Device number = the # column in Noamany > Attendance > Devices")
    while True:
        dev = ask("      Device number", cfg.device_id or "")
        if dev.isdigit() and int(dev) > 0:
            set_ini_value(path, "noamany", "device_id", dev)
            break
        print("      Numbers only.")
    cfg = Config(path)
    try:
        post_batch(cfg, [])
        print("      OK - Noamany accepted this device.")
    except Exception as exc:
        print("      Noamany is not ready yet: %s" % exc)
        print("      That is fine if the server update is not installed yet;")
        print("      the agent keeps retrying every minute and starts sending once it is.")

    print("\n[3/3] Start automatically with Windows")
    target = install_startup(os.path.dirname(os.path.abspath(path)))
    print("      " + ("Added: %s" % target if target else "Could not find the Startup folder - start run-agent.bat by hand."))
    print("\nSetup finished. The agent will now start in a minimized window.")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Noamany ZKTeco attendance agent")
    parser.add_argument("--config", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.ini"))
    parser.add_argument("--check", action="store_true", help="read the device only, send nothing")
    parser.add_argument("--once", action="store_true", help="run one sync cycle and exit")
    parser.add_argument("--setup", action="store_true", help="interactive first-time setup")
    args = parser.parse_args(argv)
    if args.setup:
        return setup(args.config)
    cfg = Config(args.config)

    if args.check:
        check(cfg)
        return 0

    if not (cfg.api_url and cfg.device_id and cfg.token):
        raise SystemExit("Fill [noamany] api_url, device_id and token in the config first")
    setup_logging(cfg)
    log.info("Noamany ZK agent %s -> device %s:%d, Noamany device #%d", VERSION, cfg.ip, cfg.port, cfg.device_id)
    while True:
        try:
            sync_once(cfg)
        except Exception as exc:  # keep the loop alive through network/device hiccups
            log.error("Sync failed: %s", exc)
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(cfg.interval)


if __name__ == "__main__":
    sys.exit(main())
