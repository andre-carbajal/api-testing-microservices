"""
test_order_flow.py

End-to-end integration test: covers the full happy path across
all three microservices — register → login → browse products → place order.

This is the "crown jewel" test that validates cross-service communication.
"""
import pytest
import httpx


pytestmark = pytest.mark.asyncio


class TestFullOrderFlow:
    """
    Scenario: A new user registers, logs in, browses the product catalog,
    places an order for two items, and verifies the order appears in their history.
    """

    async def test_end_to_end_order_flow(self, client, services):
        user_url = services["user"]
        product_url = services["product"]
        order_url = services["order"]

        # ── Step 1: Register ──────────────────────────────────────────────────
        reg_res = await client.post(
            f"{user_url}/auth/register",
            json={"name": "Charlie", "email": "charlie@e2e.com", "password": "E2ETest99!"},
        )
        assert reg_res.status_code in (201, 409), f"Register failed: {reg_res.text}"

        # ── Step 2: Login ─────────────────────────────────────────────────────
        login_res = await client.post(
            f"{user_url}/auth/login",
            json={"email": "charlie@e2e.com", "password": "E2ETest99!"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # ── Step 3: Browse products ───────────────────────────────────────────
        products_res = await client.get(f"{product_url}/products")
        assert products_res.status_code == 200
        products = products_res.json()
        assert len(products) > 0

        # Pick the first two available products
        item_a = products[0]
        item_b = products[1] if len(products) > 1 else products[0]

        # ── Step 4: Check individual product detail ───────────────────────────
        detail_res = await client.get(f"{product_url}/products/{item_a['id']}")
        assert detail_res.status_code == 200
        assert detail_res.json()["id"] == item_a["id"]

        stock_before = detail_res.json()["stock"]

        # ── Step 5: Place an order ────────────────────────────────────────────
        order_res = await client.post(
            f"{order_url}/orders",
            headers=headers,
            json={
                "items": [
                    {"productId": item_a["id"], "quantity": 2},
                    {"productId": item_b["id"], "quantity": 1},
                ]
            },
        )
        assert order_res.status_code == 201, f"Order failed: {order_res.text}"
        order = order_res.json()

        assert order["status"] == "confirmed"
        assert order["userId"] is not None
        assert len(order["items"]) == 2
        assert order["total"] > 0

        # ── Step 6: Verify stock was decremented ──────────────────────────────
        stock_res = await client.get(f"{product_url}/products/{item_a['id']}")
        assert stock_res.status_code == 200
        stock_after = stock_res.json()["stock"]
        assert stock_after == stock_before - 2

        # ── Step 7: Verify order appears in history ───────────────────────────
        history_res = await client.get(f"{order_url}/orders", headers=headers)
        assert history_res.status_code == 200
        order_ids = [o["id"] for o in history_res.json()]
        assert order["id"] in order_ids

    async def test_order_rejected_without_auth(self, client, services):
        res = await client.post(
            f"{services['order']}/orders",
            json={"items": [{"productId": 1, "quantity": 1}]},
        )
        assert res.status_code == 401

    async def test_order_isolation_between_users(self, client, services):
        """User A cannot see User B's orders."""
        user_url = services["user"]
        order_url = services["order"]

        async def create_user_and_token(name: str, email: str) -> str:
            await client.post(
                f"{user_url}/auth/register",
                json={"name": name, "email": email, "password": "IsoTest99!"},
            )
            res = await client.post(
                f"{user_url}/auth/login",
                json={"email": email, "password": "IsoTest99!"},
            )
            return res.json()["token"]

        token_a = await create_user_and_token("UserA", "usera@iso.com")
        token_b = await create_user_and_token("UserB", "userb@iso.com")

        # User A places an order
        order_res = await client.post(
            f"{order_url}/orders",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"items": [{"productId": 1, "quantity": 1}]},
        )
        assert order_res.status_code == 201
        order_id = order_res.json()["id"]

        # User B tries to access User A's order
        res = await client.get(
            f"{order_url}/orders/{order_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res.status_code == 403
