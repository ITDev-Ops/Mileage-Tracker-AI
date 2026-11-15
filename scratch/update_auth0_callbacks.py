"""
Auth0 Application Callback URL Updater
Usage:
  python scratch/update_auth0_callbacks.py [MANAGEMENT_API_TOKEN]

This script updates the Auth0 Application 'lDGAMwvArDFK38vWl6mH8f1HXSDJlNYb'
on domain 'dev-j470s7j0sap6h6us.us.auth0.com' to register all required Expo Go,
standalone, and web callback URLs so that Google OAuth completes smoothly without
'Callback URL mismatch' errors.
"""

import sys
import json
import urllib.request
import urllib.error

AUTH0_DOMAIN = "dev-j470s7j0sap6h6us.us.auth0.com"
CLIENT_ID = "lDGAMwvArDFK38vWl6mH8f1HXSDJlNYb"

ALLOWED_CALLBACKS = [
    "mileagetracker://auth",
    "mileagetracker://callback",
    "exp://localhost:8081",
    "exp://localhost:8081/--",
    "exp://localhost:8081/--/auth",
    "exp://127.0.0.1:8081",
    "exp://127.0.0.1:8081/--",
    "exp://127.0.0.1:8081/--/auth",
    "exp://localhost:3000",
    "exp://localhost:3000/--",
    "exp://localhost:3000/--/auth",
    "https://auth.expo.io/@multisystems/mileage-tracker-ai",
    "com.multisystems.mileagetrackerai://dev-j470s7j0sap6h6us.us.auth0.com/ios/com.multisystems.mileagetrackerai/callback",
    "com.multisystems.mileagetrackerai://dev-j470s7j0sap6h6us.us.auth0.com/android/com.multisystems.mileagetrackerai/callback",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
    "https://ai-mile-tracker-f2fed3697be0.herokuapp.com",
    "https://globalsysnetcyber.com"
]

ALLOWED_LOGOUTS = [
    "https://auth.expo.io/@multisystems/mileage-tracker-ai",
    "http://localhost:8081",
    "http://localhost:3000",
    "https://ai-mile-tracker-f2fed3697be0.herokuapp.com",
    "https://globalsysnetcyber.com"
]

ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
    "https://ai-mile-tracker-f2fed3697be0.herokuapp.com"
]

def update_auth0_client(token: str):
    url = f"https://{AUTH0_DOMAIN}/api/v2/clients/{CLIENT_ID}"
    
    # 1. Fetch current client settings to merge callbacks
    req_get = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="GET"
    )
    
    try:
        with urllib.request.urlopen(req_get) as resp:
            current_data = json.loads(resp.read().decode())
            existing_callbacks = current_data.get("callbacks", [])
            existing_logouts = current_data.get("allowed_logout_urls", [])
            existing_origins = current_data.get("web_origins", [])
            print(f"[Auth0] Current app name: {current_data.get('name')}")
    except urllib.error.HTTPError as e:
        print(f"[Auth0 Error] Failed to fetch client: {e.code} - {e.read().decode()}")
        return False

    merged_callbacks = list(dict.fromkeys(existing_callbacks + ALLOWED_CALLBACKS))
    merged_logouts = list(dict.fromkeys(existing_logouts + ALLOWED_LOGOUTS))
    merged_origins = list(dict.fromkeys(existing_origins + ALLOWED_ORIGINS))

    patch_payload = {
        "callbacks": merged_callbacks,
        "allowed_logout_urls": merged_logouts,
        "web_origins": merged_origins
    }

    req_patch = urllib.request.Request(
        url,
        data=json.dumps(patch_payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )

    try:
        with urllib.request.urlopen(req_patch) as resp:
            updated_data = json.loads(resp.read().decode())
            print(f"[Auth0 Success] Application '{updated_data.get('name')}' updated successfully!")
            print(f"Registered {len(merged_callbacks)} Allowed Callback URLs.")
            return True
    except urllib.error.HTTPError as e:
        print(f"[Auth0 Error] Failed to update client: {e.code} - {e.read().decode()}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()
        update_auth0_client(token)
    else:
        print("Please provide the Auth0 Management API Token as an argument:")
        print("  python scratch/update_auth0_callbacks.py <TOKEN>")

