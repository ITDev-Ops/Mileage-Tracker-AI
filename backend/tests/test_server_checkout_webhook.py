import os
import sys
import json
import time
import uuid
import hmac
import hashlib
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

# Ensure test mode to suppress background intervals
os.environ["TESTING"] = "true"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server
server.app.router.on_startup.clear()
from server import app, DEFAULT_PRODUCTS, get_product_from_db

class MockCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, filter_dict, projection=None, *args, **kwargs):
        for d in reversed(self.docs):
            match = True
            for k, v in filter_dict.items():
                if k == "$or":
                    sub_match = any(all(d.get(sk) == sv for sk, sv in cond.items()) for cond in v)
                    if not sub_match:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(d)
                if projection and "_id" in projection and projection["_id"] == 0:
                    res.pop("_id", None)
                return res
        return None

    async def count_documents(self, *args, **kwargs):
        return 0

    def find(self, filter_dict=None):
        matched = []
        filter_dict = filter_dict or {}
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if isinstance(v, dict) and "$ne" in v:
                    if d.get(k) == v["$ne"]:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(dict(d))

        class Cursor:
            def __init__(self, data):
                self.data = data
            def sort(self, *args, **kwargs):
                return self
            def limit(self, *args, **kwargs):
                return self
            async def to_list(self, length=100):
                return self.data[:length]
        return Cursor(matched)

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = str(uuid.uuid4())
        self.docs.append(d)
        return d

    async def update_one(self, filter_dict, update_dict, upsert=False):
        found = False
        for d in self.docs:
            if all(d.get(k) == v for k, v in filter_dict.items()):
                found = True
                if "$set" in update_dict:
                    for k, v in update_dict["$set"].items():
                        d[k] = v
                return d
        if not found and upsert:
            new_doc = dict(filter_dict)
            if "$set" in update_dict:
                new_doc.update(update_dict["$set"])
            if "_id" not in new_doc:
                new_doc["_id"] = str(uuid.uuid4())
            self.docs.append(new_doc)
            return new_doc
        return None

    async def update_many(self, filter_dict, update_dict):
        for d in self.docs:
            if all(d.get(k) == v for k, v in filter_dict.items()):
                if "$set" in update_dict:
                    for k, v in update_dict["$set"].items():
                        d[k] = v

    async def create_index(self, *args, **kwargs):
        pass


class MockDB:
    def __init__(self):
        self.users = MockCollection()
        self.products = MockCollection()
        self.subscription_plans = MockCollection()
        self.payment_transactions = MockCollection()
        self.team_members = MockCollection()
        self.webhook_events = MockCollection()
        self.alerts = MockCollection()
        self.system_settings = MockCollection()


def generate_stripe_signature(payload_bytes: bytes, secret: str, timestamp: int = None) -> str:
    ts = timestamp if timestamp is not None else int(time.time())
    signed_payload = f"{ts}.".encode("utf-8") + payload_bytes
    sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


@pytest.fixture
def test_setup():
    mock_db = MockDB()
    server.db = mock_db
    test_secret = "whsec_test_mock_secret_444"
    os.environ["STRIPE_WEBHOOK_SECRET"] = test_secret
    server.STRIPE_WEBHOOK_SECRET = test_secret

    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = "client@example.com"
    token = server.create_access_token({"sub": user_id})

    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": "Test User",
        "subscription_tier": "free",
        "subscription_status": "active",
        "created_at": datetime.now(timezone.utc)
    }
    mock_db.users.docs.append(user_doc)
    server.auth_cache.set(token, user_doc)

    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    return {
        "db": mock_db,
        "client": client,
        "headers": headers,
        "user_id": user_id,
        "email": email,
        "secret": test_secret
    }


def test_products_catalog_endpoint(test_setup):
    """Catalog returns active products with locked Stripe Price IDs and cents."""
    client = test_setup["client"]
    resp = client.get("/api/products")
    assert resp.status_code == 200
    data = resp.json()
    assert "products" in data
    products_map = {p["product_id"]: p for p in data["products"]}
    assert "pro" in products_map
    assert products_map["pro"]["amount_cents"] == 999
    assert products_map["pro"]["currency"] == "usd"
    assert "stripe_price_id" in products_map["pro"]

    # Pro plan must NOT have Priority Support, Team Management, Admin Dashboard, API Access
    pro_features_lower = [f.lower() for f in products_map["pro"]["features"]]
    assert not any("priority support" in f for f in pro_features_lower)
    assert not any("team management" in f for f in pro_features_lower)
    assert not any("admin dashboard" in f for f in pro_features_lower)
    assert not any("api access" in f for f in pro_features_lower)

    # Business plan MUST have them
    assert "business" in products_map
    biz_features_lower = [f.lower() for f in products_map["business"]["features"]]
    assert any("priority support" in f for f in biz_features_lower)
    assert any("team management" in f for f in biz_features_lower)
    assert any("admin dashboard" in f for f in biz_features_lower)
    assert any("api access" in f for f in biz_features_lower)


