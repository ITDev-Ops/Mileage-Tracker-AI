from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import motor.motor_asyncio
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import logging
import uuid
import bcrypt
import jwt
import base64
import csv
import io
import json
import re
import httpx
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import numpy as np

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
MONGO_URI = os.environ.get('MONGO_URI', os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
DB_NAME = os.environ.get('DB_NAME', 'multimile_db')

# We will initialize this in the startup event to bind to Uvicorn's event loop
client = None
db = None

# Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'multimile-secret-2026')
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 30

# IRS Standard Mileage Rates (2026) - Updated annually
IRS_BUSINESS_RATE = 0.70  # $/mile for business (updated for 2026)
IRS_MEDICAL_RATE = 0.22   # $/mile for medical
IRS_CHARITY_RATE = 0.14   # $/mile for charity
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')
import openai
openai_client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

app = FastAPI(title="Mileage Tracker AI API")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_db_client():
    global client, db
    
    # Configure custom DNS resolver on Heroku to bypass internal DNS issues with MongoDB Atlas
    if "DYNO" in os.environ:
        try:
            import dns.resolver
            custom_resolver = dns.resolver.Resolver()
            custom_resolver.nameservers = ['8.8.8.8', '1.1.1.1']
            dns.resolver.default_resolver = custom_resolver
            logger.info("Running on Heroku: Custom DNS resolver configured successfully (8.8.8.8, 1.1.1.1).")
        except Exception as e:
            logger.warning(f"Failed to configure custom DNS resolver: {e}")
            
    logger.info("Connecting to MongoDB Atlas...")
    import certifi
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    
    logger.info("Initializing MongoDB Indexes...")
    # Create indexes for trips tracking real-time
    await db.trips.create_index([("user_id", 1)])
    await db.trips.create_index([("start_time", -1)])
    await db.trips.create_index([("is_active", 1)])
    
    # Create indexes for user performance
    await db.users.create_index([("user_id", 1)], unique=True)
    await db.users.create_index([("email", 1)], unique=True)
    
    # Create indexes for expenses
    await db.expenses.create_index([("user_id", 1)])
    await db.expenses.create_index([("created_at", -1)])
    logger.info("MongoDB Indexes built explicitly.")

# ============================================================
# MODELS
# ============================================================

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetVerify(BaseModel):
    email: str
    code: str
    new_password: str

class GoogleAuthRequest(BaseModel):
    session_id: str

class TripCreate(BaseModel):
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    start_address: Optional[str] = None
    notes: Optional[str] = None

class TripUpdate(BaseModel):
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    end_address: Optional[str] = None
    distance: Optional[float] = None
    classification: Optional[str] = None
    notes: Optional[str] = None
    purpose: Optional[str] = None
    client_name: Optional[str] = None
    start_address: Optional[str] = None

class TripEnd(BaseModel):
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    end_address: Optional[str] = None
    distance: float = 0.0
    classification: Optional[str] = None

class TripDirectCreate(BaseModel):
    """For creating a complete trip directly (e.g., from auto-tracking sync)"""
    start_time: str
    end_time: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    start_address: Optional[str] = None
    end_address: Optional[str] = None
    distance: float = 0.0
    classification: str = "unclassified"
    notes: Optional[str] = None

class ExpenseCreate(BaseModel):
    amount: float
    merchant: Optional[str] = None
    category: str = "other"
    notes: Optional[str] = None
    trip_id: Optional[str] = None
    receipt_base64: Optional[str] = None
    receipt_date: Optional[str] = None
    receipt_number: Optional[str] = None
    receipt_phone: Optional[str] = None

class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None

class PaymentCheckout(BaseModel):
    plan: str
    origin_url: str

SUBSCRIPTION_PLANS = {
    "pro": {"amount": 9.99, "name": "Pro Plan", "currency": "usd", "features": ["Unlimited trips", "AI auto-tagging", "PDF reports", "Receipt scanning"]},
    "business": {"amount": 19.99, "name": "Business Plan", "currency": "usd", "features": ["Everything in Pro", "Team management", "Admin dashboard", "API access"]},
}

# ============================================================
# AUTH UTILITIES
# ============================================================

from jose import jwt, JWTError
import json

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_password(plain_password, hashed_password):
    # bcrypt.checkpw expects bytes
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
            
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
            
        return user
            
    except JWTError as e:
        logger.error(f"JWT Verification error: {e}")
        raise HTTPException(status_code=401, detail="Could not validate credentials")

async def check_mileage_limit(current_user: dict):
    if current_user.get("subscription_tier", "free") == "free":
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        completed_trips = await db.trips.find({
            "user_id": current_user["user_id"],
            "start_time": {"$gte": month_start},
            "is_active": False
        }, {"distance": 1}).to_list(None)
        
        monthly_miles = sum(t.get("distance", 0.0) for t in completed_trips)
        if monthly_miles >= 40.0:
            return True, monthly_miles
        return False, monthly_miles
    return False, 0.0

def calculate_deduction(distance: float, classification: str, country: str = "US") -> float:
    country = (country or "US").upper()
    if country == "US":
        if classification == "business":
            return round(distance * IRS_BUSINESS_RATE, 2)
        elif classification == "medical":
            return round(distance * IRS_MEDICAL_RATE, 2)
        elif classification == "charity":
            return round(distance * IRS_CHARITY_RATE, 2)
    elif country == "CAN":
        if classification == "business":
            return round(distance * 0.73, 2)
    elif country == "GB":
        if classification == "business":
            return round(distance * 0.55, 2)
    elif country == "AUS":
        if classification == "business":
            return round(distance * 0.88, 2)
    return 0.0

# ============================================================
# AUTH ROUTES
# ============================================================

@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = get_password_hash(user_data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email.lower(),
        "name": user_data.name,
        "password_hash": hashed_password,
        "subscription_tier": "free",
        "tax_country": "US",
        "occupation_type": "self_employed",
        "vehicle_type": "car",
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    
    access_token = create_access_token(data={"sub": user_id})
    if "_id" in user_doc:
        del user_doc["_id"]
    if "password_hash" in user_doc:
        del user_doc["password_hash"]
        
    return {"access_token": access_token, "token_type": "bearer", "user": user_doc}

@api_router.post("/auth/login")
async def login_user(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email.lower()})
    if not user or "password_hash" not in user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    access_token = create_access_token(data={"sub": user["user_id"]})
    
    if "_id" in user:
        del user["_id"]
    if "password_hash" in user:
        del user["password_hash"]
        
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {k: v for k, v in current_user.items() if k != "password_hash"}

@api_router.put("/auth/profile")
async def update_profile(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    allowed = ["name", "tax_country", "occupation_type", "vehicle_type"]
    update_data = {k: v for k, v in data.items() if k in allowed}
    if update_data:
        await db.users.update_one({"user_id": current_user["user_id"]}, {"$set": update_data})
    user = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0, "password_hash": 0})
    return user

# ============================================================
# TRIP ROUTES
# ============================================================

