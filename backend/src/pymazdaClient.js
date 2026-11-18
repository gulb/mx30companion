const { spawn } = require("child_process");
const path = require("path");

const BRIDGE_SCRIPT = path.join(__dirname, "pymazda_bridge.py");
const BRIDGE_TIMEOUT_MS = 45000;

class PyMazdaClient {
  constructor({
    userSub,
    accessToken,
    sessionId = null,
    region = "MME",
    onSessionId = null
  }) {
    this.userSub = userSub;
    this.accessToken = accessToken;
    this.sessionId = sessionId;
    this.region = region;
    this.onSessionId = onSessionId;
  }

  setAccessToken(accessToken) {
    this.accessToken = accessToken;
  }

  runBridge(action, args = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn("python3", [BRIDGE_SCRIPT], {
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("MyMazda request timed out after 45s"));
      }, BRIDGE_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to start pymazda bridge: ${err.message}`));
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const lastLine = stdout.trim().split("\n").pop() || "";
        try {
          const parsed = JSON.parse(lastLine);
          if (parsed && parsed.ok) {
            if (parsed.sessionId && parsed.sessionId !== this.sessionId) {
              this.sessionId = parsed.sessionId;
              if (typeof this.onSessionId === "function") {
                this.onSessionId(parsed.sessionId);
              }
            }
            resolve(parsed.result);
            return;
          }
          reject(
            new Error((parsed && parsed.error) || stderr.trim() || `Bridge exited with ${code}`)
          );
        } catch (_err) {
          reject(
            new Error(
              stderr.trim() || stdout.trim() || `pymazda bridge failed with exit code ${code}`
            )
          );
        }
      });

      child.stdin.write(
        JSON.stringify({
          userSub: this.userSub,
          accessToken: this.accessToken,
          sessionId: this.sessionId,
          region: this.region,
          action,
          args
        })
      );
      child.stdin.end();
    });
  }

  runCommand(method, internalVehicleId, extraArgs = {}) {
    return this.runBridge("command", {
      method,
      internalVehicleId,
      ...extraArgs
    });
  }

  getVehicles() {
    return this.runBridge("getVehicles");
  }

  syncAll(preferredVehicleId = null, refresh = false) {
    return this.runBridge("sync", { preferredVehicleId, refresh });
  }

  getVehicleStatus(vehicleId) {
    return this.runCommand("getVehicleStatus", vehicleId);
  }

  getEVVehicleStatus(vehicleId) {
    return this.runCommand("getEVVehicleStatus", vehicleId);
  }

  getHVACSetting(vehicleId) {
    return this.runCommand("getHVACSetting", vehicleId);
  }

  setHVACSetting(vehicleId, temperature, unit, frontDefroster, rearDefroster) {
    return this.runCommand("setHVACSetting", vehicleId, {
      temperature,
      unit,
      frontDefroster,
      rearDefroster
    });
  }

  turnOnHVAC(vehicleId) {
    return this.runCommand("turnOnHVAC", vehicleId);
  }

  turnOffHVAC(vehicleId) {
    return this.runCommand("turnOffHVAC", vehicleId);
  }

  startCharging(vehicleId) {
    return this.runCommand("startCharging", vehicleId);
  }

  stopCharging(vehicleId) {
    return this.runCommand("stopCharging", vehicleId);
  }

  lockDoors(vehicleId) {
    return this.runCommand("lockDoors", vehicleId);
  }

  unlockDoors(vehicleId) {
    return this.runCommand("unlockDoors", vehicleId);
  }

  turnOnHazardLights(vehicleId) {
    return this.runCommand("turnOnHazardLights", vehicleId);
  }

  refreshVehicleStatus(vehicleId) {
    return this.runCommand("refreshVehicleStatus", vehicleId);
  }

  sendPoi(vehicleId, latitude, longitude, name) {
    return this.runCommand("sendPoi", vehicleId, {
      latitude,
      longitude,
      name
    });
  }
}

module.exports = PyMazdaClient;
module.exports.PyMazdaClient = PyMazdaClient;
module.exports.default = PyMazdaClient;