def test_business_features_restricted_to_business_tier(test_setup):
    """Pro users are barred from Team Management and API access; Business users are allowed."""
    client = test_setup["client"]
    mock_db = test_setup["db"]

    # Create a Pro user
    pro_user_id = f"usr_pro_{uuid.uuid4().hex[:6]}"
    pro_token = server.create_access_token({"sub": pro_user_id})
    pro_user = {"user_id": pro_user_id, "email": "pro@test.com", "subscription_tier": "pro"}
    mock_db.users.docs.append(pro_user)
    server.auth_cache.set(pro_token, pro_user)
    pro_headers = {"Authorization": f"Bearer {pro_token}"}

    # Pro user blocked from /team/stats and /auth/api-key with 403 Forbidden
    resp_team = client.get("/api/team/stats", headers=pro_headers)
    assert resp_team.status_code == 403
    assert "business" in resp_team.text.lower()

    resp_api = client.get("/api/auth/api-key", headers=pro_headers)
    assert resp_api.status_code == 403
    assert "business" in resp_api.text.lower()

    # Create a Business user
    biz_user_id = f"usr_biz_{uuid.uuid4().hex[:6]}"
    biz_token = server.create_access_token({"sub": biz_user_id})
    biz_user = {"user_id": biz_user_id, "email": "biz@test.com", "subscription_tier": "business"}
    mock_db.users.docs.append(biz_user)
    server.auth_cache.set(biz_token, biz_user)
    biz_headers = {"Authorization": f"Bearer {biz_token}"}

    # Business user allowed
    resp_biz_team = client.get("/api/team/stats", headers=biz_headers)
    assert resp_biz_team.status_code == 200

    resp_biz_api = client.get("/api/auth/api-key", headers=biz_headers)
    assert resp_biz_api.status_code == 200


def test_create_checkout_locks_database_price_and_ignores_client_tampering(test_setup):
    """
    Client sends a tampered amount and price in checkout request.
    Server MUST strictly ignore client amounts and query db.products for authoritative pricing.
    """
    client = test_setup["client"]
    headers = test_setup["headers"]
    mock_db = test_setup["db"]

    payload = {
        "product_id": "pro",
        "amount": 0.01,         # Tampering attempt 1: 1 cent
        "price": 0.50,          # Tampering attempt 2: 50 cents
        "currency": "eur",      # Tampering attempt 3: wrong currency
        "origin_url": "exp://127.0.0.1:8081"
    }

    resp = client.post("/api/payments/create-checkout", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert "url" in data
    assert data["product_id"] == "pro"

    # Verify transaction in database: price is locked to authoritative $9.99 / 999 cents USD
    txn = None
    for t in mock_db.payment_transactions.docs:
        if t.get("session_id") == data["session_id"]:
            txn = t
            break

    assert txn is not None
    assert txn["amount"] == 9.99
    assert txn["expected_amount_cents"] == 999
    assert txn["currency"] == "usd"
    assert txn["provisioned"] is False
    assert txn["payment_status"] == "pending"


def test_redirect_and_status_endpoints_never_provision_access(test_setup):
    """
    The checkout page and redirect URLs are NOT proof of payment.
    Navigating to success redirect or polling status must NEVER provision access or activate subscription.
    """
    client = test_setup["client"]
    headers = test_setup["headers"]
    mock_db = test_setup["db"]
    user_id = test_setup["user_id"]

    session_id = f"cs_test_mock_{uuid.uuid4().hex[:12]}"
    # Record a pending transaction
    mock_db.payment_transactions.docs.append({
        "session_id": session_id,
        "user_id": user_id,
        "product_id": "pro",
        "plan": "pro",
        "amount": 9.99,
        "expected_amount_cents": 999,
        "currency": "usd",
        "payment_status": "pending",
        "provisioned": False,
        "created_at": datetime.now(timezone.utc)
    })

    # 1. User navigates to redirect URL without paying
    redirect_resp = client.get(
        f"/api/payments/redirect?session_id={session_id}&redirect_url=exp%3A%2F%2Fapp&status=success&product_id=pro"
    )
    assert redirect_resp.status_code == 200
    assert "Payment Submitted" in redirect_resp.text

    # Verify user subscription remains 'free'
    user_doc = None
    for u in mock_db.users.docs:
        if u.get("user_id") == user_id:
            user_doc = u
            break
    assert user_doc["subscription_tier"] == "free"

    # 2. Client queries status endpoint
    status_resp = client.get(f"/api/payments/status/{session_id}", headers=headers)
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["provisioned"] is False
    assert status_data["payment_status"] == "pending"

    # Verify user STILL has not received free access
    assert user_doc["subscription_tier"] == "free"


def test_webhook_fraud_amount_mismatch_rejected(test_setup):
    """
    Attacker simulates a paid event with tampered amount_total (e.g. 100 cents instead of 999 cents).
    Stripe webhook listener MUST validate amount against database product price, reject provisioning,
    mark transaction as fraud_amount_mismatch, and refuse access.
    """
    client = test_setup["client"]
    mock_db = test_setup["db"]
    user_id = test_setup["user_id"]
    secret = test_setup["secret"]

    session_id = f"cs_test_tamper_{uuid.uuid4().hex[:12]}"
    mock_db.payment_transactions.docs.append({
        "session_id": session_id,
        "user_id": user_id,
        "product_id": "pro",
        "plan": "pro",
        "amount": 9.99,
        "expected_amount_cents": 999,
        "currency": "usd",
        "payment_status": "pending",
        "provisioned": False,
        "created_at": datetime.now(timezone.utc)
    })

    event_id = f"evt_fraud_{uuid.uuid4().hex[:12]}"
    fraud_payload = {
        "id": event_id,
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "payment_status": "paid",
                "amount_total": 100,  # 100 cents ($1.00) != 999 cents ($9.99)
                "currency": "usd",
                "metadata": {
                    "user_id": user_id,
                    "product_id": "pro",
                    "plan": "pro"
                }
            }
        }
    }
    raw_bytes = json.dumps(fraud_payload).encode("utf-8")
    sig = generate_stripe_signature(raw_bytes, secret)

    resp = client.post("/api/webhook/stripe", content=raw_bytes, headers={"Stripe-Signature": sig})
    assert resp.status_code == 200
    assert resp.json()["action"] == "fraud_amount_mismatch_rejected"

    # Verify transaction in DB is marked as fraud and NOT provisioned
    txn = None
    for t in mock_db.payment_transactions.docs:
        if t.get("session_id") == session_id:
            txn = t
            break
    assert txn["payment_status"] == "fraud_amount_mismatch"
    assert txn["provisioned"] is False

    # Verify user was NOT granted pro tier
    user_doc = None
    for u in mock_db.users.docs:
        if u.get("user_id") == user_id:
            user_doc = u
            break
    assert user_doc["subscription_tier"] == "free"


