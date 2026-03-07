#!/usr/bin/env python3

import asyncio
import httpx
import json
import uuid
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# Configuration
BASE_URL = "https://gps-mileage-mvp.preview.emergentagent.com/api"
TEST_EMAIL = f"test_{uuid.uuid4().hex[:8]}@example.com"
TEST_PASSWORD = "TestPassword123!"
TEST_NAME = "Test User"

class ComprehensiveTester:
    def __init__(self):
        self.token = None
        self.user_id = None
        self.trip_id = None
        self.expense_id = None
        self.client = httpx.AsyncClient(timeout=30.0)
        self.results = []
        
    async def log_result(self, endpoint, method, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "endpoint": endpoint,
            "method": method, 
            "status": status,
            "details": details
        }
        self.results.append(result)
        logger.info(f"{status} {method} {endpoint} - {details}")

    async def test_with_auth(self, method, endpoint, data=None, json_data=None):
        """Helper method to make authenticated requests"""
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        
        if method.upper() == "GET":
            response = await self.client.get(f"{BASE_URL}{endpoint}", headers=headers, params=data)
        elif method.upper() == "POST":
            response = await self.client.post(f"{BASE_URL}{endpoint}", headers=headers, json=json_data, data=data)
        elif method.upper() == "PUT":
            response = await self.client.put(f"{BASE_URL}{endpoint}", headers=headers, json=json_data, data=data)
        elif method.upper() == "DELETE":
            response = await self.client.delete(f"{BASE_URL}{endpoint}", headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response

    async def run_comprehensive_tests(self):
        logger.info("🚀 COMPREHENSIVE BACKEND API TESTING - Mileage Tracker AI")
        logger.info(f"📍 Base URL: {BASE_URL}")
        logger.info(f"👤 Test User: {TEST_EMAIL}")
        logger.info("=" * 80)

        # 1. Authentication Flow
        logger.info("\n🔐 1. AUTHENTICATION FLOW TESTS")
        await self.test_auth_endpoints()

        # 2. Trip Management (Full CRUD)
        logger.info("\n🚗 2. TRIP MANAGEMENT TESTS (Full CRUD)")
        await self.test_trip_endpoints()

        # 3. AI Features
        logger.info("\n🤖 3. AI FEATURES TESTS") 
        await self.test_ai_endpoints()

        # 4. Expenses (Full CRUD)
        logger.info("\n💰 4. EXPENSES TESTS (Full CRUD)")
        await self.test_expense_endpoints()

        # 5. Reports
        logger.info("\n📊 5. REPORTS TESTS")
        await self.test_report_endpoints()

        # 6. Dashboard
        logger.info("\n📈 6. DASHBOARD TESTS")
        await self.test_dashboard_endpoints()

        # 7. Payments
        logger.info("\n💳 7. PAYMENTS TESTS")
        await self.test_payment_endpoints()

        # 8. Utility
        logger.info("\n🔧 8. UTILITY TESTS")
        await self.test_utility_endpoints()

        # Cleanup
        await self.cleanup_test_data()

        # Generate final summary
        self.generate_final_summary()

    async def test_auth_endpoints(self):
        """Test all authentication endpoints"""
        
        # POST /api/auth/register
        try:
            response = await self.client.post(f"{BASE_URL}/auth/register", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "name": TEST_NAME
            })
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("token")
                self.user_id = data.get("user", {}).get("user_id")
                await self.log_result("/auth/register", "POST", True, f"User registered, Token: {bool(self.token)}")
            else:
                await self.log_result("/auth/register", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/auth/register", "POST", False, f"Exception: {str(e)}")

        # POST /api/auth/login
        try:
            response = await self.client.post(f"{BASE_URL}/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            success = response.status_code == 200
            await self.log_result("/auth/login", "POST", success, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/auth/login", "POST", False, f"Exception: {str(e)}")

        # GET /api/auth/me
        try:
            response = await self.test_with_auth("GET", "/auth/me")
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                data = response.json()
                details += f", Email: {data.get('email')}"
            await self.log_result("/auth/me", "GET", success, details)
        except Exception as e:
            await self.log_result("/auth/me", "GET", False, f"Exception: {str(e)}")

        # PUT /api/auth/profile
        try:
            response = await self.test_with_auth("PUT", "/auth/profile", json_data={
                "name": "Updated Test User",
                "tax_country": "CA"
            })
            success = response.status_code == 200
            await self.log_result("/auth/profile", "PUT", success, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/auth/profile", "PUT", False, f"Exception: {str(e)}")

    async def test_trip_endpoints(self):
        """Test all trip management endpoints"""
        
        # POST /api/trips (start trip)
        try:
            response = await self.test_with_auth("POST", "/trips", json_data={
                "start_lat": 37.7749,
                "start_lng": -122.4194,
                "start_address": "San Francisco Office",
                "notes": "Business meeting trip"
            })
            
            if response.status_code == 200:
                data = response.json()
                self.trip_id = data.get("trip_id")
                await self.log_result("/trips", "POST", True, f"Trip created: {self.trip_id}")
            else:
                await self.log_result("/trips", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/trips", "POST", False, f"Exception: {str(e)}")

        # GET /api/trips (list all trips)
        try:
            response = await self.test_with_auth("GET", "/trips")
            if response.status_code == 200:
                data = response.json()
                await self.log_result("/trips", "GET", True, f"Retrieved {len(data)} trips")
            else:
                await self.log_result("/trips", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/trips", "GET", False, f"Exception: {str(e)}")

        # GET /api/trips/{trip_id} (get single trip)
        if self.trip_id:
            try:
                response = await self.test_with_auth("GET", f"/trips/{self.trip_id}")
                success = response.status_code == 200
                await self.log_result("/trips/{trip_id}", "GET", success, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/trips/{trip_id}", "GET", False, f"Exception: {str(e)}")

        # PUT /api/trips/{trip_id} (update trip)
        if self.trip_id:
            try:
                response = await self.test_with_auth("PUT", f"/trips/{self.trip_id}", json_data={
                    "classification": "business",
                    "purpose": "Client meeting",
                    "notes": "Updated meeting notes"
                })
                success = response.status_code == 200
                await self.log_result("/trips/{trip_id}", "PUT", success, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/trips/{trip_id}", "PUT", False, f"Exception: {str(e)}")

        # POST /api/trips/{trip_id}/end (end trip)
        if self.trip_id:
            try:
                response = await self.test_with_auth("POST", f"/trips/{self.trip_id}/end", json_data={
                    "end_lat": 37.7849,
                    "end_lng": -122.4094,
                    "end_address": "Client Office Downtown",
                    "distance": 12.5,
                    "classification": "business"
                })
                
                if response.status_code == 200:
                    data = response.json()
                    deduction = data.get('deduction_value', 0)
                    await self.log_result("/trips/{trip_id}/end", "POST", True, f"Trip ended, Deduction: ${deduction}")
                else:
                    await self.log_result("/trips/{trip_id}/end", "POST", False, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/trips/{trip_id}/end", "POST", False, f"Exception: {str(e)}")

    async def test_ai_endpoints(self):
        """Test all AI feature endpoints"""
        
        # POST /api/ai/classify-trip
        if self.trip_id:
            try:
                response = await self.test_with_auth("POST", "/ai/classify-trip", json_data={
                    "trip_id": self.trip_id
                })
                
                if response.status_code == 200:
                    data = response.json()
                    classification = data.get('classification', 'unknown')
                    confidence = data.get('confidence', 0)
                    await self.log_result("/ai/classify-trip", "POST", True, f"Classified as: {classification} (confidence: {confidence})")
                else:
                    await self.log_result("/ai/classify-trip", "POST", False, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/ai/classify-trip", "POST", False, f"Exception: {str(e)}")

        # POST /api/ai/classify-all
        try:
            response = await self.test_with_auth("POST", "/ai/classify-all")
            if response.status_code == 200:
                data = response.json()
                classified = data.get('classified', 0)
                deductions = data.get('total_deductions', 0)
                await self.log_result("/ai/classify-all", "POST", True, f"Classified {classified} trips, ${deductions} deductions")
            else:
                await self.log_result("/ai/classify-all", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/ai/classify-all", "POST", False, f"Exception: {str(e)}")

        # GET /api/ai/insights
        try:
            response = await self.test_with_auth("GET", "/ai/insights")
            if response.status_code == 200:
                data = response.json()
                insights = len(data.get('insights', []))
                await self.log_result("/ai/insights", "GET", True, f"Retrieved {insights} AI insights")
            else:
                await self.log_result("/ai/insights", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/ai/insights", "GET", False, f"Exception: {str(e)}")

        # POST /api/ai/chat
        try:
            response = await self.test_with_auth("POST", "/ai/chat", json_data={
                "message": "What are my total deductions this month?"
            })
            
            if response.status_code == 200:
                data = response.json()
                session_id = data.get('session_id', 'none')
                await self.log_result("/ai/chat", "POST", True, f"AI chat response received, Session: {session_id[:20]}...")
            else:
                await self.log_result("/ai/chat", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/ai/chat", "POST", False, f"Exception: {str(e)}")

    async def test_expense_endpoints(self):
        """Test all expense endpoints"""
        
        # GET /api/expenses
        try:
            response = await self.test_with_auth("GET", "/expenses")
            if response.status_code == 200:
                data = response.json()
                await self.log_result("/expenses", "GET", True, f"Retrieved {len(data)} expenses")
            else:
                await self.log_result("/expenses", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/expenses", "GET", False, f"Exception: {str(e)}")

        # POST /api/expenses
        try:
            response = await self.test_with_auth("POST", "/expenses", json_data={
                "amount": 45.99,
                "merchant": "Shell Gas Station",
                "category": "fuel", 
                "notes": "Business travel fuel",
                "trip_id": self.trip_id
            })
            
            if response.status_code == 200:
                data = response.json()
                self.expense_id = data.get("expense_id")
                amount = data.get('amount', 0)
                await self.log_result("/expenses", "POST", True, f"Expense created: ${amount}, ID: {self.expense_id}")
            else:
                await self.log_result("/expenses", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/expenses", "POST", False, f"Exception: {str(e)}")

        # PUT /api/expenses/{expense_id}
        if self.expense_id:
            try:
                response = await self.test_with_auth("PUT", f"/expenses/{self.expense_id}", json_data={
                    "amount": 52.99,
                    "merchant": "Updated Shell Station",
                    "notes": "Updated business fuel expense"
                })
                success = response.status_code == 200
                await self.log_result("/expenses/{expense_id}", "PUT", success, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/expenses/{expense_id}", "PUT", False, f"Exception: {str(e)}")

        # POST /api/expenses/scan (OCR receipt scan)
        try:
            # Create a small base64 test image (1x1 pixel PNG)
            test_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            response = await self.test_with_auth("POST", "/expenses/scan", json_data={
                "receipt_base64": test_image_b64
            })
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                data = response.json()
                extracted = data.get('extracted', {})
                details += f", Extracted: {extracted.get('merchant', 'N/A')}"
            await self.log_result("/expenses/scan", "POST", success, details)
        except Exception as e:
            await self.log_result("/expenses/scan", "POST", False, f"Exception: {str(e)}")

    async def test_report_endpoints(self):
        """Test all report endpoints"""
        
        # GET /api/reports/summary
        try:
            response = await self.test_with_auth("GET", "/reports/summary")
            if response.status_code == 200:
                data = response.json()
                total_miles = data.get('total_miles', 0)
                total_deductions = data.get('total_deductions', 0)
                await self.log_result("/reports/summary", "GET", True, f"Summary: {total_miles} miles, ${total_deductions} deductions")
            else:
                await self.log_result("/reports/summary", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/reports/summary", "GET", False, f"Exception: {str(e)}")

        # GET /api/reports/export/csv
        try:
            response = await self.test_with_auth("GET", "/reports/export/csv")
            if response.status_code == 200:
                content_length = len(response.content)
                await self.log_result("/reports/export/csv", "GET", True, f"CSV export: {content_length} bytes")
            else:
                await self.log_result("/reports/export/csv", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/reports/export/csv", "GET", False, f"Exception: {str(e)}")

        # GET /api/reports/export/pdf
        try:
            response = await self.test_with_auth("GET", "/reports/export/pdf")
            if response.status_code == 200:
                content_length = len(response.content)
                await self.log_result("/reports/export/pdf", "GET", True, f"PDF export: {content_length} bytes")
            else:
                await self.log_result("/reports/export/pdf", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/reports/export/pdf", "GET", False, f"Exception: {str(e)}")

    async def test_dashboard_endpoints(self):
        """Test dashboard endpoints"""
        
        # GET /api/dashboard/stats
        try:
            response = await self.test_with_auth("GET", "/dashboard/stats")
            if response.status_code == 200:
                data = response.json()
                monthly_miles = data.get('monthly_miles', 0)
                monthly_trips = data.get('monthly_trips', 0)
                await self.log_result("/dashboard/stats", "GET", True, f"Stats: {monthly_miles} miles, {monthly_trips} trips")
            else:
                await self.log_result("/dashboard/stats", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/dashboard/stats", "GET", False, f"Exception: {str(e)}")

    async def test_payment_endpoints(self):
        """Test payment endpoints"""
        
        # GET /api/payments/subscription
        try:
            response = await self.test_with_auth("GET", "/payments/subscription")
            if response.status_code == 200:
                data = response.json()
                tier = data.get('tier', 'unknown')
                await self.log_result("/payments/subscription", "GET", True, f"Subscription tier: {tier}")
            else:
                await self.log_result("/payments/subscription", "GET", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/payments/subscription", "GET", False, f"Exception: {str(e)}")

        # POST /api/payments/create-checkout
        try:
            response = await self.test_with_auth("POST", "/payments/create-checkout", json_data={
                "plan": "pro",
                "origin_url": "https://gps-mileage-mvp.preview.emergentagent.com"
            })
            
            if response.status_code == 200:
                data = response.json()
                session_id = data.get('session_id', '')
                checkout_url = data.get('url', '')
                await self.log_result("/payments/create-checkout", "POST", True, f"Checkout created, URL: {bool(checkout_url)}")
            else:
                await self.log_result("/payments/create-checkout", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/payments/create-checkout", "POST", False, f"Exception: {str(e)}")

        # GET /api/payments/status/{session_id} - Skip due to no actual payment

    async def test_utility_endpoints(self):
        """Test utility endpoints"""
        
        # POST /api/seed/trips
        try:
            response = await self.test_with_auth("POST", "/seed/trips")
            if response.status_code == 200:
                data = response.json()
                seeded_count = data.get('seeded', 0)
                await self.log_result("/seed/trips", "POST", True, f"Seeded {seeded_count} sample trips")
            else:
                await self.log_result("/seed/trips", "POST", False, f"Status: {response.status_code}")
        except Exception as e:
            await self.log_result("/seed/trips", "POST", False, f"Exception: {str(e)}")

    async def cleanup_test_data(self):
        """Clean up test data"""
        logger.info("\n🧹 CLEANUP TEST DATA")
        
        # DELETE /api/expenses/{expense_id}
        if self.expense_id:
            try:
                response = await self.test_with_auth("DELETE", f"/expenses/{self.expense_id}")
                success = response.status_code == 200
                await self.log_result("/expenses/{expense_id}", "DELETE", success, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/expenses/{expense_id}", "DELETE", False, f"Exception: {str(e)}")

        # DELETE /api/trips/{trip_id}
        if self.trip_id:
            try:
                response = await self.test_with_auth("DELETE", f"/trips/{self.trip_id}")
                success = response.status_code == 200
                await self.log_result("/trips/{trip_id}", "DELETE", success, f"Status: {response.status_code}")
            except Exception as e:
                await self.log_result("/trips/{trip_id}", "DELETE", False, f"Exception: {str(e)}")

        await self.client.aclose()

    def generate_final_summary(self):
        """Generate comprehensive test summary"""
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if "✅ PASS" in r["status"]])
        failed_tests = total_tests - passed_tests
        
        print("\n" + "=" * 80)
        print("🎯 COMPREHENSIVE BACKEND API TEST RESULTS - MILEAGE TRACKER AI")
        print("=" * 80)
        print(f"📊 Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"📈 Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        print("=" * 80)

        # Group results by category
        categories = {
            "Authentication": ["/auth/register", "/auth/login", "/auth/me", "/auth/profile"],
            "Trip Management": ["/trips", "/trips/{trip_id}", "/trips/{trip_id}/end"],
            "AI Features": ["/ai/classify-trip", "/ai/classify-all", "/ai/insights", "/ai/chat"],
            "Expenses": ["/expenses", "/expenses/{expense_id}", "/expenses/scan"],
            "Reports": ["/reports/summary", "/reports/export/csv", "/reports/export/pdf"],
            "Dashboard": ["/dashboard/stats"],
            "Payments": ["/payments/subscription", "/payments/create-checkout"],
            "Utility": ["/seed/trips"]
        }

        for category, endpoints in categories.items():
            category_results = [r for r in self.results if any(ep in r["endpoint"] for ep in endpoints)]
            if category_results:
                category_passed = len([r for r in category_results if "✅ PASS" in r["status"]])
                category_total = len(category_results)
                print(f"\n📁 {category}: {category_passed}/{category_total} passed")
                
                for result in category_results:
                    status_icon = "✅" if "✅ PASS" in result["status"] else "❌"
                    print(f"   {status_icon} {result['method']} {result['endpoint']} - {result['details']}")

        print("\n" + "=" * 80)
        if failed_tests == 0:
            print("🎉 ALL TESTS PASSED! Backend API is fully functional and ready for production.")
        else:
            print(f"⚠️  {failed_tests} tests failed. Critical issues require attention.")
        print("=" * 80)

async def main():
    tester = ComprehensiveTester()
    await tester.run_comprehensive_tests()

if __name__ == "__main__":
    asyncio.run(main())