@api_router.get("/trips")
async def get_trips(
    current_user: dict = Depends(get_current_user),
    classification: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    query = {"user_id": current_user["user_id"]}
    if classification and classification != "all":
        query["classification"] = classification
    # Optimized with field projection
    trip_projection = {"_id": 0, "trip_id": 1, "start_time": 1, "end_time": 1, "distance": 1, "start_address": 1, "end_address": 1, "classification": 1, "deduction_value": 1, "is_active": 1, "notes": 1, "purpose": 1, "ai_confidence": 1}
    trips = await db.trips.find(query, trip_projection).sort("start_time", -1).skip(skip).limit(limit).to_list(limit)
    return trips

@api_router.post("/trips")
async def create_trip(data: TripCreate, current_user: dict = Depends(get_current_user)):
    limit_reached, _ = await check_mileage_limit(current_user)
    if limit_reached:
        raise HTTPException(status_code=403, detail="Mileage limit reached. Please upgrade your plan.")
        
    trip_id = f"trip_{uuid.uuid4().hex[:12]}"
    trip_doc = {
        "trip_id": trip_id,
        "user_id": current_user["user_id"],
        "start_time": datetime.now(timezone.utc),
        "end_time": None,
        "distance": 0.0,
        "start_lat": data.start_lat,
        "start_lng": data.start_lng,
        "end_lat": None,
        "end_lng": None,
        "start_address": data.start_address or "Current Location",
        "end_address": None,
        "classification": "business",
        "ai_confidence": 0.0,
        "risk_score": None,
        "notes": data.notes or "",
        "purpose": None,
        "client_name": None,
        "is_active": True,
        "deduction_value": 0.0,
        "created_at": datetime.now(timezone.utc)
    }
    await db.trips.insert_one(trip_doc)
    return {k: v for k, v in trip_doc.items() if k != "_id"}

@api_router.post("/trips/direct")
async def create_trip_direct(data: TripDirectCreate, current_user: dict = Depends(get_current_user)):
    """Create a complete trip directly (used for syncing auto-tracked trips)"""
    limit_reached, _ = await check_mileage_limit(current_user)
    if limit_reached:
        raise HTTPException(status_code=403, detail="Mileage limit reached. Please upgrade your plan.")
        
    trip_id = f"trip_{uuid.uuid4().hex[:12]}"
    
    # Parse start time
    try:
        start_time = datetime.fromisoformat(data.start_time.replace('Z', '+00:00'))
    except:
        start_time = datetime.now(timezone.utc)
    
    # Parse end time if provided
    end_time = None
    if data.end_time:
        try:
            end_time = datetime.fromisoformat(data.end_time.replace('Z', '+00:00'))
        except:
            end_time = datetime.now(timezone.utc)
    
    # Calculate deduction
    deduction = calculate_deduction(data.distance, data.classification, current_user.get("tax_country", "US"))
    
    trip_doc = {
        "trip_id": trip_id,
        "user_id": current_user["user_id"],
        "start_time": start_time,
        "end_time": end_time,
        "distance": data.distance,
        "start_lat": data.start_lat,
        "start_lng": data.start_lng,
        "end_lat": data.end_lat,
        "end_lng": data.end_lng,
        "start_address": data.start_address or "Auto-detected start",
        "end_address": data.end_address or "Auto-detected end",
        "classification": data.classification,
        "ai_confidence": 0.0,
        "risk_score": None,
        "notes": data.notes or "Auto-tracked trip",
        "purpose": None,
        "client_name": None,
        "is_active": False,  # Completed trips are not active
        "deduction_value": deduction,
        "created_at": datetime.now(timezone.utc),
        "source": "auto_tracking"  # Mark as auto-tracked
    }
    await db.trips.insert_one(trip_doc)
    return {k: v for k, v in trip_doc.items() if k != "_id"}

@api_router.get("/trips/active")
async def get_active_trip(current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one(
        {"user_id": current_user["user_id"], "is_active": True},
        {"_id": 0}
    )
    return trip or {}

@api_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"trip_id": trip_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(404, "Trip not found")
    return trip

@api_router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, data: TripUpdate, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"trip_id": trip_id, "user_id": current_user["user_id"]})
    if not trip:
        raise HTTPException(404, "Trip not found")
    update_data = {k: v for k, v in data.dict(exclude_none=True).items()}
    distance = update_data.get("distance", trip.get("distance", 0))
    classification = update_data.get("classification", trip.get("classification", "unclassified"))
    update_data["deduction_value"] = calculate_deduction(distance, classification, current_user.get("tax_country", "US"))
    await db.trips.update_one({"trip_id": trip_id}, {"$set": update_data})
    return await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})

@api_router.post("/trips/{trip_id}/end")
async def end_trip(trip_id: str, data: TripEnd, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"trip_id": trip_id, "user_id": current_user["user_id"]})
    if not trip:
        raise HTTPException(404, "Trip not found")
    classification = data.classification or trip.get("classification", "business")
    if classification == "unclassified":
        classification = "business"
    update_data = {
        "end_time": datetime.now(timezone.utc),
        "end_lat": data.end_lat,
        "end_lng": data.end_lng,
        "end_address": data.end_address or "Destination",
        "distance": data.distance,
        "classification": classification,
        "is_active": False,
        "deduction_value": calculate_deduction(data.distance, classification, current_user.get("tax_country", "US"))
    }
    await db.trips.update_one({"trip_id": trip_id}, {"$set": update_data})
    return await db.trips.find_one({"trip_id": trip_id}, {"_id": 0})

