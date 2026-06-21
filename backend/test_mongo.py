import motor.motor_asyncio
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
client = motor.motor_asyncio.AsyncIOMotorClient(os.getenv('MONGO_URI'))

async def run_mongo_test():
    print('Connecting...')
    try:
        user = await client[os.getenv('DB_NAME')].users.find_one({})
        print('User:', user)
    except Exception as e:
        print("Error:", e)

asyncio.run(run_mongo_test())
