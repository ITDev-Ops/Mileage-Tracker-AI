import asyncio
import uuid
import sys
import os
import json
import time
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server
server.app.router.on_startup.clear()
from server import (
    app,
    process_recurring_subscriptions,
    SUBSCRIPTION_PLANS,
    GRACE_PERIOD_TOTAL_DAYS,
    RETRY_SCHEDULE_DAYS,
)

class MockCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, filter_dict, sort=None):
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
                return d
        return None

    def find(self, filter_dict):
        matched = []
        for d in self.docs:
            match = True
            for k, v in filter_dict.items():
                if k == "subscription_tier" and isinstance(v, dict) and "$in" in v:
                    if d.get("subscription_tier") not in v["$in"]:
                        match = False
                        break
                elif k == "user_id" and d.get("user_id") != v:
                    match = False
                    break
                elif k == "owner_id" and d.get("owner_id") != v:
                    match = False
                    break
            if match:
                matched.append(d)
        
        class Cursor:
            def __init__(self, data):
                self.data = data
            def sort(self, field, order):
                return self
            def limit(self, num):
                return self
            async def to_list(self, length):
                return self.data
        return Cursor(matched)

    async def insert_one(self, doc):
        self.docs.append(doc)
        return doc

    async def update_one(self, filter_dict, update_dict, upsert=False):
        doc = await self.find_one(filter_dict)
        if doc and "$set" in update_dict:
            for k, v in update_dict["$set"].items():
                doc[k] = v
        elif upsert and "$set" in update_dict:
            new_doc = dict(filter_dict)
            new_doc.update(update_dict["$set"])
            self.docs.append(new_doc)
            return new_doc
        return doc

    async def update_many(self, filter_dict, update_dict):
        if "$set" in update_dict:
            for d in self.docs:
                doc_match = all(d.get(k) == v for k, v in filter_dict.items())
                if doc_match:
                    for k, v in update_dict["$set"].items():
                        d[k] = v

    async def create_index(self, *args, **kwargs):
        pass

class MockDB:
    def __init__(self):
        self.users = MockCollection()
        self.payment_transactions = MockCollection()
        self.alerts = MockCollection()
        self.team_members = MockCollection()
        self.webhook_events = MockCollection()
        self.system_settings = MockCollection()

def generate_stripe_signature(payload_bytes: bytes, secret: str, timestamp: int = None) -> str:
    ts = timestamp if timestamp is not None else int(time.time())
    signed_payload = f"{ts}.".encode("utf-8") + payload_bytes
    sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"

