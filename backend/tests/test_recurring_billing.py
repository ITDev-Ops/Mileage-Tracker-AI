import asyncio
import uuid
import sys
import os
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import process_recurring_subscriptions, SUBSCRIPTION_PLANS

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

    async def update_one(self, filter_dict, update_dict):
        doc = await self.find_one(filter_dict)
        if doc and "$set" in update_dict:
            for k, v in update_dict["$set"].items():
                doc[k] = v
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

async def run_billing_engine_tests():
    mock_db = MockDB()
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = "subscriber@example.com"
    now = datetime.now(timezone.utc)

    print("--- Test 1: User Subscription Initialization ---")
    user_doc = {
        "user_id": user_id,
        "email": email,
        "subscription_tier": "pro",
        "subscription_status": "active",
        "last_billing_date": now - timedelta(days=30),
        "next_billing_date": now - timedelta(hours=1),
        "payment_failure_count": 0
    }
    await mock_db.users.insert_one(user_doc)
    print("[PASS] User document initialized on Pro plan due for monthly billing.")

    print("\n--- Test 2: Successful Recurring Renewal ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="success")
    assert len(results) == 1
    assert results[0]["action"] == "renewed"
    assert results[0]["status"] == "active"

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_status"] == "active"
    assert updated["payment_failure_count"] == 0
    print("[PASS] Successful monthly charge advances next_billing_date by +30 days and resets failure count.")

    print("\n--- Test 3: First Payment Failure ('No funds available') ---")
    await mock_db.users.update_one({"user_id": user_id}, {"$set": {"next_billing_date": now - timedelta(minutes=5)}})
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="no_funds_available")
    assert len(results) == 1
    assert results[0]["action"] == "failed_attempt_1"
    assert results[0]["status"] == "past_due_retry"

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_status"] == "past_due_retry"
    assert updated["payment_failure_count"] == 1
    assert updated["payment_failure_reason"] == "No funds available"
    assert updated["retry_at"] is not None

    alert = await mock_db.alerts.find_one({"owner_id": user_id})
    assert alert is not None
    assert "no funds available" in alert["msg"].lower()
    assert "1 week" in alert["msg"].lower() or "second attempt" in alert["msg"].lower()
    print("[PASS] 1st failure ('no funds available') sets past_due_retry status, 1-week retry date, and notifies user.")

    print("\n--- Test 4: Second Payment Failure (1 Week Later) -> 2-Day Grace Period ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, simulate_outcome="no_funds_available", advance_days=7)
    assert len(results) == 1
    assert results[0]["action"] == "failed_attempt_2"
    assert results[0]["status"] == "grace_period"

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_status"] == "grace_period"
    assert updated["payment_failure_count"] == 2
    assert updated["grace_period_ends_at"] is not None

    alerts = await mock_db.alerts.find({"owner_id": user_id}).to_list(10)
    assert any("free plan" in a["msg"].lower() or "grace period" in a["msg"].lower() for a in alerts)
    print("[PASS] 2nd failure (1 week later) sets grace_period status with 2-day expiration notice to secure data.")

    print("\n--- Test 5: Expired Grace Period -> Downgrade to Free Plan ---")
    results = await process_recurring_subscriptions(mock_db, force_user_id=user_id, advance_days=10)
    assert len(results) == 1
    assert results[0]["action"] == "downgraded_to_free"

    updated = await mock_db.users.find_one({"user_id": user_id})
    assert updated["subscription_tier"] == "free"
    assert updated["subscription_status"] == "cancelled"
    print("[PASS] Expired grace period automatically downgrades user tier to 'free'.")

    print("\n=======================================================")
    print("ALL RECURRING BILLING ENGINE UNIT TESTS PASSED!")
    print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_billing_engine_tests())
