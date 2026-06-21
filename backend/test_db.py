import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import certifi

async def main():
    MONGO_URI="mongodb+srv://multisystemsbiz_db_user:8MxBrkHOJ1akzXuW@cluster0.zxoldq6.mongodb.net/?appName=Cluster0"
    client = AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client["multimile_db"]
    trips = await db.trips.find({}).sort("created_at", -1).limit(10).to_list(10)
    for t in trips:
        print(f"Trip: {t.get('trip_id')}, dist: {t.get('distance')}, active: {t.get('is_active')}, class: {t.get('classification')}")

if __name__ == "__main__":
    asyncio.run(main())