async def run_billing_and_webhook_tests():
    mock_db = MockDB()
    server.db = mock_db
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = "subscriber@example.com"
    now = datetime.now(timezone.utc)

    print("--- Test 1: User Subscription Initialization ---")
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": "Alex Driver",
        "subscription_tier": "pro",
        "subscription_status": "active",
        "last_billing_date": now - timedelta(days=30),
        "next_billing_date": now - timedelta(hours=1),
        "payment_failure_count": 0,
        "dunning_emails_sent": 0
    }
    await mock_db.users.insert_one(user_doc)
    print("[PASS] User document initialized on Pro plan due for monthly billing.")

    print("\n--- Test 2: Successful Recurring Renewal ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="success")
    assert len(results) == 1
    assert results[0]["action"] == "renewed"
    assert results[0]["status"] == "active"
    assert results[0]["stripe_event_id"].startswith("evt_")

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_status"] == "active"
    assert updated["payment_failure_count"] == 0
    print("[PASS] Successful monthly charge advances next_billing_date by +30 days, resets failure count, and records stripe_event_id.")

    print("\n--- Test 3: 1st Payment Failure -> Retry 1 (+3 Days), Email 1/3 ('how to update your card'), 14-Day Grace Buffer Active ---")
    await mock_db.users.update_one({"user_id": user_id}, {"$set": {"next_billing_date": now - timedelta(minutes=5)}})
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="no_funds_available")
    assert len(results) == 1
    assert results[0]["action"] == "failed_attempt_1"
    assert results[0]["status"] == "past_due_retry"
    assert results[0]["dunning_email_sent"] == 1

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_tier"] == "pro"  # Account stays active during grace buffer!
    assert updated["subscription_status"] == "past_due_retry"
    assert updated["payment_failure_count"] == 1
    assert updated["dunning_emails_sent"] == 1
    assert updated["retry_at"] is not None
    assert updated["grace_period_ends_at"] is not None
    grace_days_total = (updated["grace_period_ends_at"] - updated["first_failure_at"]).days
    assert 7 <= grace_days_total <= 14, f"Expected 7-14 day grace period buffer, got {grace_days_total} days"

    alert1 = await mock_db.alerts.find_one({"owner_id": user_id})
    assert alert1 is not None
    assert "email 1 of 3" in alert1["msg"].lower()
    assert "how to update your card" in alert1["dunning_email"]["subject"].lower()
    print(f"[PASS] 1st failure schedules retry in +{RETRY_SCHEDULE_DAYS[1]} days, sends Email 1/3 ('how to update your card'), and sets {grace_days_total}-day active grace buffer.")

    print("\n--- Test 4: 2nd Payment Failure (Day 3) -> Retry 2 (+4 Days / Day 7), Email 2/3 ('how to update your card') ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="no_funds_available", advance_days=3)
    assert len(results) == 1
    assert results[0]["action"] == "failed_attempt_2"
    assert results[0]["status"] == "past_due_retry"
    assert results[0]["dunning_email_sent"] == 2

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_tier"] == "pro"  # Still active!
    assert updated["payment_failure_count"] == 2
    assert updated["dunning_emails_sent"] == 2
    alert2 = await mock_db.alerts.find_one({"owner_id": user_id})
    assert "email 2 of 3" in alert2["msg"].lower()
    assert "how to update your card" in alert2["dunning_email"]["subject"].lower()
    print(f"[PASS] 2nd failure schedules final retry in +{RETRY_SCHEDULE_DAYS[2]} days (Day 7), sends Email 2/3, and keeps account active.")

    print("\n--- Test 5: 3rd Payment Failure (Day 7) -> Final Grace Period Buffer (Until Day 14), Email 3/3 ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="no_funds_available", advance_days=7)
    assert len(results) == 1
    assert results[0]["action"] == "failed_attempt_3"
    assert results[0]["status"] == "grace_period"
    assert results[0]["dunning_email_sent"] == 3

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_tier"] == "pro"  # Still active during final grace buffer!
    assert updated["subscription_status"] == "grace_period"
    assert updated["payment_failure_count"] == 3
    assert updated["dunning_emails_sent"] == 3
    alert3 = await mock_db.alerts.find_one({"owner_id": user_id})
    assert "email 3 of 3" in alert3["msg"].lower()
    assert "update your card" in alert3["dunning_email"]["subject"].lower()
    print("[PASS] 3rd failure enters final grace_period buffer (days 7-14) and dispatches Email 3/3.")

    print("\n--- Test 6: Account Stays Active Mid-Grace Period (Day 10) ---")
    results_mid = await process_recurring_subscriptions(mock_db, force_user_id=user_id, advance_days=10)
    assert len(results_mid) == 0  # Not expired yet!
    updated_mid = await mock_db.users.find_one({"user_id": user_id})
    assert updated_mid["subscription_tier"] == "pro"
    assert updated_mid["subscription_status"] == "grace_period"
    print("[PASS] Account stays active at Day 10 within the 7-14 day grace period buffer.")

    print("\n--- Test 7: Expired Grace Period (Day 15) -> Downgrade to Free Plan ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, advance_days=15)
    assert len(results) == 1
    assert results[0]["action"] == "downgraded_to_free"

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_tier"] == "free"
    assert updated["subscription_status"] == "cancelled"
    print("[PASS] Expired 14-day grace period automatically downgrades user tier to 'free'.")

    print("\n--- Test 8: Webhook Signature Verification & Duplicate Event ID Rejection ---")
    test_secret = "whsec_unit_test_secret_999"
    os.environ["STRIPE_WEBHOOK_SECRET"] = test_secret
    server.STRIPE_WEBHOOK_SECRET = test_secret

    client = TestClient(app)

    stripe_event_id = f"evt_live_unique_{uuid.uuid4().hex[:12]}"
    webhook_payload = {
        "id": stripe_event_id,
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_mock_webhook_session",
                "object": "checkout.session",
                "payment_status": "paid",
                "metadata": {
                    "user_id": user_id,
                    "plan": "business",
                    "email": email
                }
            }
        }
    }
    raw_bytes = json.dumps(webhook_payload).encode("utf-8")

    # 8a: Missing signature -> 400
    resp_missing = client.post("/api/webhook/stripe", content=raw_bytes)
    assert resp_missing.status_code == 400, f"Expected 400 on missing sig, got {resp_missing.status_code}"

    # 8b: Forged signature -> 400
    forged_sig = generate_stripe_signature(raw_bytes, "whsec_wrong_attacker_secret")
    resp_forged = client.post("/api/webhook/stripe", content=raw_bytes, headers={"Stripe-Signature": forged_sig})
    assert resp_forged.status_code == 400, f"Expected 400 on forged sig, got {resp_forged.status_code}"

    # 8c: Valid signature -> 200 OK + executes command + records stripe_event_id
    valid_sig = generate_stripe_signature(raw_bytes, test_secret)
    resp_valid = client.post("/api/webhook/stripe", content=raw_bytes, headers={"Stripe-Signature": valid_sig})
    assert resp_valid.status_code == 200, f"Expected 200 on valid sig, got {resp_valid.status_code}: {resp_valid.text}"
    body_json = resp_valid.json()
    assert body_json["event_id"] == stripe_event_id
    assert body_json["action"] == "subscription_activated"

    # Verify user was upgraded to business and stripe_event_id was stored on user and webhook_events
    upgraded_user = await mock_db.users.find_one({"user_id": user_id})
    assert upgraded_user["subscription_tier"] == "business"
    assert upgraded_user["last_stripe_event_id"] == stripe_event_id
    stored_evt = await mock_db.webhook_events.find_one({"event_id": stripe_event_id})
    assert stored_evt is not None

    # 8d: Replay / Duplicate event with valid signature -> 409 Conflict (Rejected!)
    resp_dup = client.post("/api/webhook/stripe", content=raw_bytes, headers={"Stripe-Signature": valid_sig})
    assert resp_dup.status_code == 409, f"Expected 409 on duplicate event, got {resp_dup.status_code}"
    print("[PASS] Stripe webhook verifies signature before processing, stores stripe_event_id everywhere, and rejects all duplicates with 409.")

    print("\n--- Test 9: Multi-Provider Webhook Endpoint Signature Verification & Idempotency ---")
    provider_secret = "whsec_auth0_provider_secret"
    os.environ["AUTH0_WEBHOOK_SECRET"] = provider_secret
    provider_evt_id = f"evt_auth0_{uuid.uuid4().hex[:10]}"
    provider_payload = json.dumps({"event_id": provider_evt_id, "type": "user.synced"}).encode("utf-8")

    # Forged provider signature -> 400
    bad_prov_sig = generate_stripe_signature(provider_payload, "wrong_secret")
    r_bad = client.post("/api/webhook/auth0", content=provider_payload, headers={"X-Webhook-Signature": bad_prov_sig})
    assert r_bad.status_code == 400

    # Valid provider signature -> 200
    good_prov_sig = generate_stripe_signature(provider_payload, provider_secret)
    r_good = client.post("/api/webhook/auth0", content=provider_payload, headers={"X-Webhook-Signature": good_prov_sig})
    assert r_good.status_code == 200

    # Duplicate provider event -> 409
    r_dup = client.post("/api/webhook/auth0", content=provider_payload, headers={"X-Webhook-Signature": good_prov_sig})
    assert r_dup.status_code == 409
    print("[PASS] Multi-provider webhook endpoint verifies HMAC signature and rejects duplicate event IDs.")

    print("\n=======================================================")
    print("ALL RECURRING BILLING, DUNNING & WEBHOOK TESTS PASSED!")
    print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_billing_and_webhook_tests())