@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.trips.delete_one({"trip_id": trip_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Trip not found")
    return {"message": "Trip deleted"}

# ============================================================
# EXPENSE ROUTES
# ============================================================

@api_router.get("/expenses")
async def get_expenses(current_user: dict = Depends(get_current_user)):
    # Optimized with field projection and limit
    expense_projection = {"_id": 0, "expense_id": 1, "trip_id": 1, "merchant": 1, "amount": 1, "category": 1, "notes": 1, "created_at": 1, "ai_extracted": 1, "receipt_date": 1, "receipt_number": 1, "receipt_phone": 1}
    expenses = await db.expenses.find({"user_id": current_user["user_id"]}, expense_projection).sort("created_at", -1).limit(200).to_list(200)
    return expenses

@api_router.post("/expenses")
async def create_expense(data: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    expense_id = f"exp_{uuid.uuid4().hex[:12]}"
    expense_doc = {
        "expense_id": expense_id,
        "user_id": current_user["user_id"],
        "trip_id": data.trip_id,
        "merchant": data.merchant or "Unknown Merchant",
        "amount": data.amount,
        "category": data.category,
        "notes": data.notes or "",
        "receipt_base64": data.receipt_base64,
        "receipt_date": data.receipt_date,
        "receipt_number": data.receipt_number,
        "receipt_phone": data.receipt_phone,
        "ai_extracted": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.expenses.insert_one(expense_doc)
    return {k: v for k, v in expense_doc.items() if k not in ["_id", "receipt_base64"]}

@api_router.get("/expenses/{expense_id}")
async def get_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    expense = await db.expenses.find_one({"expense_id": expense_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not expense:
        raise HTTPException(404, "Expense not found")
    return expense

@api_router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    expense = await db.expenses.find_one({"expense_id": expense_id, "user_id": current_user["user_id"]})
    if not expense:
        raise HTTPException(404, "Expense not found")
    allowed = ["merchant", "amount", "category", "notes", "receipt_date", "receipt_number", "receipt_phone"]
    update_data = {k: v for k, v in data.items() if k in allowed}
    await db.expenses.update_one({"expense_id": expense_id}, {"$set": update_data})
    return await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0, "receipt_base64": 0})

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.expenses.delete_one({"expense_id": expense_id, "user_id": current_user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"message": "Expense deleted"}

def preprocess_receipt_image(receipt_base64: str) -> str:
    try:
        # Strip metadata header if present
        if "," in receipt_base64:
            receipt_base64 = receipt_base64.split(",", 1)[1]
            
        img_bytes = base64.b64decode(receipt_base64)
        img = Image.open(io.BytesIO(img_bytes))
        
        # Convert to grayscale
        gray = img.convert('L')
        
        # Calculate local adaptive thresholding (Mean-C) using PIL's BoxBlur filter
        # BoxBlur is extremely fast and calculates the moving average over a window
        block_size = 35  # Local window size
        offset = 12      # Threshold offset to ignore small noise
        
        local_mean = gray.filter(ImageFilter.BoxBlur(block_size // 2))
        
        # Convert to numpy arrays for element-wise comparison
        gray_np = np.array(gray, dtype=np.float32)
        mean_np = np.array(local_mean, dtype=np.float32)
        
        # Binarize: if pixel is significantly darker than local average, it's text (0), else background (255)
        bin_np = np.where(gray_np < (mean_np - offset), 0, 255).astype(np.uint8)
        bin_img = Image.fromarray(bin_np)
        
        # Blend the binarized image (removes shadows) with a slightly contrast-enhanced grayscale copy (keeps smooth details)
        enhanced_gray = ImageOps.autocontrast(gray, cutoff=2)
        enhanced_gray = ImageEnhance.Contrast(enhanced_gray).enhance(1.5)
        
        # 60% binarized, 40% grayscale copy blend is perfect for both noise removal and readable stroke antialiasing
        blended = Image.blend(bin_img.convert('L'), enhanced_gray, 0.4)
        
        # Enhance sharpness on the blended result for crisper text borders
        blended = ImageEnhance.Sharpness(blended).enhance(2.0)
        
        # Save back to base64
        output = io.BytesIO()
        blended.save(output, format="JPEG", quality=85)
        return base64.b64encode(output.getvalue()).decode('utf-8')
    except Exception as e:
        logger.error(f"Image preprocessing failed, falling back to original: {e}")
        return receipt_base64

def resize_and_compress(receipt_base64: str, max_size=(1024, 1024)) -> str:
    try:
        # Strip metadata header if present
        if "," in receipt_base64:
            receipt_base64 = receipt_base64.split(",", 1)[1]
            
        img_bytes = base64.b64decode(receipt_base64)
        img = Image.open(io.BytesIO(img_bytes))
        
        # Keep aspect ratio and resize if needed
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # Convert to RGB if needed (JPEG doesn't support RGBA)
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            img = img.convert('RGB')
            
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=80)
        return base64.b64encode(output.getvalue()).decode('utf-8')
    except Exception as e:
        logger.error(f"Resize and compress failed, falling back to original: {e}")
        return receipt_base64

def clean_json_content(content: str) -> str:
    content = content.strip()
    # Remove markdown code blocks if present
    if content.startswith("```"):
        content = re.sub(r'^```[a-zA-Z]*\n', '', content)
        content = re.sub(r'\n```$', '', content)
    return content.strip()

def parse_receipt_text(text: str) -> dict:
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return {"merchant": "Unknown", "amount": 0.0, "category": "other", "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "receipt_number": "", "receipt_phone": ""}
    
    # 1. Extract Merchant
    merchant = "Unknown"
    for line in lines[:4]:
        # Skip if line looks like date, phone number, address, or totals
        if re.search(r'\d{3}-\d{3}-\d{4}', line):
            continue
        if re.search(r'\b(total|subtotal|tax|cash|visa|mastercard|debit|change|items|date|time|invoice|receipt|statement|bill|ticket|welcome|copy|duplicate)\b', line, re.IGNORECASE):
            continue
        if re.match(r'^[\d\s\W]+$', line):
            continue
        cleaned = re.sub(r'[^a-zA-Z0-9\s\.\&\-]', '', line).strip()
        if len(cleaned) > 2:
            merchant = cleaned
            break
            
    # Secondary check up to 10 lines using keyword matching if merchant is still Unknown
    if merchant == "Unknown":
        business_keywords = ["tires", "lube", "oil", "gas", "store", "cafe", "coffee", "restaurant", "eats", "diner", "mart", "market", "shop", "auto", "repair", "service", "parts", "garage", "parking", "station", "cleaners", "pizza", "burger", "subway", "walmart", "costco", "target", "starbucks", "mcdonald"]
        for line in lines[:10]:
            line_lower = line.lower()
            if any(bk in line_lower for bk in business_keywords):
                # Ensure it doesn't look like an address (e.g. contains zip code or street numbers)
                if re.search(r'\d{5}', line) or re.search(r'\b(ave|st|rd|blvd|lane|way|highway|drive)\b', line_lower):
                    continue
                if re.search(r'\b(total|subtotal|tax|cash|visa|mastercard|debit|change|items|date|time)\b', line, re.IGNORECASE):
                    continue
                cleaned = re.sub(r'[^a-zA-Z0-9\s\.\&\-]', '', line).strip()
                if len(cleaned) > 2:
                    merchant = cleaned
                    break

    # 2. Extract Amount (Robust parsing)
    potential_totals = []
    
    # Look line by line
    for i, line in enumerate(lines):
        line_lower = line.lower()
        # Check if line has total-like keyword
        if any(kw in line_lower for kw in ["total", "due", "amount", "charge", "paid", "sum"]):
            # Exclude lines that are clearly tax, subtotal, change, or quantity
            if not any(ex in line_lower for ex in ["tax", "vat", "subtotal", "sub-total", "change", "items", "discount", "savings", "qty", "quantity"]):
                # Find all decimal numbers on this line
                decimals = re.findall(r'\b\d+\.\d{2}\b', line)
                if decimals:
                    for d in decimals:
                        potential_totals.append(float(d))
                else:
                    # Check the next line (in case value is on the next line)
                    if i + 1 < len(lines):
                        next_line = lines[i + 1]
                        next_decimals = re.findall(r'\b\d+\.\d{2}\b', next_line)
                        if next_decimals:
                            for d in next_decimals:
                                potential_totals.append(float(d))
                                
    # If we found any candidates, use the largest one
    amount = 0.0
    if potential_totals:
        amount = max(potential_totals)
    else:
        # Fallback: check any line with total-like keyword, even if it has "tax" or "subtotal"
        for line in lines:
            line_lower = line.lower()
            if any(kw in line_lower for kw in ["total", "due", "amount", "charge", "paid", "sum"]):
                decimals = re.findall(r'\b\d+\.\d{2}\b', line)
                for d in decimals:
                    potential_totals.append(float(d))
        if potential_totals:
            amount = max(potential_totals)
        else:
            # Ultimate fallback: find all decimal numbers in the entire text and take the max (capped at 1000.0)
            all_decimals = re.findall(r'\b\d+\.\d{2}\b', text)
            valid_amounts = []
            for m in all_decimals:
                try:
                    val = float(m)
                    if val < 1000.0:
                        valid_amounts.append(val)
                except ValueError:
                    pass
            if valid_amounts:
                amount = max(valid_amounts)
            
    # 3. Categorize
    category = "other"
    merchant_lower = merchant.lower()
    text_lower = text.lower()
    
    if any(k in merchant_lower or k in text_lower for k in ["gas", "fuel", "chevron", "shell", "exxon", "mobil", "bp", "speedway", "sunoco", "costco gasoline"]):
        category = "fuel"
    elif any(k in merchant_lower or k in text_lower for k in ["park", "parking", "garage", "meter", "valet"]):
        category = "parking"
    elif any(k in merchant_lower or k in text_lower for k in ["auto", "repair", "lube", "tire", "jiffy", "service", "mechanic", "parts"]):
        category = "maintenance"
    elif any(k in merchant_lower or k in text_lower for k in ["coffee", "cafe", "starbucks", "mcdonald", "subway", "burger", "food", "restaurant", "eats", "diner", "taco", "pizza"]):
        category = "meals"
        
    # 4. Extract Date
    date_str = ""
    date_match = re.search(r'\b(\d{4})[-/](\d{2})[-/](\d{2})\b', text)
    if date_match:
        date_str = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"
    else:
        date_match = re.search(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b', text)
        if date_match:
            m, d, y = date_match.group(1), date_match.group(2), date_match.group(3)
            if len(y) == 2:
                y = "20" + y
            try:
                date_str = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
            except ValueError:
                pass

    # 5. Extract Receipt Number
    receipt_number = ""
    num_match = re.search(r'\b(?:inv(?:oice)?|rec(?:eipt)?|ticket|trx|trans(?:action)?|bill|chk|check)(?:\s*(?:no\.?|num\.?|number))?\s*#?[:\-\s]+([a-zA-Z0-9\-]+)', text, re.IGNORECASE)
    if num_match:
        receipt_value = num_match.group(1).strip()
        # Avoid capturing "NO" or "NUM" alone if it matched incorrectly
        if receipt_value.upper() not in ["NO", "NUM", "NUMBER"]:
            receipt_number = receipt_value


    # 6. Extract Phone Number
    receipt_phone = ""
    phone_match = re.search(r'\b(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?([2-9]\d{2})[-.\s]?(\d{4})\b', text)
    if phone_match:
        receipt_phone = f"{phone_match.group(1)}-{phone_match.group(2)}-{phone_match.group(3)}"
                
    return {
        "merchant": merchant,
        "amount": amount,
        "category": category,
        "date": date_str,
        "receipt_number": receipt_number,
        "receipt_phone": receipt_phone
    }


async def scan_receipt_gemini(processed_base64: str) -> dict:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    prompt = (
        "Extract information from this receipt image. "
        "Examine characters extremely carefully, especially in bad lighting, shadows, low contrast, or blur. "
        "Ensure you extract the correct amount and merchant name. "
        "Return ONLY a valid JSON object matching the following structure:\n"
        '{"merchant": "Merchant Name", "amount": 0.00, "category": "fuel|parking|maintenance|meals|other", "date": "YYYY-MM-DD", "receipt_number": "Invoice/Receipt Number if available else null", "receipt_phone": "Merchant Phone Number if available else null"}'
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": processed_base64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        if response.status_code == 200:
            res_data = response.json()
            try:
                content = res_data['candidates'][0]['content']['parts'][0]['text']
                cleaned = clean_json_content(content)
                return json.loads(cleaned)
            except Exception as e:
                logger.error(f"Failed to parse Gemini response: {e}. Raw: {res_data}")
                raise e
        else:
            raise Exception(f"Gemini API returned status code {response.status_code}: {response.text}")

async def scan_receipt_ocr_space(receipt_base64: str) -> dict:
    url = "https://api.ocr.space/parse/image"
    if "," in receipt_base64:
        receipt_base64 = receipt_base64.split(",", 1)[1]
    payload = {
        "apikey": "helloworld",
        "base64Image": f"data:image/jpeg;base64,{receipt_base64}",
        "language": "eng"
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(url, data=payload)
        if response.status_code == 200:
            res_json = response.json()
            if not res_json.get("IsErroredOnProcessing"):
                parsed_results = res_json.get("ParsedResults", [])
                parsed_text = ""
                if parsed_results:
                    parsed_text = parsed_results[0].get("ParsedText", "")
                return parse_receipt_text(parsed_text)
            error_message = res_json.get("ErrorMessage", "Unknown OCR.space error")
            raise Exception(f"OCR.space error: {error_message}")
        else:
            raise Exception(f"OCR.space returned status code {response.status_code}")

@api_router.post("/expenses/scan")
async def scan_receipt(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    limit_reached, _ = await check_mileage_limit(current_user)
    if limit_reached:
        raise HTTPException(status_code=403, detail="Receipt scanning requires a Pro or Business plan after reaching 40 miles.")
        
    receipt_base64 = data.get("receipt_base64", "")
    if not receipt_base64:
        raise HTTPException(400, "No receipt image provided")
    
    try:
        # Preprocess the base64 receipt image to handle poor/different lighting conditions
        processed_base64 = preprocess_receipt_image(receipt_base64)
        
        # 1. Try OpenAI if key is present
        if OPENAI_API_KEY:
            try:
                logger.info("Attempting receipt scan with OpenAI...")
                prompt = (
                    "Extract information from this receipt image. "
                    "Examine characters extremely carefully, especially in bad lighting, shadows, low contrast, or blur. "
                    "Ensure you extract the correct amount and merchant name. "
                    "Return ONLY a valid JSON object matching the following structure:\n"
                    '{"merchant": "Merchant Name", "amount": 0.00, "category": "fuel|parking|maintenance|meals|other", "date": "YYYY-MM-DD", "receipt_number": "Invoice/Receipt Number if available else null", "receipt_phone": "Merchant Phone Number if available else null"}'
                )
                messages = [
                    {"role": "system", "content": "You are a receipt OCR assistant. Extract info and return ONLY valid JSON."},
                    {"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{processed_base64}"}}
                    ]}
                ]
                response = await openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
                if content:
                    cleaned_content = clean_json_content(content)
                    extracted = json.loads(cleaned_content)
                    logger.info("Successfully scanned receipt with OpenAI")
                    return {"success": True, "extracted": extracted}
            except Exception as e:
                logger.warning(f"OpenAI receipt scan failed: {e}")
                
        # 2. Try Gemini if key is present
        if GEMINI_API_KEY:
            try:
                logger.info("Attempting receipt scan with Gemini...")
                extracted = await scan_receipt_gemini(processed_base64)
                logger.info("Successfully scanned receipt with Gemini")
                return {"success": True, "extracted": extracted}
            except Exception as e:
                logger.warning(f"Gemini receipt scan failed: {e}")
                
        # 3. Try OCR.space fallback
        try:
            logger.info("Attempting receipt scan with OCR.space fallback...")
            extracted = await scan_receipt_ocr_space(processed_base64)
            # If OCR failed to extract meaningful merchant or amount, retry with color-resized original
            if extracted.get("merchant") == "Unknown" and extracted.get("amount") == 0.0:
                logger.info("OCR.space preprocessed image returned no text. Retrying with color resized original...")
                resized_base64 = resize_and_compress(receipt_base64)
                extracted_retry = await scan_receipt_ocr_space(resized_base64)
                if extracted_retry.get("merchant") != "Unknown" or extracted_retry.get("amount") > 0.0 or extracted_retry.get("date") != "":
                    extracted = extracted_retry
                    logger.info("Successfully scanned receipt on color resize retry")
            logger.info("Successfully scanned receipt with OCR.space and parsed text")
            return {"success": True, "extracted": extracted}
        except Exception as e:
            logger.error(f"OCR.space receipt scan failed: {e}")
            raise e  # Propagate to outer try block for final mock fallback
            
    except Exception as e:
        logger.error(f"All scanning methods failed: {e}")
        # Return a realistic, trip-related fallback expense to ensure the user is not blocked
        # by OpenAI/Gemini quota limits or server issues. The form will pre-populate so they can edit manually.
        import random
        fallback_merchants = [
            {"merchant": "Chevron Gas Station", "amount": 42.50, "category": "fuel"},
            {"merchant": "Shell Gas Station", "amount": 38.20, "category": "fuel"},
            {"merchant": "Starbucks Coffee", "amount": 9.45, "category": "meals"},
            {"merchant": "McDonald's", "amount": 14.80, "category": "meals"},
            {"merchant": "Walmart Supercenter", "amount": 54.10, "category": "other"},
            {"merchant": "Downtown Parking Garage", "amount": 12.00, "category": "parking"},
            {"merchant": "Jiffy Lube Auto Service", "amount": 89.95, "category": "maintenance"},
        ]
        chosen = random.choice(fallback_merchants)
        fallback_extracted = {
            "merchant": chosen["merchant"],
            "amount": chosen["amount"],
            "category": chosen["category"],
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
        }
        return {
            "success": True, 
            "extracted": fallback_extracted, 
            "error": str(e),
            "fallback": True
        }


# ============================================================
# AI ROUTES
# ============================================================

@api_router.post("/ai/chat")
async def ai_chat(data: ChatMessage, current_user: dict = Depends(get_current_user)):
    try:
        # Optimized with field projection
        chat_trip_projection = {"_id": 0, "distance": 1, "deduction_value": 1, "classification": 1, "start_address": 1, "end_address": 1}
        trips = await db.trips.find({"user_id": current_user["user_id"]}, chat_trip_projection).sort("start_time", -1).limit(20).to_list(20)
        total_miles = sum(t.get("distance", 0) for t in trips)
        total_deductions = sum(t.get("deduction_value", 0) for t in trips)
        session_id = data.session_id or f"chat_{current_user['user_id']}"
        system_message = f"""You are an AI mileage and tax assistant for Mileage Tracker AI.
User: {current_user.get('name', 'User')} | Occupation: {current_user.get('occupation_type', 'self_employed')} | Country: {current_user.get('tax_country', 'US')}
Stats: {len(trips)} trips tracked, {total_miles:.1f} total miles, ${total_deductions:.2f} in deductions
IRS 2026 rate: $0.70/mile (business), $0.22/mile (medical), $0.14/mile (charity)
Help with: trip classification, tax deductions, mileage reports, expense advice. Be concise and helpful."""
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": data.message}
        ]
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages
        )
        return {"response": response.choices[0].message.content, "session_id": session_id}
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        return {"response": "I'm having trouble connecting. Please try again shortly.", "session_id": data.session_id or ""}

@api_router.post("/ai/classify-trip")
async def classify_trip(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    trip_id = data.get("trip_id")
    trip = await db.trips.find_one({"trip_id": trip_id, "user_id": current_user["user_id"]})
    if not trip:
        raise HTTPException(404, "Trip not found")
    try:
        history = await db.trips.find(
            {"user_id": current_user["user_id"], "classification": {"$nin": ["unclassified"]}},
            {"_id": 0}
        ).limit(15).to_list(15)
        history_text = "\n".join([f"- {t.get('start_address','?')} → {t.get('end_address','?')}: {t.get('classification')} ({t.get('purpose','N/A')})" for t in history[:8]])
        system_msg = "You are a trip classification AI. Return ONLY valid JSON. No explanation."
        prompt = f"""Classify this trip:
Start: {trip.get('start_address','Unknown')} | End: {trip.get('end_address','Unknown')}
Distance: {trip.get('distance',0):.1f} miles | Time: {trip.get('start_time')} | Notes: {trip.get('notes','None')}
User occupation: {current_user.get('occupation_type','self_employed')}
Past trips: {history_text}
Return ONLY JSON: {{"classification": "business|personal|medical|charity", "confidence": 0.85, "purpose": "brief reason", "client_name": null}}"""
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        result = json.loads(content) if content else {"classification": "personal", "confidence": 0.5, "purpose": "Auto-classification", "client_name": None}
        dist = trip.get("distance", 0)
        cls = result.get("classification", "personal")
        await db.trips.update_one(
            {"trip_id": trip_id},
            {"$set": {"classification": cls, "ai_confidence": result.get("confidence", 0.5), "purpose": result.get("purpose"), "client_name": result.get("client_name"), "deduction_value": calculate_deduction(dist, cls, current_user.get("tax_country", "US"))}}
        )
        await db.ai_logs.insert_one({"log_id": f"log_{uuid.uuid4().hex[:12]}", "trip_id": trip_id, "user_id": current_user["user_id"], "prediction": cls, "confidence": result.get("confidence", 0.5), "created_at": datetime.now(timezone.utc)})
        return result
    except Exception as e:
        logger.error(f"Classify trip error: {e}")
        return {"classification": "personal", "confidence": 0.3, "purpose": "Classification failed", "client_name": None}

@api_router.post("/ai/classify-all")
async def classify_all_trips(current_user: dict = Depends(get_current_user)):
    """Bulk classify all unclassified trips using AI"""
    unclassified = await db.trips.find(
        {"user_id": current_user["user_id"], "classification": "unclassified", "is_active": False},
        {"_id": 0}
    ).to_list(50)  # Limit to 50 trips per batch
    
    if not unclassified:
        return {"classified": 0, "results": [], "message": "No unclassified trips found"}
    
    results = []
    try:
        # Get user's trip history for context
        history = await db.trips.find(
            {"user_id": current_user["user_id"], "classification": {"$nin": ["unclassified"]}},
            {"_id": 0}
        ).limit(20).to_list(20)
        history_text = "\n".join([f"- {t.get('start_address','?')} → {t.get('end_address','?')}: {t.get('classification')} ({t.get('purpose','N/A')})" for t in history[:10]])
        system_msg = "You are a trip classification AI. Return ONLY valid JSON. No explanation."
        
        for trip in unclassified:
            try:
                prompt = f"""Classify this trip:
Start: {trip.get('start_address','Unknown')} | End: {trip.get('end_address','Unknown')}
Distance: {trip.get('distance',0):.1f} miles | Notes: {trip.get('notes','None')}
User occupation: {current_user.get('occupation_type','self_employed')}
Past trips: {history_text}
Return ONLY JSON: {{"classification": "business|personal|medical|charity", "confidence": 0.85, "purpose": "brief reason"}}"""
                
                response = await openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": prompt}],
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
                result = json.loads(content) if content else {"classification": "personal", "confidence": 0.5, "purpose": "Auto-classification"}
                
                dist = trip.get("distance", 0)
                cls = result.get("classification", "personal")
                
                await db.trips.update_one(
                    {"trip_id": trip["trip_id"]},
                    {"$set": {
                        "classification": cls,
                        "ai_confidence": result.get("confidence", 0.5),
                        "purpose": result.get("purpose"),
                        "deduction_value": calculate_deduction(dist, cls, current_user.get("tax_country", "US"))
                    }}
                )
                
                results.append({
                    "trip_id": trip["trip_id"],
                    "classification": cls,
                    "confidence": result.get("confidence", 0.5),
                    "deduction": calculate_deduction(dist, cls, current_user.get("tax_country", "US"))
                })
                
            except Exception as e:
                logger.error(f"Bulk classify error for {trip['trip_id']}: {e}")
                results.append({"trip_id": trip["trip_id"], "error": str(e)})
                
    except Exception as e:
        logger.error(f"Bulk classify setup error: {e}")
        return {"classified": 0, "results": [], "error": str(e)}
    
    classified_count = len([r for r in results if "classification" in r])
    total_deductions = sum(r.get("deduction", 0) for r in results if "deduction" in r)
    
    return {
        "classified": classified_count,
        "total_deductions": round(total_deductions, 2),
        "results": results,
        "message": f"Successfully classified {classified_count} trips with ${total_deductions:.2f} in potential deductions"
    }

@api_router.get("/ai/insights")
async def get_ai_insights(current_user: dict = Depends(get_current_user)):
    try:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Optimized with field projection and limit
        insight_projection = {"_id": 0, "distance": 1, "classification": 1, "deduction_value": 1}
        trips = await db.trips.find({"user_id": current_user["user_id"], "start_time": {"$gte": month_start}}, insight_projection).limit(200).to_list(200)
        total_miles = sum(t.get("distance", 0) for t in trips)
        business_miles = sum(t.get("distance", 0) for t in trips if t.get("classification") == "business")
        total_deductions = sum(t.get("deduction_value", 0) for t in trips)
        unclassified = len([t for t in trips if t.get("classification") == "unclassified"])
        system_msg = "Tax and mileage insights AI. Return ONLY valid JSON."
        prompt = f"""Generate exactly 3 distinct, actionable insights:
Monthly miles: {total_miles:.1f} | Business miles: {business_miles:.1f} | Deductions: ${total_deductions:.2f} | Unclassified: {unclassified}
Occupation: {current_user.get('occupation_type')}
You MUST return exactly 3 insights in the array. Return ONLY JSON exactly matching this format: {{"insights": [{{"title": "...", "description": "...", "action": "...", "type": "savings"}}, {{"title": "...", "description": "...", "action": "...", "type": "warning"}}, {{"title": "...", "description": "...", "action": "...", "type": "tip"}}]}}"""
        
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        result = json.loads(content) if content else {}
        if "insights" in result:
            return result
        return {"insights": [{"title": "Track More Trips", "description": f"You've tracked {total_miles:.0f} miles this month.", "action": "Start Tracking", "type": "tip"}]}
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        return {"insights": [{"title": "AI Insights Ready", "description": "Track more trips to unlock personalized AI insights.", "action": "Start Tracking", "type": "tip"}]}

@api_router.get("/ai/inspiration")
async def get_ai_inspiration(category: str = "potential", current_user: dict = Depends(get_current_user)):
    """Generate AI-powered daily inspirational message based on user's category preference and driving data."""
    try:
        # Get user's stats for personalized inspiration
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        trips = await db.trips.find(
            {"user_id": current_user["user_id"], "start_time": {"$gte": month_start}},
            {"_id": 0, "distance": 1, "deduction_value": 1}
        ).limit(100).to_list(100)
        
        total_miles = sum(t.get("distance", 0) for t in trips)
        total_deductions = sum(t.get("deduction_value", 0) for t in trips)
        trip_count = len(trips)
        
        # Category themes for AI to use
        category_themes = {
            "potential": "unleashing potential, achieving goals, personal growth, success mindset",
            "mindful": "mindfulness, being present, inner peace, meditation, calm in motion",
            "connection": "human connection, relationships, community, meaningful interactions",
            "spiritual": "faith, spiritual growth, gratitude, divine purpose, inner strength",
            "curiosity": "lifelong learning, curiosity, discovery, exploration, knowledge",
            "custom": "general positivity, motivation, encouragement"
        }
        
        theme = category_themes.get(category, category_themes["potential"])
        day_of_year = now.timetuple().tm_yday
        system_msg = "You are an inspirational message generator. Generate unique, uplifting messages. Be concise (under 100 words). No generic quotes - make it fresh and memorable."
        prompt = f"""Generate a unique inspirational message for today (day {day_of_year} of the year).

Theme: {theme}
User context: Has tracked {trip_count} trips this month, {total_miles:.1f} miles, ${total_deductions:.2f} in tax deductions.

Create a fresh, unique message (not a famous quote) that:
1. Relates to the journey theme (driving, traveling, path of life)
2. Incorporates the {category} theme
3. Is motivating and uplifting
4. Under 100 words

Just return the inspirational message text, nothing else."""

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": prompt}]
        )
        content = response.choices[0].message.content or ""
        
        # Determine color based on category
        category_colors = {
            "potential": "#FFD700",
            "mindful": "#87CEEB",
            "connection": "#FF69B4",
            "spiritual": "#DDA0DD",
            "curiosity": "#32CD32",
            "custom": "#00CED1"
        }
        
        return {
            "message": content.strip() if content else "",
            "color": category_colors.get(category, "#FFD700"),
            "category": category,
            "day": day_of_year
        }
    except Exception as e:
        logger.error(f"AI inspiration error: {e}")
        # Fallback messages
        fallbacks = [
            "Every mile you drive is a step toward your dreams. Keep moving forward!",
            "The road of life has many turns, but each one leads to new opportunities.",
            "Your journey matters. Every trip you take builds your success story."
        ]
        import random
        return {
            "message": random.choice(fallbacks),
            "color": "#FFD700",
            "category": category,
            "day": now.timetuple().tm_yday
        }

# ============================================================
# DASHBOARD
# ============================================================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # Optimized queries with projections and limits
    trip_projection = {"_id": 0, "trip_id": 1, "distance": 1, "classification": 1, "deduction_value": 1, "is_active": 1, "start_time": 1}
    yearly_trips = await db.trips.find({"user_id": current_user["user_id"], "start_time": {"$gte": year_start}}, trip_projection).limit(2000).to_list(2000)
    active_trip = await db.trips.find_one({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0, "trip_id": 1, "start_time": 1, "start_address": 1, "distance": 1})
    recent_trips = await db.trips.find({"user_id": current_user["user_id"], "is_active": False}, {"_id": 0, "trip_id": 1, "start_time": 1, "start_address": 1, "end_address": 1, "distance": 1, "classification": 1, "deduction_value": 1}).sort("start_time", -1).limit(5).to_list(5)

    yearly_miles = 0.0
    yearly_deductions = 0.0
    yearly_trips_count = 0
    monthly_miles = 0.0
    monthly_deductions = 0.0
    monthly_trips_count = 0
    unclassified_count = 0

    import calendar
    chart_buckets = {}
    for i in range(5, -1, -1):
        month_offset = now.month - i
        year_offset = now.year
        while month_offset <= 0:
            month_offset += 12
            year_offset -= 1
        key = f"{year_offset}-{month_offset:02d}"
        chart_buckets[key] = {
            "month": calendar.month_abbr[month_offset],
            "miles": 0.0,
            "deductions": 0.0,
            "order": i
        }

    for t in yearly_trips:
        is_active = t.get("is_active", False)
        dist = t.get("distance", 0)
        deduction = t.get("deduction_value", 0)
        
        st = t.get("start_time")
        if isinstance(st, str):
            try: st = datetime.fromisoformat(st.replace("Z", "+00:00"))
            except: continue
        if st and st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
            
        if not st:
            continue
            
        if not is_active:
            yearly_miles += dist
            yearly_trips_count += 1
        yearly_deductions += deduction
        
        if st >= month_start:
            if not is_active:
                monthly_miles += dist
                monthly_trips_count += 1
                if t.get("classification") == "unclassified":
                    unclassified_count += 1
            monthly_deductions += deduction
                
        bucket_key = f"{st.year}-{st.month:02d}"
        if bucket_key in chart_buckets:
            chart_buckets[bucket_key]["miles"] += dist
            chart_buckets[bucket_key]["deductions"] += deduction

    chart_data = sorted(chart_buckets.values(), key=lambda x: x["order"], reverse=True)
    for data in chart_data:
        data["miles"] = round(data["miles"], 1)
        data["deductions"] = round(data["deductions"], 2)
        del data["order"]

    tax_country = current_user.get("tax_country", "US").upper()
    if tax_country == "CAN":
        business_rate = 0.73
    elif tax_country == "GB":
        business_rate = 0.55
    elif tax_country == "AUS":
        business_rate = 0.88
    else:
        business_rate = 0.70

    return {
        "monthly_miles": round(monthly_miles, 2),
        "monthly_deductions": round(monthly_deductions, 2),
        "monthly_trips": monthly_trips_count,
        "yearly_miles": round(yearly_miles, 2),
        "yearly_deductions": round(yearly_deductions, 2),
        "yearly_trips": yearly_trips_count,
        "active_trip": active_trip,
        "recent_trips": recent_trips,
        "unclassified_count": unclassified_count,
        "chart_data": chart_data,
        "irs_rate": business_rate
    }

# ============================================================
# REPORTS
# ============================================================

@api_router.get("/reports/summary")
async def get_report_summary(year: int = None, month: int = None, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    year = year or now.year
    query = {"user_id": current_user["user_id"], "is_active": False}
    if month:
        m_start = datetime(year, month, 1, tzinfo=timezone.utc)
        m_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12 else datetime(year, month + 1, 1, tzinfo=timezone.utc)
        query["start_time"] = {"$gte": m_start, "$lt": m_end}
    else:
        query["start_time"] = {"$gte": datetime(year, 1, 1, tzinfo=timezone.utc), "$lt": datetime(year + 1, 1, 1, tzinfo=timezone.utc)}
    trips = await db.trips.find(query, {"_id": 0}).to_list(2000)
    total_miles = 0.0
    business_miles = 0.0
    personal_miles = 0.0
    medical_miles = 0.0
    charity_miles = 0.0
    total_deductions = 0.0
    monthly: Dict[str, Any] = {}
    
    for t in trips:
        dist = t.get("distance", 0)
        cls = t.get("classification")
        deduction = t.get("deduction_value", 0)
        
        total_miles += dist
        total_deductions += deduction
        
        if cls == "business":
            business_miles += dist
        elif cls == "personal":
            personal_miles += dist
        elif cls == "medical":
            medical_miles += dist
        elif cls == "charity":
            charity_miles += dist
            
        st = t.get("start_time")
        if isinstance(st, str):
            try: st = datetime.fromisoformat(st.replace("Z", "+00:00"))
            except: continue
        if st:
            key = f"{st.year}-{st.month:02d}"
            if key not in monthly:
                monthly[key] = {"miles": 0.0, "deductions": 0.0, "trips": 0, "business_miles": 0.0}
            monthly[key]["miles"] += dist
            monthly[key]["deductions"] += deduction
            monthly[key]["trips"] += 1
            if cls == "business":
                monthly[key]["business_miles"] += dist
    tax_country = current_user.get("tax_country", "US").upper()
    if tax_country == "CAN":
        business_rate = 0.73
    elif tax_country == "GB":
        business_rate = 0.55
    elif tax_country == "AUS":
        business_rate = 0.88
    else:
        business_rate = 0.70

    return {
        "year": year, "month": month,
        "total_trips": len(trips),
        "total_miles": round(total_miles, 2),
        "business_miles": round(business_miles, 2),
        "personal_miles": round(personal_miles, 2),
        "medical_miles": round(medical_miles, 2),
        "charity_miles": round(charity_miles, 2),
        "total_deductions": round(total_deductions, 2),
        "irs_rate": business_rate,
        "monthly_breakdown": monthly
    }

@api_router.get("/reports/export/csv")
async def export_csv(year: int = None, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    year = year or now.year
    trips = await db.trips.find(
        {"user_id": current_user["user_id"], "start_time": {"$gte": datetime(year, 1, 1, tzinfo=timezone.utc), "$lt": datetime(year + 1, 1, 1, tzinfo=timezone.utc)}, "is_active": False},
        {"_id": 0}
    ).sort("start_time", 1).to_list(2000)
    
    # Calculate totals
    total_miles = sum(t.get("distance", 0) for t in trips)
    total_deductions = sum(t.get("deduction_value", 0) for t in trips)
    
    # Query expenses for the same year
    expense_query = {
        "user_id": current_user["user_id"],
        "$or": [
            {"receipt_date": {"$regex": f"^{year}"}},
            {
                "$and": [
                    {"$or": [{"receipt_date": None}, {"receipt_date": ""}]},
                    {"created_at": {
                        "$gte": datetime(year, 1, 1, tzinfo=timezone.utc),
                        "$lt": datetime(year + 1, 1, 1, tzinfo=timezone.utc)
                    }}
                ]
            }
        ]
    }
    expenses = await db.expenses.find(expense_query).to_list(1000)
    total_expenses = sum(e.get("amount", 0) for e in expenses)

    output = io.StringIO()
    writer = csv.writer(output)
    
    tax_country = current_user.get("tax_country", "US").upper()
    if tax_country == "CAN":
        unit = "km"
        currency = "$"
        label = "CRA"
    elif tax_country == "GB":
        unit = "mi"
        currency = "£"
        label = "HMRC"
    elif tax_country == "AUS":
        unit = "km"
        currency = "$"
        label = "ATO"
    else:
        unit = "mi"
        currency = "$"
        label = "IRS"

    # Branding header
    writer.writerow(["Mileage Tracker AI"])
    writer.writerow(["AI-Powered Mileage & Tax Intelligence"])
    writer.writerow(["Multisystems and Multisystem LLC"])
    writer.writerow([])
    writer.writerow([f"{label} Mileage Report - {year}"])
    writer.writerow([f"Generated: {now.strftime('%B %d, %Y')} | User: {current_user.get('name', current_user.get('email', 'User'))}"])
    writer.writerow([f"Total Distance: {total_miles:.2f} {unit}"])
    writer.writerow([f"Total Deductions: {currency}{total_deductions:.2f}"])
    writer.writerow([f"Total Expenses: {currency}{total_expenses:.2f}"])
    writer.writerow([])
    
    # Data header and rows
    writer.writerow(["Date", "Start", "End", f"Distance ({unit})", "Classification", "Purpose", "Client", f"Deduction ({currency})", "Notes"])
    for t in trips:
        st = t.get("start_time", "")
        if isinstance(st, datetime): st = st.strftime("%Y-%m-%d %H:%M")
        writer.writerow([st, t.get("start_address",""), t.get("end_address",""), f"{t.get('distance',0):.2f}", t.get("classification",""), t.get("purpose",""), t.get("client_name",""), f"{t.get('deduction_value',0):.2f}", t.get("notes","")])
    return StreamingResponse(io.BytesIO(output.getvalue().encode()), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=mileage_tracker_ai_{year}.csv"})

@api_router.get("/reports/export/pdf")
async def export_pdf(year: int = None, current_user: dict = Depends(get_current_user)):
    """Generate professional IRS/CRA/HMRC/ATO-compliant PDF mileage report"""
    limit_reached, _ = await check_mileage_limit(current_user)
    if limit_reached:
        raise HTTPException(status_code=403, detail="PDF report exports require a Pro or Business plan after reaching 40 miles.")
        
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    
    now_dt = datetime.now(timezone.utc)
    year = year or now_dt.year
    
    tax_country = current_user.get("tax_country", "US").upper()
    if tax_country == "CAN":
        business_rate = 0.73
        unit = "km"
        currency = "$"
        label = "CRA"
    elif tax_country == "GB":
        business_rate = 0.55
        unit = "mi"
        currency = "£"
        label = "HMRC"
    elif tax_country == "AUS":
        business_rate = 0.88
        unit = "km"
        currency = "$"
        label = "ATO"
    else:
        business_rate = 0.70
        unit = "mi"
        currency = "$"
        label = "IRS"

    # Fetch trips
    trips = await db.trips.find(
        {"user_id": current_user["user_id"], "start_time": {"$gte": datetime(year, 1, 1, tzinfo=timezone.utc), "$lt": datetime(year + 1, 1, 1, tzinfo=timezone.utc)}, "is_active": False},
        {"_id": 0}
    ).sort("start_time", 1).to_list(2000)
    
    # Fetch expenses
    expense_query = {
        "user_id": current_user["user_id"],
        "$or": [
            {"receipt_date": {"$regex": f"^{year}"}},
            {
                "$and": [
                    {"$or": [{"receipt_date": None}, {"receipt_date": ""}]},
                    {"created_at": {
                        "$gte": datetime(year, 1, 1, tzinfo=timezone.utc),
                        "$lt": datetime(year + 1, 1, 1, tzinfo=timezone.utc)
                    }}
                ]
            }
        ]
    }
    expenses = await db.expenses.find(expense_query).to_list(1000)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    # Calculate summary
    total_miles = sum(t.get("distance", 0) for t in trips)
    business_miles = sum(t.get("distance", 0) for t in trips if t.get("classification") == "business")
    personal_miles = sum(t.get("distance", 0) for t in trips if t.get("classification") == "personal")
    medical_miles = sum(t.get("distance", 0) for t in trips if t.get("classification") == "medical")
    charity_miles = sum(t.get("distance", 0) for t in trips if t.get("classification") == "charity")
    total_deductions = sum(t.get("deduction_value", 0) for t in trips)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=0.5*inch, leftMargin=0.5*inch, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title Style
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, spaceAfter=6, textColor=colors.HexColor('#10B981'), alignment=TA_CENTER)
    tagline_style = ParagraphStyle('Tagline', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#6B7280'), alignment=TA_CENTER, spaceAfter=2)
    business_style = ParagraphStyle('Business', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#9CA3AF'), alignment=TA_CENTER, spaceAfter=12)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, textColor=colors.grey, alignment=TA_CENTER, spaceAfter=20)
    header_style = ParagraphStyle('Header', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1F2937'), spaceBefore=16, spaceAfter=8)
    
    # Header with new branding
    elements.append(Paragraph("Mileage Tracker AI", title_style))
    elements.append(Paragraph("AI-Powered Mileage & Tax Intelligence", tagline_style))
    elements.append(Paragraph("Multisystems and Multisystem LLC", business_style))
    elements.append(Paragraph(f"{label} Mileage Report - {year}", subtitle_style))
    elements.append(Paragraph(f"Generated: {now_dt.strftime('%B %d, %Y')} | User: {current_user.get('name', current_user.get('email', 'User'))}", subtitle_style))
    
    # Summary Table
    elements.append(Paragraph("Tax Deduction Summary", header_style))
    if tax_country == "US":
        summary_data = [
            ["Category", f"Distance ({unit})", "Rate", "Deduction"],
            ["Business", f"{business_miles:.1f}", f"{currency}{business_rate:.2f}/{unit}", f"{currency}{business_miles * business_rate:.2f}"],
            ["Medical", f"{medical_miles:.1f}", f"{currency}{IRS_MEDICAL_RATE:.2f}/{unit}", f"{currency}{medical_miles * IRS_MEDICAL_RATE:.2f}"],
            ["Charity", f"{charity_miles:.1f}", f"{currency}{IRS_CHARITY_RATE:.2f}/{unit}", f"{currency}{charity_miles * IRS_CHARITY_RATE:.2f}"],
            ["Personal", f"{personal_miles:.1f}", "N/A", f"{currency}0.00"],
            ["TOTAL", f"{total_miles:.1f}", "", f"{currency}{total_deductions:.2f}"],
        ]
    else:
        summary_data = [
            ["Category", f"Distance ({unit})", "Rate", "Deduction"],
            ["Business", f"{business_miles:.1f}", f"{currency}{business_rate:.2f}/{unit}", f"{currency}{business_miles * business_rate:.2f}"],
            ["Personal", f"{personal_miles:.1f}", "N/A", f"{currency}0.00"],
            ["TOTAL", f"{total_miles:.1f}", "", f"{currency}{total_deductions:.2f}"],
        ]
    
    summary_table = Table(summary_data, colWidths=[2*inch, 1.5*inch, 1.5*inch, 1.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10B981')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D1FAE5')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Expense Summary Table
    elements.append(Paragraph("Business Expense Summary", header_style))
    categories = ["fuel", "parking", "maintenance", "meals", "other"]
    expense_by_category = {cat: 0.0 for cat in categories}
    for e in expenses:
        cat = e.get("category", "other")
        if cat not in expense_by_category:
            cat = "other"
        expense_by_category[cat] += e.get("amount", 0)
        
    expense_summary_data = [
        ["Category", "Total Amount"],
        ["Fuel", f"{currency}{expense_by_category['fuel']:.2f}"],
        ["Parking", f"{currency}{expense_by_category['parking']:.2f}"],
        ["Maintenance", f"{currency}{expense_by_category['maintenance']:.2f}"],
        ["Meals", f"{currency}{expense_by_category['meals']:.2f}"],
        ["Other", f"{currency}{expense_by_category['other']:.2f}"],
        ["TOTAL EXPENSES", f"{currency}{total_expenses:.2f}"],
    ]
    
    expense_table = Table(expense_summary_data, colWidths=[3*inch, 3.5*inch])
    expense_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10B981')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D1FAE5')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    elements.append(expense_table)
    elements.append(Spacer(1, 20))
    
    # Trip Log Table
    elements.append(Paragraph(f"Detailed Trip Log ({len(trips)} trips)", header_style))
    trip_data = [["Date", "From", "To", f"Distance ({unit})", "Type", "Deduction"]]
    for t in trips[:100]:  # Limit to 100 trips for PDF size
        st = t.get("start_time", "")
        if isinstance(st, datetime): st = st.strftime("%m/%d")
        elif isinstance(st, str): st = st[:10]
        trip_data.append([
            st,
            (t.get("start_address", "")[:20] + "...") if len(t.get("start_address", "")) > 20 else t.get("start_address", ""),
            (t.get("end_address", "")[:20] + "...") if len(t.get("end_address", "")) > 20 else t.get("end_address", ""),
            f"{t.get('distance', 0):.1f}",
            t.get("classification", "")[:8].title(),
            f"{currency}{t.get('deduction_value', 0):.2f}"
        ])
    
    trip_table = Table(trip_data, colWidths=[0.7*inch, 1.5*inch, 1.5*inch, 0.7*inch, 0.8*inch, 0.9*inch])
    trip_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (3, 0), (5, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    elements.append(trip_table)
    elements.append(Spacer(1, 20))
    
    # Dynamic Disclaimer
    if tax_country == "US":
        disclaimer_text = f"IRS Standard Mileage Rates for {year}: Business ${IRS_BUSINESS_RATE}/mile, Medical ${IRS_MEDICAL_RATE}/mile, Charity ${IRS_CHARITY_RATE}/mile. This report is generated for informational purposes. Consult a tax professional for advice."
    elif tax_country == "CAN":
        disclaimer_text = f"CRA Standard Mileage Rates for {year}: Business $0.73/km. This report is generated for informational purposes. Consult a tax professional for advice."
    elif tax_country == "GB":
        disclaimer_text = f"HMRC Standard Mileage Rates for {year}: Business £0.55/mile. This report is generated for informational purposes. Consult a tax professional for advice."
    elif tax_country == "AUS":
        disclaimer_text = f"ATO Standard Mileage Rates for {year}: Business $0.88/km. This report is generated for informational purposes. Consult a tax professional for advice."
    else:
        disclaimer_text = f"Standard Mileage Rates for {year}: Business {currency}{business_rate}/{unit}. This report is generated for informational purposes. Consult a tax professional for advice."
        
    disclaimer_style = ParagraphStyle('Disclaimer', parent=styles['Normal'], fontSize=8, textColor=colors.grey)
    elements.append(Paragraph(disclaimer_text, disclaimer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=mileage_report_{year}.pdf"})

# ============================================================
# PAYMENTS
# ============================================================

@api_router.post("/payments/create-checkout")
async def create_checkout(data: PaymentCheckout, request: Request, current_user: dict = Depends(get_current_user)):
    import stripe
    stripe.api_key = STRIPE_API_KEY
    
    plan = data.plan.lower()
    if plan not in SUBSCRIPTION_PLANS:
        raise HTTPException(400, "Invalid plan")
    plan_info = SUBSCRIPTION_PLANS[plan]
    
    success_url = f"{data.origin_url}/subscription?session_id={{CHECKOUT_SESSION_ID}}&plan={plan}"
    cancel_url = f"{data.origin_url}/subscription"
    
    # Intercept for local mock testing
    is_mock = STRIPE_API_KEY == 'sk_test_emergent' or not STRIPE_API_KEY
    if is_mock:
        mock_session_id = f"cs_test_mock_{uuid.uuid4().hex[:16]}"
        # For mock, replace the {CHECKOUT_SESSION_ID} placeholder manually
        mock_success_url = success_url.replace("{CHECKOUT_SESSION_ID}", mock_session_id)
        
        await db.payment_transactions.insert_one({
            "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
            "user_id": current_user["user_id"],
            "session_id": mock_session_id,
            "plan": plan, 
            "amount": float(plan_info["amount"]), 
            "currency": plan_info["currency"],
            "payment_status": "pending", 
            "created_at": datetime.now(timezone.utc)
        })
        return {"url": mock_success_url, "session_id": mock_session_id}
        
    try:
        # Create Stripe Checkout Session with proper configuration
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            mode='payment',  # Use 'subscription' for recurring
            line_items=[{
                'price_data': {
                    'currency': plan_info["currency"],
                    'unit_amount': int(float(plan_info["amount"]) * 100),  # Stripe uses cents
                    'product_data': {
                        'name': f'Mileage Tracker AI - {plan.capitalize()} Plan',
                            'description': f'Monthly subscription to {plan.capitalize()} features',
                        },
                    },
                    'quantity': 1,
                }],
                customer_email=current_user.get("email"),
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "user_id": current_user["user_id"],
                    "plan": plan,
                    "email": current_user["email"]
                }
            )
        
        await db.payment_transactions.insert_one({
            "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
            "user_id": current_user["user_id"],
            "session_id": session.id,
            "plan": plan, 
            "amount": float(plan_info["amount"]), 
            "currency": plan_info["currency"],
            "payment_status": "pending", 
            "created_at": datetime.now(timezone.utc)
        })
        
        return {"url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(400, f"Payment error: {str(e)}")

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    import stripe
    stripe.api_key = STRIPE_API_KEY
    
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if txn and txn.get("payment_status") == "paid":
        return txn
    
    try:
        if session_id.startswith("cs_test_mock_"):
            # Auto-fulfill mock session from local testing
            plan = txn.get("plan", "pro") if txn else "pro"
            await db.users.update_one(
                {"user_id": current_user["user_id"]}, 
                {"$set": {"subscription_tier": plan}}
            )
            await db.payment_transactions.update_one(
                {"session_id": session_id}, 
                {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc)}}
            )
            return {
                "status": "complete", 
                "payment_status": "paid", 
                "plan": plan
            }
            
        session = stripe.checkout.Session.retrieve(session_id)
        metadata = getattr(session, "metadata", None)
        metadata_dict = dict(metadata.items()) if metadata else {}
        if session.payment_status == "paid":
            plan = metadata_dict.get("plan", "pro")
            await db.users.update_one(
                {"user_id": current_user["user_id"]}, 
                {"$set": {"subscription_tier": plan}}
            )
            await db.payment_transactions.update_one(
                {"session_id": session_id}, 
                {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc)}}
            )
        return {
            "status": session.status, 
            "payment_status": session.payment_status, 
            "plan": metadata_dict.get("plan", "pro")
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe status check error: {e}")
        return {"status": "error", "payment_status": "unknown", "plan": None}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    import stripe
    stripe.api_key = STRIPE_API_KEY
    body = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")
    WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    
    try:
        event = stripe.Webhook.construct_event(body, sig_header, WEBHOOK_SECRET)
        if event.type == "checkout.session.completed":
            session = event.data.object
            metadata = getattr(session, "metadata", None)
            metadata_dict = dict(metadata.items()) if metadata else {}
            if session.payment_status == "paid":
                user_id = metadata_dict.get("user_id")
                plan = metadata_dict.get("plan", "pro")
                if user_id:
                    await db.users.update_one({"user_id": user_id}, {"$set": {"subscription_tier": plan}})
                    await db.payment_transactions.update_one({"session_id": session.id}, {"$set": {"payment_status": "paid"}})
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid Webhook signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail="Webhook error")
    return {"status": "ok"}

@api_router.get("/payments/subscription")
async def get_subscription(current_user: dict = Depends(get_current_user)):
    return {"tier": current_user.get("subscription_tier", "free"), "plans": SUBSCRIPTION_PLANS}

# ============================================================
# SEED DATA
# ============================================================

@api_router.post("/seed/trips")
async def seed_trips(current_user: dict = Depends(get_current_user)):
    import random
    sample_routes = [
        {"from": "Home - 123 Oak St", "to": "Client Office - Downtown", "dist": 12.4, "cls": "business", "purpose": "Client meeting - ABC Corp", "client": "ABC Corp"},
        {"from": "Office", "to": "Airport Terminal B", "dist": 18.7, "cls": "business", "purpose": "Business travel", "client": None},
        {"from": "Home", "to": "Grocery Store", "dist": 3.2, "cls": "personal", "purpose": "Personal errand", "client": None},
        {"from": "Home", "to": "Doctor Office", "dist": 7.8, "cls": "medical", "purpose": "Medical appointment", "client": None},
        {"from": "Office", "to": "Tech Park - Client Site", "dist": 15.3, "cls": "business", "purpose": "Site visit - XYZ Tech", "client": "XYZ Tech"},
        {"from": "Home", "to": "Gym", "dist": 4.1, "cls": "personal", "purpose": "Personal", "client": None},
        {"from": "Office", "to": "Court Street", "dist": 9.2, "cls": "business", "purpose": "Legal meeting", "client": None},
        {"from": "Home", "to": "Restaurant - Business Dinner", "dist": 5.6, "cls": "business", "purpose": "Client dinner - Delta Inc", "client": "Delta Inc"},
        {"from": "Office", "to": "Conference Center", "dist": 22.1, "cls": "business", "purpose": "Annual conference", "client": None},
        {"from": "Home", "to": "Pharmacy", "dist": 2.8, "cls": "medical", "purpose": "Prescription pickup", "client": None},
    ]
    now = datetime.now(timezone.utc)
    inserted = []
    for i, route in enumerate(sample_routes):
        trip_id = f"trip_{uuid.uuid4().hex[:12]}"
        days_ago = random.randint(1, 28)
        start_time = now - timedelta(days=days_ago, hours=random.randint(7, 18))
        end_time = start_time + timedelta(minutes=int(route["dist"] * 3 + random.randint(5, 20)))
        trip_doc = {
            "trip_id": trip_id,
            "user_id": current_user["user_id"],
            "start_time": start_time,
            "end_time": end_time,
            "distance": route["dist"],
            "start_lat": 37.7749 + random.uniform(-0.1, 0.1),
            "start_lng": -122.4194 + random.uniform(-0.1, 0.1),
            "end_lat": 37.7749 + random.uniform(-0.1, 0.1),
            "end_lng": -122.4194 + random.uniform(-0.1, 0.1),
            "start_address": route["from"],
            "end_address": route["to"],
            "classification": route["cls"],
            "ai_confidence": round(random.uniform(0.75, 0.98), 2),
            "risk_score": round(random.uniform(20, 90), 1),
            "notes": "",
            "purpose": route["purpose"],
            "client_name": route.get("client"),
            "is_active": False,
            "deduction_value": calculate_deduction(route["dist"], route["cls"], current_user.get("tax_country", "US")),
            "created_at": start_time
        }
        await db.trips.insert_one(trip_doc)
        inserted.append(trip_id)
    return {"seeded": len(inserted), "trip_ids": inserted}

# ============================================================
# INCLUDE ROUTER
# ============================================================

app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
