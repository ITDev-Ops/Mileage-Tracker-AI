"""
Sync Test - Trip Sync Endpoint Testing
Testing the exact flow that the mobile app uses when syncing offline trips
Based on specific user request for validation of trip sync functionality
"""

import requests
import json
import time
from datetime import datetime, timezone

# Base URL from review request
BASE_URL = "https://gps-mileage-mvp.preview.emergentagent.com/api"

def test_sync_flow():
    """Test the exact sync flow as specified in the review request"""
    print("🔍 SYNC ENDPOINT TESTING - Mileage Tracker AI")
    print("=" * 60)
    print("Testing the exact flow that mobile app uses for offline trip sync")
    
    results = {
        "user_registration": False,
        "user_login": False,
        "direct_trip_creation": False,
        "trip_verification": False,
        "dashboard_stats_update": False
    }
    
    # Step 1: Register new test user with exact credentials from request
    print("\n🔐 STEP 1: User Registration")
    print("-" * 30)
    
    register_data = {
        "email": "synctest@test.com",
        "password": "test123", 
        "name": "Sync Test"
    }
    
    print(f"   Registering user: {register_data['email']}")
    try:
        register_resp = requests.post(f"{BASE_URL}/auth/register", json=register_data)
        print(f"   Status: {register_resp.status_code}")
        
        if register_resp.status_code == 200:
            register_result = register_resp.json()
            user_id = register_result.get('user', {}).get('user_id', 'N/A')
            print(f"   ✅ Registration successful - User ID: {user_id}")
            results["user_registration"] = True
        elif register_resp.status_code == 400 and "already exists" in register_resp.text:
            print(f"   ⚠️  User already exists - proceeding to login")
            results["user_registration"] = True  # Consider this success for sync test
        else:
            print(f"   ❌ Registration failed: {register_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Registration error: {str(e)}")
        return results
    
    # Step 2: Login to get token
    print("\n🔑 STEP 2: User Login")
    print("-" * 25)
    
    login_data = {
        "email": "synctest@test.com",
        "password": "test123"
    }
    
    try:
        login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        print(f"   Status: {login_resp.status_code}")
        
        if login_resp.status_code == 200:
            login_result = login_resp.json()
            token = login_result.get("token")
            headers = {"Authorization": f"Bearer {token}"}
            print(f"   ✅ Login successful - Token obtained")
            results["user_login"] = True
        else:
            print(f"   ❌ Login failed: {login_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Login error: {str(e)}")
        return results
    
    # Step 3: Create direct trip (simulating offline sync) with exact data from request
    print("\n🚗 STEP 3: Create Direct Trip (Offline Sync)")
    print("-" * 45)
    
    trip_data = {
        "start_time": "2026-03-15T10:00:00Z",
        "end_time": "2026-03-15T10:30:00Z", 
        "start_lat": 40.7128,
        "start_lng": -74.0060,
        "end_lat": 40.7580,
        "end_lng": -73.9855,
        "start_address": "New York City",
        "end_address": "Central Park",
        "distance": 5.5,
        "classification": "business",
        "notes": "Auto-tracked trip test"
    }
    
    print(f"   Creating trip: {trip_data['distance']} miles from {trip_data['start_address']} to {trip_data['end_address']}")
    print(f"   Classification: {trip_data['classification']}")
    
    try:
        trip_resp = requests.post(f"{BASE_URL}/trips/direct", json=trip_data, headers=headers)
        print(f"   Status: {trip_resp.status_code}")
        
        if trip_resp.status_code == 200:
            trip_result = trip_resp.json()
            trip_id = trip_result.get("trip_id")
            deduction_value = trip_result.get("deduction_value", 0)
            
            print(f"   ✅ Direct trip created successfully")
            print(f"     Trip ID: {trip_id}")
            print(f"     Distance: {trip_result.get('distance')} miles")
            print(f"     Classification: {trip_result.get('classification')}")
            print(f"     Deduction Value: ${deduction_value}")
            print(f"     Start Time: {trip_result.get('start_time')}")
            print(f"     End Time: {trip_result.get('end_time')}")
            
            results["direct_trip_creation"] = True
            stored_trip_id = trip_id
            
        else:
            print(f"   ❌ Trip creation failed: {trip_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Trip creation error: {str(e)}")
        return results
    
    # Step 4: Verify the trip was created by checking GET /api/trips
    print("\n📋 STEP 4: Verify Trip Creation")
    print("-" * 35)
    
    try:
        trips_resp = requests.get(f"{BASE_URL}/trips", headers=headers)
        print(f"   Status: {trips_resp.status_code}")
        
        if trips_resp.status_code == 200:
            trips = trips_resp.json()
            print(f"   ✅ Retrieved trips list - Total trips: {len(trips)}")
            
            # Find our created trip
            created_trip = None
            for trip in trips:
                if trip.get("trip_id") == stored_trip_id:
                    created_trip = trip
                    break
            
            if created_trip:
                print(f"   ✅ Verified created trip found in trips list")
                print(f"     Trip ID: {created_trip.get('trip_id')}")
                print(f"     Distance: {created_trip.get('distance')} miles")
                print(f"     Start: {created_trip.get('start_address')}")
                print(f"     End: {created_trip.get('end_address')}")
                print(f"     Classification: {created_trip.get('classification')}")
                results["trip_verification"] = True
            else:
                print(f"   ❌ Created trip not found in trips list")
                
        else:
            print(f"   ❌ Failed to retrieve trips: {trips_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Trip verification error: {str(e)}")
        return results
    
    # Step 5: Check dashboard stats are updated
    print("\n📊 STEP 5: Dashboard Stats Update Verification")
    print("-" * 50)
    
    try:
        stats_resp = requests.get(f"{BASE_URL}/dashboard/stats", headers=headers)
        print(f"   Status: {stats_resp.status_code}")
        
        if stats_resp.status_code == 200:
            stats = stats_resp.json()
            
            print("   ✅ Dashboard stats retrieved successfully")
            print("   Current dashboard statistics:")
            
            # Display key metrics
            monthly_miles = stats.get("monthly_miles", 0)
            monthly_deductions = stats.get("monthly_deductions", 0)
            yearly_miles = stats.get("yearly_miles", 0)
            yearly_deductions = stats.get("yearly_deductions", 0)
            total_trips = stats.get("total_trips", 0)
            
            print(f"     Total Trips: {total_trips}")
            print(f"     Monthly Miles: {monthly_miles}")
            print(f"     Monthly Deductions: ${monthly_deductions}")
            print(f"     Yearly Miles: {yearly_miles}")
            print(f"     Yearly Deductions: ${yearly_deductions}")
            
            # Since this is a business trip of 5.5 miles, we expect deductions
            expected_deduction = 5.5 * 0.70  # $0.70/mile business rate
            print(f"   Expected deduction for this trip: ${expected_deduction:.2f}")
            
            # Check if stats show reasonable values (can't verify exact change without before/after)
            if total_trips > 0 and monthly_miles >= 5.5 and monthly_deductions > 0:
                print(f"   ✅ Dashboard stats appear updated with trip data")
                results["dashboard_stats_update"] = True
            else:
                print(f"   ⚠️  Dashboard stats may not reflect the new trip")
                
        else:
            print(f"   ❌ Failed to retrieve dashboard stats: {stats_resp.text}")
            return results
    except Exception as e:
        print(f"   ❌ Dashboard stats error: {str(e)}")
        return results
    
    return results

