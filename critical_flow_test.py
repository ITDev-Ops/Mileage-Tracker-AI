"""
Critical Flow Testing for Mileage Tracker AI Backend
Specifically testing the critical flows mentioned in the review request:
1. User Registration and Login
2. Direct Trip Creation (POST /api/trips/direct)
3. Dashboard Stats Verification 
4. Stats Update Verification after trip creation
"""

import requests
import json
import time
from datetime import datetime, timezone, timedelta
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import os

# Base URL from review request or local fallback
backend_url = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'http://localhost:8000').rstrip('/')
if not backend_url.endswith('/api'):
    backend_url = f"{backend_url}/api"
BASE_URL = backend_url

def test_critical_flows():
    """Test all critical flows in sequence"""
    print("🔍 CRITICAL FLOW TESTING - Mileage Tracker AI Backend")
    print("=" * 70)
    
    # Generate unique test data
    unique_id = int(time.time())
    test_email = f"tester_{unique_id}@criticalflow.com"
    test_password = "testpass123"
    test_name = f"Critical Flow Test User {unique_id}"
    
    results = {
        "user_registration": False,
        "user_login": False, 
        "dashboard_stats_before": False,
        "direct_trip_creation": False,
        "dashboard_stats_after": False,
        "stats_verification": False
    }
    
    # Step 1: User Registration
    print("\n🔐 STEP 1: User Registration")
    print("-" * 30)
    
    register_data = {
        "email": test_email,
        "password": test_password,
        "name": test_name
    }
    
    print(f"   Registering: {test_email}")
    try:
        register_resp = requests.post(f"{BASE_URL}/auth/register", json=register_data)
        print(f"   Status: {register_resp.status_code}")
        
        if register_resp.status_code == 200:
            register_result = register_resp.json()
            print(f"   ✅ Registration successful - User ID: {register_result.get('user', {}).get('user_id', 'N/A')}")
            results["user_registration"] = True
        else:
            print(f"   ❌ Registration failed: {register_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Registration error: {str(e)}")
        return results
    
    # Step 2: User Login
    print("\n🔑 STEP 2: User Login")
    print("-" * 25)
    
    login_data = {
        "email": test_email,
        "password": test_password
    }
    
    try:
        login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        print(f"   Status: {login_resp.status_code}")
        
        if login_resp.status_code == 200:
            login_result = login_resp.json()
            token = login_result.get("access_token")
            headers = {"Authorization": f"Bearer {token}"}
            print(f"   ✅ Login successful - Token obtained (length: {len(token) if token else 0})")
            results["user_login"] = True
        else:
            print(f"   ❌ Login failed: {login_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Login error: {str(e)}")
        return results
    
    # Step 3: Get Dashboard Stats (Before)
    print("\n📊 STEP 3: Dashboard Stats (BEFORE trip creation)")
    print("-" * 50)
    
    try:
        stats_before_resp = requests.get(f"{BASE_URL}/dashboard/stats", headers=headers)
        print(f"   Status: {stats_before_resp.status_code}")
        
        if stats_before_resp.status_code == 200:
            stats_before = stats_before_resp.json()
            required_fields = ["monthly_miles", "monthly_deductions", "yearly_miles", "yearly_deductions"]
            
            print("   Dashboard stats retrieved:")
            for field in required_fields:
                value = stats_before.get(field, "MISSING")
                print(f"     {field}: {value}")
            
            # Check if all required fields are present
            missing_fields = [field for field in required_fields if field not in stats_before]
            if not missing_fields:
                print(f"   ✅ All required dashboard fields present")
                results["dashboard_stats_before"] = True
            else:
                print(f"   ❌ Missing required fields: {missing_fields}")
                
            # Store before values for comparison
            before_monthly_miles = stats_before.get("monthly_miles", 0)
            before_monthly_deductions = stats_before.get("monthly_deductions", 0)
            before_yearly_miles = stats_before.get("yearly_miles", 0) 
            before_yearly_deductions = stats_before.get("yearly_deductions", 0)
            
        else:
            print(f"   ❌ Dashboard stats failed: {stats_before_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Dashboard stats error: {str(e)}")
        return results
    
    # Step 4: Create Trip via Direct Sync
    print("\n🚗 STEP 4: Create Trip (Direct Sync)")
    print("-" * 40)
    
    # Generate realistic trip data
    now = datetime.now(timezone.utc)
    start_time = (now - timedelta(hours=2)).isoformat().replace('+00:00', 'Z')
    end_time = (now - timedelta(hours=1)).isoformat().replace('+00:00', 'Z')
    
    trip_data = {
        "start_time": start_time,
        "end_time": end_time,
        "start_lat": 37.7749,
        "start_lng": -122.4194,
        "end_lat": 37.7849,
        "end_lng": -122.4094,
        "distance": 15.5,  # miles
        "classification": "business",  # Important for deduction calculation
        "start_address": "Office - 123 Business St",
        "end_address": "Client Meeting - 456 Corporate Ave",
        "notes": "Client meeting for critical flow testing"
    }
    
    print(f"   Creating trip: {trip_data['distance']} miles, classification: {trip_data['classification']}")
    try:
        trip_resp = requests.post(f"{BASE_URL}/trips/direct", json=trip_data, headers=headers)
        print(f"   Status: {trip_resp.status_code}")
        
        if trip_resp.status_code == 200:
            trip_result = trip_resp.json()
            trip_id = trip_result.get("trip_id")
            deduction_value = trip_result.get("deduction_value", 0)
            print(f"   ✅ Trip created successfully")
            print(f"     Trip ID: {trip_id}")
            print(f"     Distance: {trip_result.get('distance')} miles")
            print(f"     Classification: {trip_result.get('classification')}")
            print(f"     Deduction Value: ${deduction_value}")
            results["direct_trip_creation"] = True
            
            # Calculate expected deduction (business rate is $0.70/mile as per code)
            expected_deduction = 15.5 * 0.70
            print(f"     Expected Deduction: ${expected_deduction:.2f}")
            
        else:
            print(f"   ❌ Trip creation failed: {trip_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Trip creation error: {str(e)}")
        return results
    
    # Step 5: Get Dashboard Stats (After) - CRITICAL VERIFICATION
    print("\n📈 STEP 5: Dashboard Stats (AFTER trip creation)")
    print("-" * 50)
    
    # Wait a moment for any processing
    time.sleep(2)
    
    try:
        stats_after_resp = requests.get(f"{BASE_URL}/dashboard/stats", headers=headers)
        print(f"   Status: {stats_after_resp.status_code}")
        
        if stats_after_resp.status_code == 200:
            stats_after = stats_after_resp.json()
            
            print("   Updated dashboard stats:")
            after_monthly_miles = stats_after.get("monthly_miles", 0)
            after_monthly_deductions = stats_after.get("monthly_deductions", 0)
            after_yearly_miles = stats_after.get("yearly_miles", 0)
            after_yearly_deductions = stats_after.get("yearly_deductions", 0)
            
            print(f"     monthly_miles: {after_monthly_miles}")
            print(f"     monthly_deductions: ${after_monthly_deductions}")
            print(f"     yearly_miles: {after_yearly_miles}")
            print(f"     yearly_deductions: ${after_yearly_deductions}")
            
            results["dashboard_stats_after"] = True
            
        else:
            print(f"   ❌ Dashboard stats after failed: {stats_after_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Dashboard stats after error: {str(e)}")
        return results
    
    # Step 6: Verify Stats Updates - MOST CRITICAL
    print("\n🔍 STEP 6: STATS UPDATE VERIFICATION")
    print("-" * 40)
    
    print("   Comparing before vs after stats:")
    
    # Calculate changes
    monthly_miles_change = after_monthly_miles - before_monthly_miles
    monthly_deductions_change = after_monthly_deductions - before_monthly_deductions
    yearly_miles_change = after_yearly_miles - before_yearly_miles
    yearly_deductions_change = after_yearly_deductions - before_yearly_deductions
    
    print(f"   Monthly Miles: {before_monthly_miles} → {after_monthly_miles} (Δ{monthly_miles_change})")
    print(f"   Monthly Deductions: ${before_monthly_deductions} → ${after_monthly_deductions} (Δ${monthly_deductions_change})")
    print(f"   Yearly Miles: {before_yearly_miles} → {after_yearly_miles} (Δ{yearly_miles_change})")  
    print(f"   Yearly Deductions: ${before_yearly_deductions} → ${after_yearly_deductions} (Δ${yearly_deductions_change})")
    
    # Verify expected changes (trip was 15.5 miles business)
    expected_miles_increase = 15.5
    expected_deduction_increase = round(15.5 * 0.70, 2)  # $0.70/mile business rate
    
    # Check if stats updated correctly
    stats_updated_correctly = True
    issues = []
    
    if abs(monthly_miles_change - expected_miles_increase) > 0.1:
        issues.append(f"Monthly miles change {monthly_miles_change} != expected {expected_miles_increase}")
        stats_updated_correctly = False
        
    if abs(yearly_miles_change - expected_miles_increase) > 0.1:
        issues.append(f"Yearly miles change {yearly_miles_change} != expected {expected_miles_increase}")
        stats_updated_correctly = False
        
    if abs(monthly_deductions_change - expected_deduction_increase) > 0.01:
        issues.append(f"Monthly deductions change ${monthly_deductions_change} != expected ${expected_deduction_increase}")
        stats_updated_correctly = False
        
    if abs(yearly_deductions_change - expected_deduction_increase) > 0.01:
        issues.append(f"Yearly deductions change ${yearly_deductions_change} != expected ${expected_deduction_increase}")
        stats_updated_correctly = False
    
    if stats_updated_correctly:
        print(f"   ✅ STATS CORRECTLY UPDATED!")
        print(f"     Expected: +{expected_miles_increase} miles, +${expected_deduction_increase} deductions")
        print(f"     Actual: +{monthly_miles_change} miles, +${monthly_deductions_change} deductions")
        results["stats_verification"] = True
    else:
        print(f"   ❌ STATS UPDATE ISSUES FOUND:")
        for issue in issues:
            print(f"     - {issue}")
    
    return results

