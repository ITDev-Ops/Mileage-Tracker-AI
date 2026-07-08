import asyncio
import os
import time
import requests
import motor.motor_asyncio
import certifi
import uuid
import sys
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load env file to get MONGO_URI
backend_dir = Path("c:/Users/hue_s/.gemini/antigravity-ide/scratch/Mileage-Tracker-AI/backend")
load_dotenv(backend_dir / ".env")

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "multimile_db")
BASE_URL = "http://localhost:8000/api"

import bcrypt

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def check_db_user(email):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    user = await db.users.find_one({"email": email.strip().lower()})
    client.close()
    return user

async def set_db_user_password(email, password):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    pw_hash = get_password_hash(password)
    await db.users.update_one({"email": email.strip().lower()}, {"$set": {"password_hash": pw_hash}})
    client.close()

async def get_db_invitation(email):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    inv = await db.invitations.find_one({"email": email.strip().lower()})
    client.close()
    return inv

async def get_db_team_member(email):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    member = await db.team_members.find_one({"email": email.strip().lower()})
    client.close()
    return member

def test_token_invitation_flow():
    print("\n==========================================")
    print("RUNNING TOKENIZED INVITATION FLOW TESTS")
    print("==========================================\n")
    
    # 1. Create a Team Owner user
    owner_email = f"owner_tok_{int(time.time())}@example.com"
    print(f"1. Registering Team Owner: {owner_email}")
    owner_resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": owner_email,
        "password": "ownerpassword123",
        "name": "Team Owner"
    })
    assert owner_resp.status_code == 200, f"Owner registration failed: {owner_resp.text}"
    owner_data = owner_resp.json()
    owner_token = owner_data["access_token"]
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # 2. Invite a new member
    invitee_email = f"invitee_tok_{int(time.time())}@example.com"
    invitee_name = "Invitee Token User"
    print(f"2. Inviting a new member: {invitee_email}")
    invite_resp = requests.post(f"{BASE_URL}/team/invite", headers=headers, json={
        "email": invitee_email,
        "name": invitee_name,
        "role": "Driver"
    })
    assert invite_resp.status_code == 200, f"Invitation failed: {invite_resp.text}"
    invite_data = invite_resp.json()
    
    # Assert placeholder user was created on invite
    print("   Verifying placeholder user exists in db...")
    db_user = asyncio.run(check_db_user(invitee_email))
    assert db_user is not None, "Placeholder user not created in db"
    assert db_user.get("is_active") is False, f"Expected is_active to be False, got {db_user.get('is_active')}"
    assert db_user.get("status") == "invited", f"Expected status to be 'invited', got {db_user.get('status')}"
    print("   ✅ Placeholder user verified.")
    
    # Try logging in with the placeholder user (should fail)
    print("   Verifying placeholder user cannot log in...")
    asyncio.run(set_db_user_password(invitee_email, "somepassword123"))
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": invitee_email,
        "password": "somepassword123"
    })
    assert login_resp.status_code == 400, f"Expected 400 Bad Request for inactive login, got {login_resp.status_code}"
    assert "not active" in login_resp.text.lower(), f"Expected 'not active' message, got: {login_resp.text}"
    print("   ✅ Inactive login rejection verified.")

    # Get invitation token from database
    print("   Retrieving invitation token...")
    db_inv = asyncio.run(get_db_invitation(invitee_email))
    assert db_inv is not None, "Invitation doc not found in database"
    token = db_inv["token"]
    print(f"   Invitation token: {token}")

    # 3. Validate token endpoint
    print(f"3. Querying /auth/validate-token?token={token}")
    val_resp = requests.get(f"{BASE_URL}/auth/validate-token?token={token}")
    assert val_resp.status_code == 200, f"Token validation failed: {val_resp.text}"
    val_data = val_resp.json()
    assert val_data["email"] == invitee_email, f"Expected email {invitee_email}, got {val_data['email']}"
    assert val_data["name"] == invitee_name, f"Expected name {invitee_name}, got {val_data['name']}"
    print("   ✅ Token validation endpoint verified.")

    # 4. Register the invited user using the token
    print("4. Completing signup with password and token...")
    reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": invitee_email,
        "password": "inviteepassword123",
        "name": invitee_name,
        "token": token
    })
    assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
    reg_data = reg_resp.json()
    print("   ✅ Registration successful.")

    # 5. Verify user activation in database
    print("5. Verifying user is now active in database...")
    db_user = asyncio.run(check_db_user(invitee_email))
    assert db_user.get("is_active") is True, "User is not active in database"
    assert db_user.get("status") == "active", f"Expected status to be 'active', got {db_user.get('status')}"
    print("   ✅ User activation verified.")

    # 6. Verify team member contains user_id and is Active
    print("6. Verifying team member is active and user_id is linked...")
    db_member = asyncio.run(get_db_team_member(invitee_email))
    assert db_member.get("status") == "Active", f"Expected status 'Active', got {db_member.get('status')}"
    assert db_member.get("user_id") == db_user["user_id"], f"Expected user_id link to be {db_user['user_id']}, got {db_member.get('user_id')}"
    print("   ✅ Team member linkage verified.")

    # 7. Verify invitation token is cleaned up
    print("7. Verifying token cleanup...")
    db_inv = asyncio.run(get_db_invitation(invitee_email))
    assert db_inv is None, "Invitation token was not deleted from database"
    print("   ✅ Invitation token cleanup verified.")

    print("\n==========================================")
    print("ALL TOKENIZED INVITATION FLOW TESTS PASSED! 🎉")
    print("==========================================\n")

if __name__ == "__main__":
    test_token_invitation_flow()
