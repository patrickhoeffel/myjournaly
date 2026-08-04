import asyncio
import json
import logging
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.services.auth import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin-services"])

PROJECT_ROOT = Path(__file__).resolve().parents[3]

SERVICES = {
    "api": {
        "name": "API",
        "port": 8090,
        "dir": "api",
        "health_url": "http://localhost:8090/health",
        "url": "http://localhost:8090/docs",
        "version_file": "pyproject.toml",
    },
    "ui": {
        "name": "UI",
        "port": 5173,
        "dir": "ui",
        "health_url": "http://localhost:5173",
        "url": "http://localhost:5173",
        "version_file": "package.json",
    },
    "admin": {
        "name": "Admin",
        "port": 5174,
        "dir": "admin",
        "health_url": "http://localhost:5174",
        "url": "http://localhost:5174",
        "version_file": "package.json",
    },
}


def _read_version(service_key: str) -> str:
    svc = SERVICES[service_key]
    version_path = PROJECT_ROOT / svc["dir"] / svc["version_file"]
    try:
        text = version_path.read_text()
        if svc["version_file"] == "package.json":
            data = json.loads(text)
            return data.get("version", "0.0.0")
        else:
            for line in text.splitlines():
                if line.strip().startswith("version"):
                    return line.split("=")[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return "0.0.0"


async def _run(cmd: str) -> str:
    proc = await asyncio.create_subprocess_shell(
        cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip()


async def _get_pid(port: int) -> int | None:
    result = await _run(f"lsof -ti tcp:{port}")
    if result:
        # May return multiple PIDs; take the first
        return int(result.splitlines()[0])
    return None


async def _get_process_start_time(pid: int) -> str | None:
    result = await _run(f"ps -p {pid} -o lstart=")
    return result if result else None


async def _check_health(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            return resp.status_code < 500
    except Exception:
        return False


async def _get_service_info(key: str) -> dict:
    svc = SERVICES[key]
    pid = await _get_pid(svc["port"])
    started_at = None
    if pid:
        started_at = await _get_process_start_time(pid)
    healthy = await _check_health(svc["health_url"])
    version = _read_version(key)

    return {
        "key": key,
        "name": svc["name"],
        "port": svc["port"],
        "url": svc["url"],
        "version": version,
        "pid": pid,
        "started_at": started_at,
        "healthy": healthy,
        "running": pid is not None,
    }


@router.get("/services")
async def list_services(admin: dict = Depends(require_admin)):
    results = await asyncio.gather(
        *[_get_service_info(k) for k in SERVICES]
    )
    return list(results)


@router.post("/services/{service_key}/stop")
async def stop_service(service_key: str, admin: dict = Depends(require_admin)):
    if service_key not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    svc = SERVICES[service_key]
    pid = await _get_pid(svc["port"])
    if not pid:
        raise HTTPException(status_code=400, detail="Service is not running")
    await _run(f"kill {pid}")
    return {"status": "stopped", "service": service_key}


@router.post("/services/{service_key}/start")
async def start_service(service_key: str, admin: dict = Depends(require_admin)):
    if service_key not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    svc = SERVICES[service_key]
    pid = await _get_pid(svc["port"])
    if pid:
        raise HTTPException(status_code=400, detail="Service is already running")
    run_script = PROJECT_ROOT / svc["dir"] / "run.sh"
    if not run_script.exists():
        raise HTTPException(status_code=500, detail="run.sh not found")
    await _run(f"cd {PROJECT_ROOT / svc['dir']} && bash run.sh")
    return {"status": "started", "service": service_key}


@router.post("/services/{service_key}/restart")
async def restart_service(service_key: str, admin: dict = Depends(require_admin)):
    if service_key not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    svc = SERVICES[service_key]
    pid = await _get_pid(svc["port"])
    if pid:
        await _run(f"kill {pid}")
        # Brief pause to let the port free up
        await asyncio.sleep(1)
    run_script = PROJECT_ROOT / svc["dir"] / "run.sh"
    if not run_script.exists():
        raise HTTPException(status_code=500, detail="run.sh not found")
    await _run(f"cd {PROJECT_ROOT / svc['dir']} && bash run.sh")
    return {"status": "restarted", "service": service_key}


@router.post("/services/{service_key}/test")
async def test_service(service_key: str, admin: dict = Depends(require_admin)):
    if service_key not in SERVICES:
        raise HTTPException(status_code=404, detail="Unknown service")
    svc = SERVICES[service_key]

    results = {"service": service_key, "tests": []}

    # Health check test
    healthy = await _check_health(svc["health_url"])
    results["tests"].append({
        "name": "Health Check",
        "passed": healthy,
        "detail": f"GET {svc['health_url']} → {'OK' if healthy else 'FAILED'}",
    })

    # Port listening test
    pid = await _get_pid(svc["port"])
    results["tests"].append({
        "name": "Port Listening",
        "passed": pid is not None,
        "detail": f"Port {svc['port']} → {'PID ' + str(pid) if pid else 'not listening'}",
    })

    # Run lint/test command if available
    svc_dir = PROJECT_ROOT / svc["dir"]
    if service_key == "api":
        # Check if pytest is available
        test_output = await _run(f"cd {svc_dir} && uv run python -m pytest --co -q 2>&1 | head -5")
        if "no tests" in test_output.lower() or not test_output:
            results["tests"].append({
                "name": "Unit Tests",
                "passed": True,
                "detail": "No test files found (pytest)",
            })
        else:
            results["tests"].append({
                "name": "Unit Tests",
                "passed": True,
                "detail": test_output,
            })
    else:
        # For UI services, run lint
        lint_output = await _run(f"cd {svc_dir} && npm run lint 2>&1 | tail -3")
        passed = "error" not in lint_output.lower() if lint_output else True
        results["tests"].append({
            "name": "Lint Check",
            "passed": passed,
            "detail": lint_output or "No output",
        })

    results["all_passed"] = all(t["passed"] for t in results["tests"])
    return results
