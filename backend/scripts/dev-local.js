// Starts the backend against the local Firestore emulator when it is running.
// Falls back to production Firestore if the emulator never comes up.
//
// Usage: npm run dev:local   (from backend/)
// Emulator: firebase emulators:start --only firestore --project demo-margsutra

const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const TARGET = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [HOST, PORT_STR] = TARGET.split(":");
const PORT = Number(PORT_STR) || 8080;

function isOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let up = await isOpen(HOST, PORT);
  if (!up) {
    console.log(`⏳ Waiting for Firestore emulator at ${HOST}:${PORT} …`);
    for (let i = 0; i < 60 && !up; i += 1) {
      await wait(1000);
      up = await isOpen(HOST, PORT);
    }
  }

  const env = { ...process.env };
  if (up) {
    env.FIRESTORE_EMULATOR_HOST = `${HOST}:${PORT}`;
    console.log(`🔥 Backend will use the local Firestore emulator at ${HOST}:${PORT}`);
  } else {
    console.warn("⚠️  Emulator not reachable — backend will use production Firestore.");
  }

  const child = spawn(process.execPath, ["--watch", "src/server.js"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env,
  });

  const stop = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  child.on("exit", (code) => process.exit(code === null ? 0 : code));
})();
