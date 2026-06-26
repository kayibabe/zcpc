"""
One-time script to create the initial admin user.
Run from backend/ directory:  python seed_admin.py
"""
import asyncio
import sys
import os

# Ensure we can import app modules
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import engine, Base
from app.core.security import hash_password
from app.models.user import User, UserRole
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine) as db:
        # Check if admin already exists
        result = await db.execute(select(User).where(User.employee_id == "ADMIN001"))
        existing = result.scalar_one_or_none()

        if existing:
            print("Admin user already exists — skipping.")
        else:
            admin = User(
                employee_id="ADMIN001",
                full_name="System Administrator",
                email="admin@zcpc.mw",
                password_hash=hash_password("Admin@zcpc2024"),
                role=UserRole.admin,
                department="Administration",
                is_active=True,
            )
            db.add(admin)
            await db.commit()
            print("Admin user created successfully.")
            print("  Employee ID : ADMIN001")
            print("  Password    : Admin@zcpc2024")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