def test_webhook_verified_payment_provisions_access_and_enforces_idempotency(test_setup):
    """
    Legitimate Stripe webhook with matching amount_total validates and provisions access.
    Duplicate event delivery is rejected with 409 Conflict.
    """
    client = test_setup["client"]
    mock_db = test_setup["db"]
    user_id = test_setup["user_id"]
    secret = test_setup["secret"]

    session_id = f"cs_test_valid_{uuid.uuid4().hex[:12]}"
    mock_db.payment_transactions.docs.append({
        "session_id": session_id,
        "user_id": user_id,
        "product_id": "pro",
        "plan": "pro",
        "amount": 9.99,
        "expected_amount_cents": 999,
        "currency": "usd",
        "payment_status": "pending",
        "provisioned": False,
        "created_at": datetime.now(timezone.utc)
    })

    event_id = f"evt_valid_{uuid.uuid4().hex[:12]}"
    valid_payload = {
        "id": event_id,
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "payment_status": "paid",
                "amount_total": 999,  # Exactly matches database price
                "currency": "usd",
                "metadata": {
                    "user_id": user_id,
                    "product_id": "pro",
                    "plan": "pro"
                }
            }
        }
    }
    raw_bytes = json.dumps(valid_payload).encode("utf-8")
    sig = generate_stripe_signature(raw_bytes, secret)

    # First delivery: provisions access
    resp = client.post("/api/webhook/stripe", content=raw_bytes, headers={"Stripe-Signature": sig})
    assert resp.status_code == 200
    assert resp.json()["action"] == "subscription_activated"

    # Verify user subscription is upgraded to 'pro'
    user_doc = None
    for u in mock_db.users.docs:
        if u.get("user_id") == user_id:
            user_doc = u
            break
    assert user_doc["subscription_tier"] == "pro"

    # Verify transaction record is marked provisioned: True
    txn = None
    for t in mock_db.payment_transactions.docs:
        if t.get("session_id") == session_id:
            txn = t
            break
    assert txn["payment_status"] == "paid"
    assert txn["provisioned"] is True

    # Duplicate delivery attempt: rejected with 409
    dup_resp = client.post("/api/webhook/stripe", content=raw_bytes, headers={"Stripe-Signature": sig})
    assert dup_resp.status_code == 409