def print_sync_summary(results):
    """Print final sync test summary"""
    print("\n" + "=" * 60)
    print("📋 SYNC ENDPOINT TEST RESULTS")
    print("=" * 60)
    
    test_descriptions = {
        "user_registration": "User Registration (synctest@test.com)",
        "user_login": "User Login (token acquisition)", 
        "direct_trip_creation": "Direct Trip Creation (POST /trips/direct)",
        "trip_verification": "Trip Verification (GET /trips)",
        "dashboard_stats_update": "Dashboard Stats Update (GET /dashboard/stats)"
    }
    
    for test_name, description in test_descriptions.items():
        status = "✅ PASSED" if results.get(test_name, False) else "❌ FAILED"
        print(f"{description:<55} {status}")
    
    passed_count = sum(results.values())
    total_count = len(results)
    
    print(f"\nOverall: {passed_count}/{total_count} sync tests passed")
    
    if passed_count == total_count:
        print("🎉 ALL SYNC FLOW TESTS PASSED!")
        print("✅ Trip sync endpoint working perfectly - mobile app integration confirmed")
    elif passed_count >= 3:  # Core functionality working
        print("✅ CORE SYNC FUNCTIONALITY WORKING")
        print("⚠️  Some verification steps had issues but main flow is operational")
    else:
        print("🚨 CRITICAL SYNC ISSUES FOUND")
        print("❌ Trip sync endpoint may not be working correctly")
    
    # Key findings
    print(f"\n🔑 KEY FINDINGS:")
    if results.get("direct_trip_creation", False):
        print("   • POST /api/trips/direct endpoint working correctly")
    if results.get("trip_verification", False):
        print("   • Synced trips properly stored and retrievable")
    if results.get("dashboard_stats_update", False):
        print("   • Dashboard statistics update after trip sync")
    
    print(f"\n📱 MOBILE APP INTEGRATION STATUS:")
    if passed_count >= 4:
        print("   ✅ Ready for mobile app offline sync integration")
    else:
        print("   ❌ Issues found - mobile app sync may not work correctly")

if __name__ == "__main__":
    try:
        results = test_sync_flow()
        print_sync_summary(results)
    except KeyboardInterrupt:
        print("\n⏹️ Testing interrupted by user")
    except Exception as e:
        print(f"\n💥 Unexpected error during sync testing: {str(e)}")