def print_summary(results):
    """Print final test summary"""
    print("\n" + "=" * 70)
    print("📋 CRITICAL FLOW TEST RESULTS")
    print("=" * 70)
    
    test_descriptions = {
        "user_registration": "User Registration (POST /api/auth/register)",
        "user_login": "User Login (POST /api/auth/login)", 
        "dashboard_stats_before": "Dashboard Stats Before (GET /api/dashboard/stats)",
        "direct_trip_creation": "Direct Trip Creation (POST /api/trips/direct)",
        "dashboard_stats_after": "Dashboard Stats After (GET /api/dashboard/stats)",
        "stats_verification": "Stats Update Verification (CRITICAL)"
    }
    
    for test_name, description in test_descriptions.items():
        status = "✅ PASSED" if results.get(test_name, False) else "❌ FAILED"
        print(f"{description:<55} {status}")
    
    passed_count = sum(results.values())
    total_count = len(results)
    
    print(f"\nOverall: {passed_count}/{total_count} critical tests passed")
    
    if passed_count == total_count:
        print("🎉 ALL CRITICAL FLOWS WORKING PERFECTLY!")
    elif results.get("stats_verification", False):
        print("✅ CORE FUNCTIONALITY WORKING - Stats properly update after trip sync")
    else:
        print("🚨 CRITICAL ISSUE - Stats may not be updating correctly after trip creation")
    
    # Highlight the most important finding
    if results.get("stats_verification", False):
        print("\n🔥 KEY FINDING: Direct trip sync properly updates dashboard statistics")
        print("   This confirms that synced trips correctly integrate with dashboard calculations")
    else:
        print("\n⚠️  KEY CONCERN: Dashboard statistics may not update properly after direct trip sync")
        print("   This could affect user experience and data accuracy")

if __name__ == "__main__":
    try:
        results = test_critical_flows()
        print_summary(results)
    except KeyboardInterrupt:
        print("\n⏹️ Testing interrupted by user")
    except Exception as e:
        print(f"\n💥 Unexpected error during testing: {str(e)}")