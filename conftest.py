"""
conftest.py — shared fixtures for all pytest test modules.

We use httpx.AsyncClient against a real HTTPX transport that wraps
the running microservices (started as subprocesses for integration tests)
or via a direct ASGI adapter for unit-style tests.

For these tests we keep it simple: start the three Node services as
subprocesses before the test session, then tear them down after.
"""
import asyncio
import os
import subprocess
import time

import httpx
import pytest


# ── Base URLs (can be overridden via env for CI) ──────────────────────────────

USER_URL = os.getenv("USER_SERVICE_URL", "http://localhost:3001")
PRODUCT_URL = os.getenv("PRODUCT_SERVICE_URL", "http://localhost:3002")
ORDER_URL = os.getenv("ORDER_SERVICE_URL", "http://localhost:3003")


def _wait_for_service(url: str, retries: int = 20, delay: float = 0.5) -> None:
    """Poll /health until the service is ready."""
    for _ in range(retries):
        try:
            r = httpx.get(f"{url}/health", timeout=2)
            if r.status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(delay)
    raise RuntimeError(f"Service at {url} did not become healthy in time")


@pytest.fixture(scope="session")
def services():
    """Start all three Node microservices for the duration of the test session."""
    procs = []
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

    service_dirs = [
        ("services/user-service", 3001),
        ("services/product-service", 3002),
        ("services/order-service", 3003),
    ]

    for rel_dir, port in service_dirs:
        cwd = os.path.join(root, rel_dir)
        env = {**os.environ, "PORT": str(port)}
        p = subprocess.Popen(
            ["node", "src/index.js"],
            cwd=cwd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        procs.append(p)

    # Wait for all services to be ready
    for url in [USER_URL, PRODUCT_URL, ORDER_URL]:
        _wait_for_service(url)

    yield {"user": USER_URL, "product": PRODUCT_URL, "order": ORDER_URL}

    for p in procs:
        p.terminate()
        p.wait()


@pytest.fixture
async def client():
    """Async HTTPX client for a single test."""
    async with httpx.AsyncClient(timeout=10) as c:
        yield c


@pytest.fixture
async def registered_user(client, services):
    """Register a fresh user and return their credentials."""
    payload = {"name": "Alice", "email": "alice@pytest.com", "password": "PyTest1234!"}
    res = await client.post(f"{services['user']}/auth/register", json=payload)
    # If already registered (test re-run), just log in
    assert res.status_code in (201, 409)
    return payload


@pytest.fixture
async def auth_token(client, services, registered_user):
    """Return a valid JWT for the registered user."""
    res = await client.post(
        f"{services['user']}/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}
