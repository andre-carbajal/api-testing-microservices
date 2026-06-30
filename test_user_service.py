"""
test_user_service.py

Integration tests for the user-service using httpx.AsyncClient.
These tests run against the real service started by the `services` fixture in conftest.py.
"""
import pytest
import httpx


pytestmark = pytest.mark.asyncio


class TestRegister:
    async def test_register_returns_201_with_user_data(self, client, services):
        res = await client.post(
            f"{services['user']}/auth/register",
            json={"name": "Bob", "email": "bob@pytest.com", "password": "PyTest1234!"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["email"] == "bob@pytest.com"
        assert body["role"] == "user"
        assert "password" not in body  # never expose the hash

    async def test_register_returns_400_when_fields_missing(self, client, services):
        res = await client.post(
            f"{services['user']}/auth/register",
            json={"email": "incomplete@pytest.com"},  # missing name and password
        )
        assert res.status_code == 400
        assert "error" in res.json()

    async def test_register_returns_409_on_duplicate_email(self, client, services, registered_user):
        # registered_user fixture already created alice@pytest.com
        res = await client.post(
            f"{services['user']}/auth/register",
            json=registered_user,  # same email
        )
        assert res.status_code == 409
        assert "already registered" in res.json()["error"].lower()


class TestLogin:
    async def test_login_returns_jwt_token(self, client, services, registered_user):
        res = await client.post(
            f"{services['user']}/auth/login",
            json={"email": registered_user["email"], "password": registered_user["password"]},
        )
        assert res.status_code == 200
        token = res.json().get("token")
        assert token is not None
        assert isinstance(token, str)
        # JWTs have three base64 segments separated by dots
        assert len(token.split(".")) == 3

    async def test_login_returns_401_on_wrong_password(self, client, services, registered_user):
        res = await client.post(
            f"{services['user']}/auth/login",
            json={"email": registered_user["email"], "password": "WrongPassword!"},
        )
        assert res.status_code == 401

    async def test_login_returns_401_on_unknown_email(self, client, services):
        res = await client.post(
            f"{services['user']}/auth/login",
            json={"email": "nobody@pytest.com", "password": "doesnt-matter"},
        )
        assert res.status_code == 401


class TestProfile:
    async def test_get_me_returns_profile(self, client, services, auth_headers):
        res = await client.get(f"{services['user']}/users/me", headers=auth_headers)
        assert res.status_code == 200
        body = res.json()
        assert body["email"] == "alice@pytest.com"
        assert "password" not in body

    async def test_get_me_returns_401_without_token(self, client, services):
        res = await client.get(f"{services['user']}/users/me")
        assert res.status_code == 401

    async def test_get_me_returns_401_with_invalid_token(self, client, services):
        res = await client.get(
            f"{services['user']}/users/me",
            headers={"Authorization": "Bearer not.a.real.token"},
        )
        assert res.status_code == 401


class TestHealth:
    async def test_health_check(self, client, services):
        res = await client.get(f"{services['user']}/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok", "service": "user-service"}
