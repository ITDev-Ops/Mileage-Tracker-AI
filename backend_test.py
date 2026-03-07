"""
Multi Mile Tracker - Backend API Test for NEW Features
Testing the specific endpoints mentioned in the review request:
- PDF Report Export
- Bulk AI Classification 
- Auth flow
- Seed Data
"""

import requests
import json
import time
import uuid
from datetime import datetime

# Base URL from review request
BASE_URL = "https://gps-mileage-mvp.preview.emergentagent.com/api"

def test_auth_flow():
    """Test registration, login, and profile endpoints"""
    print("🔐 Testing Auth Flow...")
    
    # Generate unique email for testing
    unique_id = int(time.time())
    test_email = f"tester_{unique_id}@testmile.com"
    test_password = "testpass123"
    test_name = f"Test User {unique_id}"
    
    # 1. Register new user
    register_data = {
        "email": test_email,
        "password": test_password,
        "name": test_name
    }
    
    print(f"   Registering user: {test_email}")
    register_resp = requests.post(f"{BASE_URL}/auth/register", json=register_data)
    print(f"   Register Status: {register_resp.status_code}")
    
    if register_resp.status_code != 200:
        print(f"   Register Error: {register_resp.text}")
        return None, None
    
    register_result = register_resp.json()
    print(f"   ✅ User registered successfully")
    
    # 2. Login with registered user
    login_data = {
        "email": test_email,
        "password": test_password
    }
    
    print(f"   Logging in user: {test_email}")
    login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    print(f"   Login Status: {login_resp.status_code}")
    
    if login_resp.status_code != 200:
        print(f"   Login Error: {login_resp.text}")
        return None, None
        
    login_result = login_resp.json()
    token = login_result["token"]
    print(f"   ✅ Login successful, token obtained")
    
    # 3. Test GET /auth/me
    headers = {"Authorization": f"Bearer {token}"}
    me_resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print(f"   Profile Status: {me_resp.status_code}")
    
    if me_resp.status_code == 200:
        me_result = me_resp.json()
        print(f"   ✅ Profile retrieved: {me_result.get('name', 'Unknown')}")
    else:
        print(f"   ❌ Profile Error: {me_resp.text}")
        
    return token, headers

def test_seed_trips(headers):
    """Test POST /seed/trips to add sample data"""
    print("🌱 Testing Seed Data...")
    
    seed_resp = requests.post(f"{BASE_URL}/seed/trips", headers=headers)
    print(f"   Seed Status: {seed_resp.status_code}")
    
    if seed_resp.status_code == 200:
        seed_result = seed_resp.json()
        seeded_count = seed_result.get("seeded", 0)
        print(f"   ✅ Seeded {seeded_count} sample trips")
        return True
    else:
        print(f"   ❌ Seed Error: {seed_resp.text}")
        return False

def test_bulk_ai_classification(headers):
    """Test POST /ai/classify-all for bulk classification"""
    print("🤖 Testing Bulk AI Classification...")
    
    classify_resp = requests.post(f"{BASE_URL}/ai/classify-all", headers=headers, timeout=60)
    print(f"   Bulk Classify Status: {classify_resp.status_code}")
    
    if classify_resp.status_code == 200:
        classify_result = classify_resp.json()
        classified_count = classify_result.get("classified", 0)
        total_deductions = classify_result.get("total_deductions", 0)
        print(f"   ✅ Classified {classified_count} trips")
        print(f"   💰 Total deductions: ${total_deductions}")
        
        # Print some sample results
        results = classify_result.get("results", [])
        for i, result in enumerate(results[:3]):
            if "classification" in result:
                print(f"      Trip {i+1}: {result['classification']} (confidence: {result.get('confidence', 'N/A')})")
        
        return True
    else:
        print(f"   ❌ Bulk Classify Error: {classify_resp.text}")
        return False

def test_pdf_export(headers):
    """Test GET /reports/export/pdf?year=2026"""
    print("📄 Testing PDF Report Export...")
    
    pdf_resp = requests.get(f"{BASE_URL}/reports/export/pdf?year=2026", headers=headers)
    print(f"   PDF Export Status: {pdf_resp.status_code}")
    
    if pdf_resp.status_code == 200:
        # Check if response is actually PDF
        content_type = pdf_resp.headers.get("content-type", "")
        content_length = len(pdf_resp.content)
        
        print(f"   Content-Type: {content_type}")
        print(f"   Content-Length: {content_length} bytes")
        
        if "pdf" in content_type.lower() and content_length > 100:
            print(f"   ✅ PDF export successful - {content_length} bytes")
            return True
        else:
            print(f"   ❌ Response doesn't appear to be a valid PDF")
            print(f"   First 100 chars: {pdf_resp.text[:100]}")
            return False
    else:
        print(f"   ❌ PDF Export Error: {pdf_resp.text}")
        return False

def test_csv_export(headers):
    """Test GET /reports/export/csv for comparison"""
    print("📊 Testing CSV Export...")
    
    csv_resp = requests.get(f"{BASE_URL}/reports/export/csv?year=2026", headers=headers)
    print(f"   CSV Export Status: {csv_resp.status_code}")
    
    if csv_resp.status_code == 200:
        content_type = csv_resp.headers.get("content-type", "")
        content_length = len(csv_resp.content)
        
        print(f"   Content-Type: {content_type}")
        print(f"   Content-Length: {content_length} bytes")
        
        if content_length > 0:
            print(f"   ✅ CSV export successful - {content_length} bytes")
            # Show first few lines
            lines = csv_resp.text.split('\n')[:3]
            print(f"   Preview: {lines}")
            return True
        else:
            print(f"   ❌ Empty CSV response")
            return False
    else:
        print(f"   ❌ CSV Export Error: {csv_resp.text}")
        return False

def main():
    """Run all tests in sequence"""
    print("=" * 60)
    print("🧪 Multi Mile Tracker - Backend API Tests")
    print("=" * 60)
    
    results = {
        "auth_flow": False,
        "seed_trips": False,
        "bulk_classification": False,
        "pdf_export": False,
        "csv_export": False
    }
    
    # 1. Test auth flow first
    token, headers = test_auth_flow()
    if token and headers:
        results["auth_flow"] = True
        
        # 2. Seed sample data
        if test_seed_trips(headers):
            results["seed_trips"] = True
            
            # 3. Test bulk classification
            if test_bulk_ai_classification(headers):
                results["bulk_classification"] = True
            
            # 4. Test PDF export
            if test_pdf_export(headers):
                results["pdf_export"] = True
            
            # 5. Test CSV export for comparison
            if test_csv_export(headers):
                results["csv_export"] = True
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name.replace('_', ' ').title():<25} {status}")
    
    passed_count = sum(results.values())
    total_count = len(results)
    
    print(f"\nOverall: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("🎉 All tests PASSED!")
    elif passed_count >= 3:
        print("⚠️  Most tests passed, some issues found")
    else:
        print("🚨 Critical issues found!")
    
    return results

if __name__ == "__main__":
    main()