import asyncio
import json
import os
import sys

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from pymazda.client import Client  # noqa: E402
from pymazda.exceptions import MazdaSessionExpiredException  # noqa: E402


def select_vehicle(vehicles, preferred_id=None):
    if not vehicles:
        raise RuntimeError("No vehicles found in this MyMazda account")
    if preferred_id:
        for vehicle in vehicles:
            if vehicle.get("id") == preferred_id or vehicle.get("vin") == preferred_id:
                return vehicle
    for vehicle in vehicles:
        if vehicle.get("isElectric"):
            return vehicle
    return vehicles[0]


async def run_sync(client, args):
    vehicles = await client.get_vehicles()
    vehicle = select_vehicle(vehicles, args.get("preferredVehicleId"))
    vid = vehicle["id"]

    if args.get("refresh"):
        try:
            await client.refresh_vehicle_status(vid)
        except Exception:
            pass

    tasks = [
        client.get_vehicle_status(vid),
        client.get_ev_vehicle_status(vid)
        if (vehicle.get("isElectric") or vehicle.get("isPHEV"))
        else asyncio.sleep(0, result=None),
        client.get_hvac_setting(vid),
    ]
    base_status, ev_status, hvac_setting = await asyncio.gather(*tasks, return_exceptions=True)

    errors = []
    if isinstance(base_status, Exception):
        errors.append(f"vehicle_status: {base_status}")
        base_status = None
    if isinstance(ev_status, Exception):
        errors.append(f"ev_status: {ev_status}")
        ev_status = None
    if isinstance(hvac_setting, Exception):
        errors.append(f"hvac_setting: {hvac_setting}")
        hvac_setting = None

    if base_status is None and ev_status is None and hvac_setting is None and errors:
        raise RuntimeError("; ".join(errors))

    return {
        "vehicle": vehicle,
        "baseStatus": base_status,
        "evStatus": ev_status,
        "hvacSetting": hvac_setting,
    }


async def run_command(client, args):
    vid = args.get("internalVehicleId")
    if not vid:
        vehicles = await client.get_vehicles()
        vid = select_vehicle(vehicles, args.get("preferredVehicleId"))["id"]

    method = args.get("method")
    simple_commands = {
        "turnOnHVAC": client.turn_on_hvac,
        "turnOffHVAC": client.turn_off_hvac,
        "startCharging": client.start_charging,
        "stopCharging": client.stop_charging,
        "lockDoors": client.lock_doors,
        "unlockDoors": client.unlock_doors,
        "turnOnHazardLights": client.turn_on_hazard_lights,
        "refreshVehicleStatus": client.refresh_vehicle_status,
        "getVehicleStatus": client.get_vehicle_status,
        "getEVVehicleStatus": client.get_ev_vehicle_status,
        "getHVACSetting": client.get_hvac_setting,
    }

    if method == "setHVACSetting":
        return await client.set_hvac_setting(
            vid,
            args.get("temperature"),
            args.get("unit", "C"),
            bool(args.get("frontDefroster", False)),
            bool(args.get("rearDefroster", False)),
        )
    if method == "sendPoi":
        return await client.send_poi(
            vid,
            float(args["latitude"]),
            float(args["longitude"]),
            str(args.get("name") or "Destination"),
        )
    if method in simple_commands:
        return await simple_commands[method](vid)
    raise ValueError(f"Unsupported pymazda command: {method}")


async def dispatch_action(client, action, args):
    if action == "getVehicles":
        return await client.get_vehicles()
    if action == "sync":
        return await run_sync(client, args)
    if action == "command":
        return await run_command(client, args)
    raise ValueError(f"Unsupported bridge action: {action}")


async def execute(payload):
    user_sub = payload.get("userSub") or ""
    access_token = payload.get("accessToken") or ""
    session_id = payload.get("sessionId") or None
    region = payload.get("region", "MME")
    action = payload.get("action")
    args = payload.get("args") or {}

    async def token_provider():
        return access_token

    client = Client(user_sub, region, access_token_provider=token_provider)
    try:
        if session_id:
            client._session_id = session_id
            client.controller.connection.device_session_id = session_id
        else:
            await client.attach()

        try:
            result = await dispatch_action(client, action, args)
        except Exception as exc:
            if isinstance(exc, MazdaSessionExpiredException) or "600100" in str(exc):
                client._session_id = None
                client.controller.connection.device_session_id = None
                await client.attach()
                result = await dispatch_action(client, action, args)
            else:
                raise

        return {
            "sessionId": client._session_id,
            "result": result,
        }
    finally:
        await client.close()


def main():
    raw = sys.stdin.read().strip()
    if not raw and len(sys.argv) > 1:
        raw = sys.argv[1]
    payload = json.loads(raw or "{}")

    try:
        data = asyncio.run(execute(payload))
        print(
            json.dumps(
                {
                    "ok": True,
                    "sessionId": data.get("sessionId"),
                    "result": data.get("result"),
                },
                default=str,
            )
        )
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
